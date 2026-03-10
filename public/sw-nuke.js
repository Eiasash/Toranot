/**
 * sw-nuke.js — Emergency service worker unregister.
 * Loaded synchronously in index.html BEFORE the app bundle.
 * If ?nuke-sw is in the URL, unregister all SWs and purge all caches,
 * then reload cleanly. This is the escape hatch when a broken SW
 * traps users in a blank-page loop.
 */
(function () {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !window.location.search.includes("nuke-sw")
  )
    return;

  navigator.serviceWorker
    .getRegistrations()
    .then(function (registrations) {
      var tasks = registrations.map(function (r) {
        return r.unregister();
      });
      return Promise.all(tasks);
    })
    .then(function () {
      return caches.keys().then(function (names) {
        return Promise.all(
          names.map(function (n) {
            return caches.delete(n);
          })
        );
      });
    })
    .then(function () {
      // Strip ?nuke-sw from URL so it doesn't loop
      var url = new URL(window.location.href);
      url.searchParams.delete("nuke-sw");
      window.location.replace(url.toString());
    })
    .catch(function (err) {
      console.error("[sw-nuke] Failed:", err);
    });
})();
