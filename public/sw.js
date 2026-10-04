/* ==========================================================================
   Budget Control — Service Worker (v2.1)
   Network-first strategy for app shell assets, excludes external API queries.
   ========================================================================== */

const CACHE_NAME = 'budget-control-v2.1';

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

  // Do not cache external APIs (GitHub Gist sync, live currency/gold rates) or non-http protocols
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('github.com') ||
    url.hostname.includes('githubusercontent.com') ||
    url.hostname.includes('open.er-api.com') ||
    url.hostname.includes('goldprice.org') ||
    !event.request.url.startsWith('http')
  ) {
    return;
  }

  // Network-first strategy for local application assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
