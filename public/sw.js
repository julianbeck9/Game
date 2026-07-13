// Kill-switch service worker.
// A previously-installed caching SW could serve a stale/broken mix after a
// deploy (black screen). This version takes over, deletes ALL caches,
// unregisters itself, and reloads open tabs so the app loads fresh from the
// network. No fetch handler → nothing is intercepted. (PWA caching can be
// reintroduced later once the app is stable.)
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.navigate(c.url));
      } catch {
        /* ignore */
      }
    })(),
  );
});
