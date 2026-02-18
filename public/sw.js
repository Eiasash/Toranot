/**
 * Service Worker with:
 * 1. Cross-Origin Isolation (COOP/COEP headers) — required for SharedArrayBuffer/Tesseract.js on Android Chrome
 * 2. Asset caching for offline support
 */

const CACHE_NAME = "toranot-v4";

const PRECACHE_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension://")) return;
  if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status === 0 || response.type === "error") return response;

        // Inject COOP/COEP headers so SharedArrayBuffer (needed by Tesseract.js) works
        // on GitHub Pages which doesn't serve these headers natively
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
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const toCache = coiResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }

        return coiResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
