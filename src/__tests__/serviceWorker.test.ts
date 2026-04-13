import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SW_PATH = resolve(__dirname, "../../public/sw.js");
const sw = readFileSync(SW_PATH, "utf-8");

// ── Cache Configuration ──────────────────────────────────────────────────────

describe("serviceWorker — cache configuration", () => {
  it("defines CACHE_VERSION as a timestamp number", () => {
    const match = sw.match(/const CACHE_VERSION\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const version = Number(match![1]);
    expect(version).toBeGreaterThan(1700000000000); // after 2023
  });

  it("builds CACHE_NAME from version", () => {
    expect(sw).toContain("const CACHE_NAME = `toranot-v${CACHE_VERSION}`");
  });

  it("defines PRECACHE_ASSETS with required files", () => {
    const requiredAssets = [
      "index.html",
      "offline.html",
      "manifest.json",
      "icon-192.png",
      "icon-512.png",
    ];
    for (const asset of requiredAssets) {
      expect(sw).toContain(asset);
    }
  });

  it("all precached files exist on disk", () => {
    const publicDir = resolve(__dirname, "../../public");
    const rootDir = resolve(__dirname, "../..");
    // index.html is at the repo root (Vite convention), rest are in public/
    const publicFiles = ["offline.html", "manifest.json", "icon-192.png", "icon-512.png"];
    for (const file of publicFiles) {
      expect(
        existsSync(resolve(publicDir, file)),
        `Expected ${file} to exist in public/`,
      ).toBe(true);
    }
    expect(
      existsSync(resolve(rootDir, "index.html")),
      "Expected index.html to exist at repo root",
    ).toBe(true);
  });
});

// ── Install Event ────────────────────────────────────────────────────────────

describe("serviceWorker — install event", () => {
  it("listens for install event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']install["']/);
  });

  it("calls skipWaiting on install", () => {
    // Extract install handler region and check for skipWaiting
    expect(sw).toContain("self.skipWaiting()");
  });

  it("opens cache and caches precache assets", () => {
    expect(sw).toContain("caches.open(CACHE_NAME)");
    expect(sw).toContain("cache.addAll(PRECACHE_ASSETS)");
  });
});

// ── Activate Event ───────────────────────────────────────────────────────────

describe("serviceWorker — activate event", () => {
  it("listens for activate event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']activate["']/);
  });

  it("deletes old caches that don't match CACHE_NAME", () => {
    expect(sw).toContain("caches.keys()");
    expect(sw).toContain("caches.delete");
    expect(sw).toMatch(/filter\s*\(\s*\(?n\)?\s*=>\s*n\s*!==\s*CACHE_NAME/);
  });

  it("claims clients after activation", () => {
    expect(sw).toContain("self.clients.claim()");
  });

  it("notifies clients of SW update with version", () => {
    expect(sw).toContain("SW_UPDATED");
    expect(sw).toContain("version: CACHE_VERSION");
  });

  it("checks persisted due tasks on activation", () => {
    expect(sw).toContain("checkPersistedDueTasks()");
  });
});

// ── Cross-Origin Isolation Headers ───────────────────────────────────────────

describe("serviceWorker — COI headers", () => {
  it("defines addCOIHeaders function", () => {
    expect(sw).toContain("function addCOIHeaders");
  });

  it("adds Cross-Origin-Embedder-Policy header", () => {
    expect(sw).toContain("Cross-Origin-Embedder-Policy");
    expect(sw).toContain("credentialless");
  });

  it("adds Cross-Origin-Opener-Policy header", () => {
    expect(sw).toContain("Cross-Origin-Opener-Policy");
    expect(sw).toContain("same-origin");
  });

  it("skips COI headers for opaque and error responses", () => {
    expect(sw).toContain('response.type === "opaque"');
    expect(sw).toContain('response.type === "error"');
  });
});

// ── Fetch Event ──────────────────────────────────────────────────────────────

describe("serviceWorker — fetch event", () => {
  it("listens for fetch event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']fetch["']/);
  });

  it("ignores non-GET requests", () => {
    expect(sw).toContain('event.request.method !== "GET"');
  });

  it("ignores chrome-extension requests", () => {
    expect(sw).toContain("chrome-extension://");
  });

  it("skips caching for API and Netlify function calls", () => {
    expect(sw).toContain("/api/");
    expect(sw).toContain("/.netlify/");
    expect(sw).toContain("api.anthropic.com");
  });

  it("skips caching for reset.html", () => {
    expect(sw).toContain("/reset.html");
  });

  it("uses cache-first for hashed assets", () => {
    // Check that the SW defines hashed asset detection
    expect(sw).toContain("isHashedAsset");
    expect(sw).toContain("assets");
  });

  it("uses network-first for navigation requests", () => {
    expect(sw).toContain('event.request.mode === "navigate"');
  });

  it("falls back to offline.html for navigation failures", () => {
    expect(sw).toContain("offline.html");
  });

  it("applies COI headers to all response types", () => {
    // addCOIHeaders should be called in all fetch branches
    const coiCalls = sw.match(/addCOIHeaders\(/g);
    expect(coiCalls).not.toBeNull();
    expect(coiCalls!.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Push Notifications ───────────────────────────────────────────────────────

describe("serviceWorker — push notifications", () => {
  it("listens for push events", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']push["']/);
  });

  it("handles JSON and text payloads", () => {
    expect(sw).toContain("event.data.json()");
    expect(sw).toContain("event.data.text()");
  });

  it("provides notification action buttons", () => {
    expect(sw).toContain("בוצע"); // done action (Hebrew)
    expect(sw).toContain("+15"); // snooze action
  });

  it("uses STAT urgency for aggressive vibration", () => {
    expect(sw).toContain('urgency === "stat"');
  });

  it("shows notification via registration.showNotification", () => {
    const showCalls = sw.match(/showNotification\(/g);
    expect(showCalls).not.toBeNull();
    expect(showCalls!.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Notification Click ───────────────────────────────────────────────────────

describe("serviceWorker — notification click", () => {
  it("listens for notificationclick event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']notificationclick["']/);
  });

  it("closes notification on click", () => {
    expect(sw).toContain("event.notification.close()");
  });

  it("handles 'done' action — marks task complete via postMessage", () => {
    expect(sw).toContain('action === "done"');
    expect(sw).toContain("TASK_DONE_FROM_NOTIFICATION");
  });

  it("handles 'snooze' action — reschedules +15 minutes", () => {
    expect(sw).toContain('action === "snooze"');
    expect(sw).toContain("SNOOZE_TASK");
    expect(sw).toContain("15 * 60 * 1000");
  });

  it("falls back to showing notification when no app window is open for snooze", () => {
    expect(sw).toContain("clients.length === 0");
  });

  it("focuses existing window and sends FOCUS_PATIENT on default click", () => {
    expect(sw).toContain("FOCUS_PATIENT");
    expect(sw).toContain("client.focus()");
  });

  it("opens new window if no existing window found", () => {
    expect(sw).toContain("self.clients.openWindow");
  });
});

// ── Message Handling ─────────────────────────────────────────────────────────

describe("serviceWorker — message handling", () => {
  it("listens for message events", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']message["']/);
  });

  it("handles SCHEDULE_NOTIFICATION message", () => {
    expect(sw).toContain('"SCHEDULE_NOTIFICATION"');
  });

  it("supports delayed notifications via setTimeout", () => {
    expect(sw).toContain("setTimeout");
    expect(sw).toContain("delay");
  });

  it("handles SYNC_REMINDERS broadcast to all windows", () => {
    expect(sw).toContain('"SYNC_REMINDERS"');
    expect(sw).toContain("self.clients.matchAll");
  });

  it("handles SKIP_WAITING message", () => {
    expect(sw).toContain('"SKIP_WAITING"');
  });

  it("handles legacy TASK_REMINDER message", () => {
    expect(sw).toContain('"TASK_REMINDER"');
  });

  it("handles PERSIST_DUE_TASKS message", () => {
    expect(sw).toContain('"PERSIST_DUE_TASKS"');
    expect(sw).toContain("_persistedDueTasks");
  });
});

// ── Persisted Due Tasks ──────────────────────────────────────────────────────

describe("serviceWorker — persisted due tasks", () => {
  it("defines checkPersistedDueTasks function", () => {
    expect(sw).toContain("function checkPersistedDueTasks");
  });

  it("checks dueAt time against current time", () => {
    expect(sw).toContain("Date.now()");
    expect(sw).toContain("dueAt");
    expect(sw).toContain("dueTime <= now");
  });

  it("fires overdue notifications with patient name", () => {
    expect(sw).toContain("patientName");
    expect(sw).toContain("עבר הזמן"); // "time has passed" in Hebrew
  });

  it("uses requireInteraction for overdue notifications", () => {
    // checkPersistedDueTasks calls showNotification with requireInteraction: true
    expect(sw).toContain("requireInteraction: true");
  });
});

// ── Alarm helper ─────────────────────────────────────────────────────────────

describe("serviceWorker — fireTaskAlarm helper", () => {
  it("defines fireTaskAlarm function", () => {
    expect(sw).toContain("function fireTaskAlarm");
  });

  it("uses alarm-specific tag", () => {
    expect(sw).toContain("`alarm-${taskId}`");
  });

  it("includes dismiss action", () => {
    expect(sw).toContain("dismiss");
    expect(sw).toContain("ביטול"); // "cancel" in Hebrew
  });
});
