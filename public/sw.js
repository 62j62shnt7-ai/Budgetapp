/* ==========================================================================
   Budget Control — Service Worker (v2.1)
   Network-first strategy for app shell assets, excludes external API queries.
   ========================================================================== */

const CACHE_NAME = 'budget-control-v2.2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Allow the page (executeAppRefresh) to promote a waiting worker immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('budget-control-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cache Google Fonts (fonts.googleapis.com & fonts.gstatic.com) with stale-while-revalidate / cache-first
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  // Do not cache external data APIs (GitHub Gist sync, live currency/gold rates) or non-http protocols
  if (
    (!isGoogleFont && url.origin !== self.location.origin) ||
    url.hostname.includes('github.com') ||
    url.hostname.includes('githubusercontent.com') ||
    url.hostname.includes('open.er-api.com') ||
    url.hostname.includes('goldprice.org') ||
    !event.request.url.startsWith('http')
  ) {
    return;
  }

  // Stale-while-revalidate or Network-first strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
