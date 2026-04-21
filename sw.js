/* ═══════════════════════════════════════════
   Smart Campus Air Shield – Service Worker
   Caches app shell for offline use
   Version: 1.0.0
═══════════════════════════════════════════ */
const CACHE = 'air-shield-v1';
const SHELL = ['/', '/index.html', '/app.js', '/manifest.json'];

// Install: cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for shell
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API calls → always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  // CDN fonts → network with cache fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('cdnjs')) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })
          .catch(() => c.match(e.request))
      )
    );
    return;
  }
  // App shell → cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '⚠️ Air Shield Alert', {
      body: data.body || 'Chất lượng không khí thay đổi',
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: 'air-alert',
      renotify: true,
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
