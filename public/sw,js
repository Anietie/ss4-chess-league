const CACHE_NAME = 'ss4-chess-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/stockfish/stockfish-nnue-16.js',
  '/stockfish/stockfish-nnue-16.wasm',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for game review pages and static, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API routes or socket connections
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return; // Let browser handle normally
  }

  // Cache-first for game review (so analysis works offline)
  if (url.pathname.startsWith('/game/') && url.pathname.endsWith('/review')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return res;
        });
        return cached ?? networkFetch;
      })
    );
    return;
  }

  // Network-first for everything else, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'SS4 Chess', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'SS4 Chess League', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/dashboard' },
      tag: payload.tag ?? 'ss4-notification',
      renotify: true,
    })
  );
});

// Notification click → open relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(targetUrl); }
      else self.clients.openWindow(targetUrl);
    })
  );
});