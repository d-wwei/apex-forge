// Minimal service worker for PWA installability.
// No caching — dashboard relies on live API data (SSE, state polling).
// cache:'no-store' bypasses Chrome's HTTP cache layer inside the SW.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
