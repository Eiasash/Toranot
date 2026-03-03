// One-time SW nuke — force clear all caches and unregister stale workers.
// External file so it doesn't violate CSP script-src 'self'.
(async () => {
  if (!navigator.serviceWorker) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) { await r.unregister(); }
  const keys = await caches.keys();
  for (const k of keys) { await caches.delete(k); }
  if (regs.length > 0 && !sessionStorage.getItem('sw_nuked')) {
    sessionStorage.setItem('sw_nuked', '1');
    location.reload();
  }
})();
