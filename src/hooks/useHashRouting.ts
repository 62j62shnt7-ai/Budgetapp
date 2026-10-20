import { useEffect } from 'react';
import { useBudgetStore } from '../store/useBudgetStore';
import type { ViewTab } from '../types';

const VALID_TABS: Record<string, ViewTab> = {
  dashboard: 'dashboard',
  deficits: 'deficits',
  cashflow: 'cashflow',
  history: 'history',
  accounts: 'accounts',
  storage: 'storage',
  jobs: 'jobs',
  rates: 'rates',
};

function getTabFromHash(): ViewTab | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim().toLowerCase();
  return VALID_TABS[hash] || null;
}

export function isAuthHashOrQuery(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  const search = window.location.search;
  return (
    hash.includes('access_token=') ||
    hash.includes('error=') ||
    hash.includes('refresh_token=') ||
    search.includes('code=') ||
    search.includes('error=')
  );
}

/**
 * Hash-Based Routing Hook for GitHub Pages
 *
 * Synchronizes store `activeTab` with `window.location.hash` (e.g. `#/cashflow`, `#/accounts`),
 * enabling native browser Back/Forward navigation and direct bookmarkable URLs.
 */
export function useHashRouting(): void {
  const activeTab = useBudgetStore((state) => state.activeTab);
  const setActiveTab = useBudgetStore((state) => state.setActiveTab);

  // 1. Initial URL hash check on mount only
  useEffect(() => {
    if (isAuthHashOrQuery()) {
      // Defer to OAuth redirect handlers to process tokens from URL
      return;
    }

    const initialTab = getTabFromHash();
    if (initialTab) {
      if (initialTab !== useBudgetStore.getState().activeTab) {
        setActiveTab(initialTab);
      }
    } else if (typeof window !== 'undefined' && !window.location.hash) {
      const current = useBudgetStore.getState().activeTab || 'dashboard';
      window.history.replaceState(null, '', `#/${current}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Listen to browser Back / Forward navigation (hashchange)
  useEffect(() => {
    const handleHashChange = () => {
      if (isAuthHashOrQuery()) return;
      const targetTab = getTabFromHash();
      if (targetTab && targetTab !== useBudgetStore.getState().activeTab) {
        setActiveTab(targetTab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab]);

  // 3. Update hash when activeTab changes internally (Sidebar, BottomNav, navigateTo)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isAuthHashOrQuery()) return;
    const currentHashTab = getTabFromHash();
    if (currentHashTab !== activeTab) {
      window.location.hash = `#/${activeTab}`;
    }
  }, [activeTab]);
}
