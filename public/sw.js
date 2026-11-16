// Service Worker for Canteen Corner PWA
// Architecture: Strict Security Partitioning - Zero Sensitive Data Caching

const CACHE_NAME = 'canteen-corner-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL SECURITY ENFORCEMENT:
  // 1. Strictly bypass all API calls (/api/*). Never store financial, inmate, or auth data.
  // 2. Only cache GET requests. All mutations (POST, PUT, DELETE, PATCH) pass directly to network.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Static Assets & Shell Cache
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached static asset while updating in background if appropriate
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Cache successful static responses (scripts, styles, images)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (url.pathname.startsWith('/_next/static/') ||
              url.pathname.startsWith('/icons/') ||
              url.pathname === '/manifest.json')
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline navigation fallback: serve cached landing shell
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
