/* ═══════════════════════════════════════
   Atlas Pro Service Worker v2
   Offline-first strategy
═══════════════════════════════════════ */
const CACHE = 'atlaspro-v2';
const STATIC = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap',
];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Firebase / Google APIs: network-only (they handle their own caching)
// - Drive images: cache-first with 7-day TTL
// - App shell: cache-first, fallback to network
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET
  if(e.request.method !== 'GET') return;

  // Firebase & Auth — always network
  if(url.includes('firestore.googleapis.com') ||
     url.includes('firebase') ||
     url.includes('googleapis.com/auth') ||
     url.includes('accounts.google.com')) return;

  // Google Drive images — cache-first
  if(url.includes('drive.google.com') || url.includes('googleusercontent.com')) {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const cached = await c.match(e.request);
        if(cached) return cached;
        try {
          const res = await fetch(e.request);
          if(res.ok) c.put(e.request, res.clone());
          return res;
        } catch {
          return cached || new Response('offline', { status: 503 });
        }
      })
    );
    return;
  }

  // App shell — cache-first, fallback network, fallback index.html
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html') || caches.match('/'));
    })
  );
});

// Background sync message
self.addEventListener('message', e => {
  if(e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
