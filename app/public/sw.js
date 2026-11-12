/* DanGG service worker — makes the phone client installable and keeps the
   shell usable on a flaky connection. Navigation is network-first so a new
   deployment is picked up on the next launch; hashed build assets are
   cache-first because their URL changes with every build. */
const VERSION = 'dangro-v2';
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll([SHELL, '/manifest.webmanifest']))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache, including hashed assets from the previous build, so a
    // long-lived installed app does not accumulate old bundles forever.
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const cache = await caches.open(VERSION);
    await cache.addAll([SHELL, '/manifest.webmanifest']).catch(() => undefined);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(SHELL, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit || Response.error()))
    );
    return;
  }

  const cacheable = /\/assets\//.test(url.pathname)
    && ['script', 'style', 'font', 'image'].includes(request.destination);
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    })
  );
});
