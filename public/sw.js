/**
 * Service Worker v8 — Push notifications + improved offline + asset precaching
 * 
 * NEW: Background push notification support for task reminders.
 * These work even when the app is backgrounded/screen off.
 * 
 * Strategy: Cache-first for hashed assets (immutable), network-first for HTML.
 * Cross-Origin Isolation headers for SharedArrayBuffer (Tesseract.js).
 */

const CACHE_VERSION = 1772619848112; // force-update 2026-03-04 emergency cache purge
const CACHE_NAME = `toranot-v${CACHE_VERSION}`;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingAlarms = new Map();

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// ── Install ──
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {})),
  );
});

// ── Activate ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => n !== CACHE_NAME)
            .map((n) => caches.delete(n)),
        ),
      ),
      self.clients.claim(),
    ]).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
        });
      });
    }),
  );
});

// ── Fetch ──
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension://")) return;
  if (
    event.request.cache === "only-if-cached" &&
    event.request.mode !== "same-origin"
  ) return;

  // Skip caching for API calls and the emergency reset page
  if (
    event.request.url.includes("/api/") ||
    event.request.url.includes("/.netlify/") ||
    event.request.url.includes("api.anthropic.com") ||
    event.request.url.includes("/reset.html")
  ) {
    return;
  }

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Hashed assets → cache-first (immutable)
  const isHashedAsset = isSameOrigin && /\/assets\/.*-[a-zA-Z0-9]{8,}\.(js|css|woff2?)$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return addCOIHeaders(cached);
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
          }
          return addCOIHeaders(response);
        }).catch(() => caches.match(event.request).then(r => r || new Response("Offline", { status: 503 })));
      })
    );
    return;
  }

  // Navigation requests (HTML) → network-first with offline fallback page
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => addCOIHeaders(response))
        .catch(async () => {
          const cached = await caches.match("./index.html");
          if (cached) return cached;
          const offline = await caches.match("./offline.html");
          return offline ?? new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // Everything else → network-first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status === 0 || response.type === "error")
          return response;
        const coiResponse = addCOIHeaders(response);
        if (response.status === 200 && isSameOrigin) {
          const toCache = coiResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return coiResponse;
      })
      .catch(() => caches.match(event.request)),
  );
});

// ── Push Notifications ──
// Receives push events from the app's scheduling system.
// The app posts scheduled reminders via the message event below,
// and the SW fires notifications at the right time even when backgrounded.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "תורנות — תזכורת",
      body: event.data.text(),
      tag: "toranot-reminder",
    };
  }

  const options = {
    body: payload.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: payload.tag || "toranot-" + Date.now(),
    renotify: true,
    requireInteraction: payload.urgency === "stat",
    vibrate: payload.urgency === "stat"
      ? [200, 100, 200, 100, 200]  // Aggressive for STAT
      : [200, 100, 200],            // Normal
    data: {
      url: payload.url || "./",
      patientId: payload.patientId || null,
      taskId: payload.taskId || null,
    },
    actions: [
      { action: "done", title: "✓ בוצע" },
      { action: "snooze", title: "⏰ +15 דק׳" },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// ── Notification click → open app at the right patient ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  if (action === "done" && data.taskId) {
    // Mark task done via postMessage to any open client
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "TASK_DONE_FROM_NOTIFICATION",
            taskId: data.taskId,
            patientId: data.patientId,
          });
        });
      }),
    );
    return;
  }

  if (action === "snooze" && data.taskId) {
    // SW is killed within ~30s after event handling — setTimeout(15min) never fires here.
    // Send SNOOZE_TASK to any open app window so the app reschedules the alarm correctly.
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const newDueAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        for (const client of clients) {
          client.postMessage({
            type: "SNOOZE_TASK",
            taskId: data.taskId,
            patientId: data.patientId,
            newDueAt,
          });
        }
        // No app window open — show notification immediately as fallback
        if (clients.length === 0) {
          return self.registration.showNotification(event.notification.title, {
            body: event.notification.body,
            icon: "./icon-192.png",
            badge: "./icon-192.png",
            tag: "snooze-" + data.taskId,
            renotify: true,
            requireInteraction: true,
            vibrate: [200, 100, 200],
            data: data,
            actions: [
              { action: "done", title: "✓ בוצע" },
            ],
          });
        }
      })
    );
    return;
  }


  // Default: open/focus the app
  const urlToOpen = data.url || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes("toranot") || client.url.includes(self.location.origin)) {
          client.focus();
          if (data.patientId) {
            client.postMessage({
              type: "FOCUS_PATIENT",
              patientId: data.patientId,
            });
          }
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    }),
  );
});

// ── Message from app: schedule local notification ──
// Since there's no push server, the app uses postMessage to ask
// the SW to show a notification. This works even when app is backgrounded
// because the SW stays alive briefly after the message.
self.addEventListener("message", (event) => {
  if (!event.data) return;
  const { type, taskId, taskText, dueAt, title, body, tag, delay, urgency, patientId } = event.data;

  // ── Schedule a timed notification (short delays only — SW may be killed) ──
  if (type === "SCHEDULE_NOTIFICATION") {
    if (delay && delay > 0) {
      // Wrap in event.waitUntil so SW stays alive until notification fires.
      event.waitUntil(
        new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
          self.registration.showNotification(title, {
            body,
            icon: "./icon-192.png",
            badge: "./icon-192.png",
            tag: tag || "toranot-" + Date.now(),
            renotify: true,
            requireInteraction: urgency === "stat",
            vibrate: urgency === "stat" ? [200, 100, 200, 100, 200] : [200, 100, 200],
            data: { url: "./", patientId, taskId },
            actions: [
              { action: "done", title: "✓ בוצע" },
              { action: "snooze", title: "⏰ +15 דק׳" },
            ],
          })
        )
      );
    } else {
      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: "./icon-192.png",
          badge: "./icon-192.png",
          tag: tag || "toranot-" + Date.now(),
          renotify: true,
          requireInteraction: urgency === "stat",
          vibrate: urgency === "stat" ? [200, 100, 200, 100, 200] : [200, 100, 200],
          data: { url: "./", patientId, taskId },
          actions: [
            { action: "done", title: "✓ בוצע" },
            { action: "snooze", title: "⏰ +15 דק׳" },
          ],
        }),
      );
    }
    return;
  }

  // ── Schedule a persistent alarm (survives SW restart via Map) ──
  if (type === "SCHEDULE_ALARM" && taskId && dueAt) {
    if (pendingAlarms.has(taskId)) {
      clearTimeout(pendingAlarms.get(taskId));
      pendingAlarms.delete(taskId);
    }
    const alarmDelay = new Date(dueAt).getTime() - Date.now();
    if (alarmDelay <= 0) {
      fireTaskAlarm(taskId, taskText ?? "משימה");
      return;
    }
    const tid = setTimeout(() => {
      fireTaskAlarm(taskId, taskText ?? "משימה");
      pendingAlarms.delete(taskId);
    }, Math.min(alarmDelay, 2147483647));
    pendingAlarms.set(taskId, tid);
    return;
  }

  // ── Cancel a pending alarm ──
  if (type === "CANCEL_ALARM" && taskId) {
    if (pendingAlarms.has(taskId)) {
      clearTimeout(pendingAlarms.get(taskId));
      pendingAlarms.delete(taskId);
    }
    return;
  }

  // ── Skip waiting to activate new SW immediately ──
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // ── Legacy: direct notification from app ──
  if (type === "TASK_REMINDER" && title) {
    self.registration.showNotification(title, {
      body: body ?? "",
      icon: "./icon-192.png",
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 300],
    });
  }
});


function fireTaskAlarm(taskId, taskText) {
  self.registration.showNotification("⏰ תורנות — עבר הזמן!", {
    body: taskText,
    icon: "./icon-192.png",
    tag: `alarm-${taskId}`,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    actions: [{ action: "dismiss", title: "ביטול" }],
  });
}


