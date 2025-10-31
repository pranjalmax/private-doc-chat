// Simple offline cache for the app shell (no bundler).
// It caches your local files so the app opens offline after first load.
// Large model files from CDNs are NOT force-cached here (browser will cache them normally).

const CACHE_NAME = 'pdc-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  // localForage script is external; let the browser handle its own cache
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Cache-first for app shell, network-first for everything else.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // App shell (same-origin files)
  if (url.origin === self.location.origin && APP_SHELL.includes(url.pathname.replace(/^\.\//, '/'))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Default: network-first with fallback to cache (helpful if offline)
  event.respondWith(
    fetch(req).then((resp) => {
      // Optionally: put small assets into cache (skip huge models)
      return resp;
    }).catch(() => caches.match(req))
  );
});
