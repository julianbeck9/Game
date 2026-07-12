// Crown & Clash service worker — runtime cache so the game installs as a PWA
// and runs offline after the first load. Cache-first for same-origin GETs.
const CACHE = 'crown-clash-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Refresh in the background
        fetch(req)
          .then((res) => res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())))
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        // Offline and uncached: fall back to the app shell for navigations
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
