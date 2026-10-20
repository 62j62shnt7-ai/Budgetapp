import type { SliceCreator, UISlice } from './types';
import { STORAGE_KEYS, loadStorage, saveStorage } from './common';

export const createUISlice: SliceCreator<UISlice> = (set, get) => ({
  theme: loadStorage<'dark' | 'light'>(STORAGE_KEYS.theme, 'dark'),
  activeTab: 'dashboard',
  pendingNavigation: null,
  sidebarCollapsed: loadStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false),
  historyAdminUnlocked: loadStorage<boolean>(STORAGE_KEYS.historyAdminUnlocked, false),

  setTheme: (theme) => {
    saveStorage(STORAGE_KEYS.theme, theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  navigateTo: (tab, filters) => {
    set({
      activeTab: tab,
      pendingNavigation: filters ? { tab, filters } : null,
    });
  },

  clearPendingNavigation: () => set({ pendingNavigation: null }),

  toggleSidebar: () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 980) {
      document.body.classList.toggle('mobile-sidebar-open');
    } else {
      const next = !get().sidebarCollapsed;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('sidebar-collapsed', next);
      }
      saveStorage(STORAGE_KEYS.sidebarCollapsed, next);
      set({ sidebarCollapsed: next });
    }
  },

  closeMobileSidebar: () => {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('mobile-sidebar-open');
    }
  },
});
