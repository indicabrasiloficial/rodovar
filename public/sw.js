const CACHE_NAME = 'rodovar-v3.2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'KEEPALIVE') {
    e.source.postMessage({ type: 'KEEPALIVE_ACK' });
  }
});
