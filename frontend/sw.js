// Minimal service worker for PWA installability.
// No caching — dashboard relies on live API data (SSE, state polling).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
