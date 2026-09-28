import { useEffect, useState } from 'react';

/**
 * Single source of truth for the "Update ready / Latest / Offline" pill.
 * Shared by the topbar and the mobile action sheet so the logic isn't duplicated.
 */
export function useAppUpdateStatus(): string {
  const [updateStatus, setUpdateStatus] = useState('Latest');

  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setUpdateStatus('Offline');
        return;
      }
      if (!('serviceWorker' in navigator)) {
        setUpdateStatus('Latest');
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      setUpdateStatus(registration?.waiting ? 'Update ready' : 'Latest');
    };

    void checkStatus();
    window.addEventListener('online', checkStatus);
    window.addEventListener('offline', checkStatus);
    return () => {
      window.removeEventListener('online', checkStatus);
      window.removeEventListener('offline', checkStatus);
    };
  }, []);

  return updateStatus;
}
