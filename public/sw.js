// Wander service worker: makes the app installable and keeps the shell + fonts fast/offline-friendly.
const CACHE = 'wander-shell-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // never cache API or Supabase
  // Static build assets: cache-first (they're content-hashed)
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  // Pages: network-first, fall back to the last copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match('/'))));
  }
});

// ---- Push notifications (train reminders etc.) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Wander', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Wander', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: d.url || '/' }, tag: d.tag, renotify: !!d.tag, vibrate: [90, 40, 90],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
