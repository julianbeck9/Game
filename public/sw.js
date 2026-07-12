// Crown & Clash service worker.
// - App shell (HTML / JS / CSS / manifest): NETWORK-FIRST so new deploys show
//   up immediately; falls back to cache when offline.
// - Everything else (map art, icons, images): CACHE-FIRST for speed/offline.
const CACHE = 'crown-clash-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isShell = (req, url) =>
  req.mode === 'navigate' ||
  /\.(?:js|css|webmanifest)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (isShell(req, url)) {
    // Network-first: always try for the freshest build
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          if (req.mode === 'navigate') {
            const shell = await caches.match('./index.html');
            if (shell) return shell;
          }
          throw new Error('offline');
        }
      })(),
    );
    return;
  }

  // Cache-first for static assets (images, etc.)
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
