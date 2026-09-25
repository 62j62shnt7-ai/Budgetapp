// ==========================================================================
// Service Worker Cache Purge & App Refresh Utility (1:1 with legacy executeAppRefresh)
// ==========================================================================

export async function executeAppRefresh(): Promise<void> {
  try {
    // 1. Tell all waiting or active service workers to skip waiting
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.waiting) {
          reg.waiting.postMessage({ action: 'skipWaiting' });
        }
        if (reg.active) {
          reg.active.postMessage({ action: 'skipWaiting' });
        }
      }
    }

    // 2. Purge all Service Worker CacheStorage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // 3. Trigger active Service Worker update
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.update().catch(() => {})));
    }
  } catch (err) {
    console.warn('Cache purge error during Refresh App:', err);
  } finally {
    window.location.reload();
  }
}
