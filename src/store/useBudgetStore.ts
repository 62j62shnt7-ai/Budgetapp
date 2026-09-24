// ==========================================================================
// Global Zustand Store with Direct Legacy LocalStorage Persistence
// ==========================================================================
import { create } from 'zustand';
import type {
  AccountBalance,
  CashEntry,
  CategoryCap,
  Installment,
  RatesData,
  SalaryPayment,
  SavingsGoal,
  StorageAsset,
} from '../types';
import { defaultRates } from '../engine/currency';

// Keys match legacy app.js exactly for 100% backward compatibility
export const STORAGE_KEYS = {
  salary: 'budget-control-salary-pattern',
  entries: 'budget-control-cash-entries',
  installments: 'budget-control-installments',
  storage: 'budget-control-storage-assets',
  accounts: 'budget-control-account-balances',
  rates: 'budget-control-rates',
  categoryCaps: 'budget-control-category-caps',
  savingsGoals: 'budget-control-savings-goals',
  theme: 'budget-control-theme',
  gistToken: 'budget-control-gist-token',
  gistId: 'budget-control-gist-id',
  gistAutoSync: 'budget-control-gist-autosync',
};

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Error reading ${key} from localStorage:`, err);
    return fallback;
  }
}

function saveStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving ${key} to localStorage:`, err);
  }
}

export interface BudgetStoreState {
  // Theme & Navigation
  theme: 'dark' | 'light';
  activeTab: 'dashboard' | 'forecast' | 'entries' | 'credit' | 'rates' | 'storage' | 'settings';
  
  // Financial Data
  entries: CashEntry[];
  accounts: Record<string, AccountBalance>;
  salaryPattern: SalaryPayment[];
  installments: Installment[];
  rates: RatesData;
  storageAssets: StorageAsset[];
  categoryCaps: CategoryCap[];
  savingsGoals: SavingsGoal[];
  
  // Gist Cloud Sync
  gistToken: string;
  gistId: string;
  gistAutoSync: boolean;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: BudgetStoreState['activeTab']) => void;
  
  addEntry: (entry: Omit<CashEntry, 'id'>) => void;
  updateEntry: (id: string, updates: Partial<CashEntry>) => void;
  deleteEntry: (id: string) => void;

  updateAccountBalance: (accountKey: string, newBalance: number) => void;
  updateSalaryPattern: (pattern: SalaryPayment[]) => void;
  
  addInstallment: (installment: Omit<Installment, 'id'>) => void;
  deleteInstallment: (id: string) => void;

  updateRates: (rates: RatesData) => void;
  
  addStorageAsset: (asset: Omit<StorageAsset, 'id'>) => void;
  deleteStorageAsset: (id: string) => void;

  setGistConfig: (token: string, gistId: string, autoSync: boolean) => void;
  
  // Import/Export
  exportJSON: () => string;
  importJSON: (jsonString: string) => boolean;
}

const defaultAccounts: Record<string, AccountBalance> = {
  cib: { name: 'CIB', balance: 0, maturityDay: 15 },
  hsbc: { name: 'HSBC', balance: 0, maturityDay: 30 },
  cash: { name: 'Cash', balance: 0, maturityDay: 1 },
};

const defaultSalaryPattern: SalaryPayment[] = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 },
];

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  theme: (localStorage.getItem(STORAGE_KEYS.theme) as 'dark' | 'light') || 'dark',
  activeTab: 'dashboard',

  entries: loadStorage<CashEntry[]>(STORAGE_KEYS.entries, []),
  accounts: loadStorage<Record<string, AccountBalance>>(STORAGE_KEYS.accounts, defaultAccounts),
  salaryPattern: loadStorage<SalaryPayment[]>(STORAGE_KEYS.salary, defaultSalaryPattern),
  installments: loadStorage<Installment[]>(STORAGE_KEYS.installments, []),
  rates: loadStorage<RatesData>(STORAGE_KEYS.rates, defaultRates),
  storageAssets: loadStorage<StorageAsset[]>(STORAGE_KEYS.storage, []),
  categoryCaps: loadStorage<CategoryCap[]>(STORAGE_KEYS.categoryCaps, []),
  savingsGoals: loadStorage<SavingsGoal[]>(STORAGE_KEYS.savingsGoals, []),

  gistToken: localStorage.getItem(STORAGE_KEYS.gistToken) || '',
  gistId: localStorage.getItem(STORAGE_KEYS.gistId) || '',
  gistAutoSync: localStorage.getItem(STORAGE_KEYS.gistAutoSync) === 'true',

  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  addEntry: (entryData) => {
    const newEntry: CashEntry = {
      ...entryData,
      id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [newEntry, ...get().entries];
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
  },

  updateEntry: (id, updates) => {
    const updated = get().entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
  },

  deleteEntry: (id) => {
    const updated = get().entries.filter((e) => e.id !== id);
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
  },

  updateAccountBalance: (accountKey, newBalance) => {
    const accounts = { ...get().accounts };
    if (accounts[accountKey]) {
      accounts[accountKey].balance = Math.round(newBalance);
      saveStorage(STORAGE_KEYS.accounts, accounts);
      set({ accounts });
    }
  },

  updateSalaryPattern: (salaryPattern) => {
    saveStorage(STORAGE_KEYS.salary, salaryPattern);
    set({ salaryPattern });
  },

  addInstallment: (instData) => {
    const newInst: Installment = {
      ...instData,
      id: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...get().installments, newInst];
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
  },

  deleteInstallment: (id) => {
    const updated = get().installments.filter((i) => i.id !== id);
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
  },

  updateRates: (rates) => {
    saveStorage(STORAGE_KEYS.rates, rates);
    set({ rates });
  },

  addStorageAsset: (assetData) => {
    const newAsset: StorageAsset = {
      ...assetData,
      id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...get().storageAssets, newAsset];
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
  },

  deleteStorageAsset: (id) => {
    const updated = get().storageAssets.filter((a) => a.id !== id);
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
  },

  setGistConfig: (token, gistId, autoSync) => {
    localStorage.setItem(STORAGE_KEYS.gistToken, token);
    localStorage.setItem(STORAGE_KEYS.gistId, gistId);
    localStorage.setItem(STORAGE_KEYS.gistAutoSync, String(autoSync));
    set({ gistToken: token, gistId, gistAutoSync: autoSync });
  },

  exportJSON: () => {
    const state = get();
    const payload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      entries: state.entries,
      accounts: state.accounts,
      salaryPattern: state.salaryPattern,
      installments: state.installments,
      rates: state.rates,
      storageAssets: state.storageAssets,
      categoryCaps: state.categoryCaps,
      savingsGoals: state.savingsGoals,
    };
    return JSON.stringify(payload, null, 2);
  },

  importJSON: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.entries) saveStorage(STORAGE_KEYS.entries, data.entries);
      if (data.accounts) saveStorage(STORAGE_KEYS.accounts, data.accounts);
      if (data.salaryPattern) saveStorage(STORAGE_KEYS.salary, data.salaryPattern);
      if (data.installments) saveStorage(STORAGE_KEYS.installments, data.installments);
      if (data.rates) saveStorage(STORAGE_KEYS.rates, data.rates);
      if (data.storageAssets) saveStorage(STORAGE_KEYS.storage, data.storageAssets);
      if (data.categoryCaps) saveStorage(STORAGE_KEYS.categoryCaps, data.categoryCaps);
      if (data.savingsGoals) saveStorage(STORAGE_KEYS.savingsGoals, data.savingsGoals);

      set({
        entries: data.entries || get().entries,
        accounts: data.accounts || get().accounts,
        salaryPattern: data.salaryPattern || get().salaryPattern,
        installments: data.installments || get().installments,
        rates: data.rates || get().rates,
        storageAssets: data.storageAssets || get().storageAssets,
        categoryCaps: data.categoryCaps || get().categoryCaps,
        savingsGoals: data.savingsGoals || get().savingsGoals,
      });
      return true;
    } catch (e) {
      console.error('Failed to import JSON data:', e);
      return false;
    }
  },
}));
