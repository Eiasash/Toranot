/**
 * Service Worker v6 — Proper cache versioning + update strategy
 * 
 * Strategy: Network-first with cache fallback.
 * On new version: auto-update and notify user via postMessage.
 * Cross-Origin Isolation headers for SharedArrayBuffer support.
 */

const CACHE_VERSION = 6;
const CACHE_NAME = `toranot-v${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// Install: precache assets, skip waiting to activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {})),
  );
});

// Activate: purge ALL old caches, claim clients, notify about update
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith("toranot-") && n !== CACHE_NAME)
            .map((n) => caches.delete(n)),
        ),
      ),
      self.clients.claim(),
    ]).then(() => {
      // Notify all clients that a new version is active
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "SW_UPDATED",
            version: CACHE_VERSION,
          });
        });
      });
    }),
  );
});

// Fetch: network-first, cache fallback, inject COOP/COEP headers
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension://")) return;
  if (
    event.request.cache === "only-if-cached" &&
    event.request.mode !== "same-origin"
  )
    return;

  // Skip caching for API calls
  if (event.request.url.includes("/api/") || event.request.url.includes("/.netlify/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status === 0 || response.type === "error")
          return response;

        // Inject COOP/COEP headers for SharedArrayBuffer support
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

        const coiResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });

        // Cache successful same-origin responses
        if (
          response.status === 200 &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const toCache = coiResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, toCache));
        }

        return coiResponse;
      })
      .catch(() => caches.match(event.request)),
  );
});
