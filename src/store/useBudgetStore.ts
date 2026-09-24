// ==========================================================================
// Complete Zustand Budget Store with Full Legacy LocalStorage Sync
// ==========================================================================
import { create } from 'zustand';
import type {
  AccountBalance,
  CashEntry,
  CategoryCap,
  Installment,
  JobItem,
  RatesData,
  SalaryPayment,
  SavingsGoal,
  StorageAsset,
} from '../types';
import { defaultRates } from '../engine/currency';

export const STORAGE_KEYS = {
  salary: 'budget-control-salary-pattern',
  entries: 'budget-control-cash-entries',
  installments: 'budget-control-installments',
  storage: 'budget-control-storage-assets',
  accounts: 'budget-control-account-balances',
  asf: 'budget-control-asf-jobs',
  irq: 'budget-control-irq-jobs',
  partTimeJobs: 'budget-control-part-time-jobs',
  rates: 'budget-control-rates',
  categoryCaps: 'budget-control-category-caps',
  savingsGoals: 'budget-control-savings-goals',
  entryActuals: 'budget-control-entry-actuals',
  entryActualDates: 'budget-control-entry-actual-dates',
  deletedForecasts: 'budget-control-deleted-forecasts',
  archivedEntries: 'budget-control-archived-entries',
  theme: 'budget-control-theme',
  gistToken: 'budget-control-gist-token',
  gistId: 'budget-control-gist-id',
  gistAutoSync: 'budget-control-gist-autosync',
  historyAdminUnlocked: 'budget-control-history-admin-unlocked',
  sidebarCollapsed: 'budget-control-sidebar-collapsed',
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

export type ViewTab =
  | 'dashboard'
  | 'deficits'
  | 'cashflow'
  | 'history'
  | 'accounts'
  | 'storage'
  | 'jobs'
  | 'rates';

export interface BudgetStoreState {
  theme: 'dark' | 'light';
  activeTab: ViewTab;
  sidebarCollapsed: boolean;

  // Financial Data
  entries: CashEntry[];
  archivedEntries: CashEntry[];
  deletedForecasts: string[];
  accounts: Record<string, AccountBalance>;
  salaryPattern: SalaryPayment[];
  installments: Installment[];
  rates: RatesData;
  storageAssets: StorageAsset[];
  categoryCaps: CategoryCap[];
  savingsGoals: SavingsGoal[];
  asfJobs: JobItem[];
  irqJobs: JobItem[];
  partTimeJobs: JobItem[];

  // Actuals Tracking
  entryActuals: Record<string, number>;
  entryActualDates: Record<string, string>;

  // Cloud Sync & Admin
  gistToken: string;
  gistId: string;
  gistAutoSync: boolean;
  historyAdminUnlocked: boolean;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: ViewTab) => void;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;

  addEntry: (entry: Omit<CashEntry, 'id'>) => void;
  updateEntry: (id: string, updates: Partial<CashEntry>) => void;
  deleteEntry: (id: string) => void;
  recordActual: (entryId: string, amount: number, date?: string) => void;
  clearActual: (entryId: string) => void;

  updateAccountBalance: (accountKey: string, newBalance: number) => void;
  updateSalaryPattern: (pattern: SalaryPayment[]) => void;

  addInstallment: (installment: Omit<Installment, 'id'>) => void;
  updateInstallment: (id: string, updates: Partial<Installment>) => void;
  deleteInstallment: (id: string) => void;

  setCategoryCap: (category: string, cap: number) => void;
  deleteCategoryCap: (category: string) => void;

  addSavingsGoal: (goal: Omit<SavingsGoal, 'id'>) => void;
  updateSavingsGoal: (id: string, updates: Partial<SavingsGoal>) => void;
  deleteSavingsGoal: (id: string) => void;

  updateRates: (rates: RatesData) => void;

  addStorageAsset: (asset: Omit<StorageAsset, 'id'>) => void;
  updateStorageAsset: (id: string, updates: Partial<StorageAsset>) => void;
  deleteStorageAsset: (id: string) => void;

  // Jobs Actions
  saveJob: (jobType: 'asf' | 'irq' | 'partTime', job: JobItem) => void;
  deleteJob: (jobType: 'asf' | 'irq' | 'partTime', jobId: string) => void;

  setGistConfig: (token: string, gistId: string, autoSync: boolean) => void;
  setHistoryAdminUnlocked: (unlocked: boolean) => void;

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
  theme: (localStorage.getItem(STORAGE_KEYS.theme) as 'dark' | 'light') || 'light',
  activeTab: 'dashboard',
  sidebarCollapsed: loadStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false),

  entries: loadStorage<CashEntry[]>(STORAGE_KEYS.entries, []),
  archivedEntries: loadStorage<CashEntry[]>(STORAGE_KEYS.archivedEntries, []),
  deletedForecasts: loadStorage<string[]>(STORAGE_KEYS.deletedForecasts, []),
  accounts: loadStorage<Record<string, AccountBalance>>(STORAGE_KEYS.accounts, defaultAccounts),
  salaryPattern: loadStorage<SalaryPayment[]>(STORAGE_KEYS.salary, defaultSalaryPattern),
  installments: loadStorage<Installment[]>(STORAGE_KEYS.installments, []),
  rates: loadStorage<RatesData>(STORAGE_KEYS.rates, defaultRates),
  storageAssets: loadStorage<StorageAsset[]>(STORAGE_KEYS.storage, []),
  categoryCaps: loadStorage<CategoryCap[]>(STORAGE_KEYS.categoryCaps, []),
  savingsGoals: loadStorage<SavingsGoal[]>(STORAGE_KEYS.savingsGoals, []),

  asfJobs: loadStorage<JobItem[]>(STORAGE_KEYS.asf, []),
  irqJobs: loadStorage<JobItem[]>(STORAGE_KEYS.irq, []),
  partTimeJobs: loadStorage<JobItem[]>(STORAGE_KEYS.partTimeJobs, []),

  entryActuals: loadStorage<Record<string, number>>(STORAGE_KEYS.entryActuals, {}),
  entryActualDates: loadStorage<Record<string, string>>(STORAGE_KEYS.entryActualDates, {}),

  gistToken: localStorage.getItem(STORAGE_KEYS.gistToken) || '',
  gistId: localStorage.getItem(STORAGE_KEYS.gistId) || '',
  gistAutoSync: localStorage.getItem(STORAGE_KEYS.gistAutoSync) === 'true',
  historyAdminUnlocked: localStorage.getItem(STORAGE_KEYS.historyAdminUnlocked) === 'true',

  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  setActiveTab: (activeTab) => set({ activeTab }),

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

  recordActual: (entryId, amount, date) => {
    const actuals = { ...get().entryActuals, [entryId]: amount };
    const dates = { ...get().entryActualDates };
    if (date) dates[entryId] = date;
    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entryActuals: actuals, entryActualDates: dates });
  },

  clearActual: (entryId) => {
    const actuals = { ...get().entryActuals };
    delete actuals[entryId];
    const dates = { ...get().entryActualDates };
    delete dates[entryId];
    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entryActuals: actuals, entryActualDates: dates });
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

  updateInstallment: (id, updates) => {
    const updated = get().installments.map((i) => (i.id === id ? { ...i, ...updates } : i));
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
  },

  deleteInstallment: (id) => {
    const updated = get().installments.filter((i) => i.id !== id);
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
  },

  setCategoryCap: (category, cap) => {
    const filtered = get().categoryCaps.filter((c) => c.category !== category);
    const updated = [...filtered, { category, cap }];
    saveStorage(STORAGE_KEYS.categoryCaps, updated);
    set({ categoryCaps: updated });
  },

  deleteCategoryCap: (category) => {
    const updated = get().categoryCaps.filter((c) => c.category !== category);
    saveStorage(STORAGE_KEYS.categoryCaps, updated);
    set({ categoryCaps: updated });
  },

  addSavingsGoal: (goalData) => {
    const newGoal: SavingsGoal = {
      ...goalData,
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...get().savingsGoals, newGoal];
    saveStorage(STORAGE_KEYS.savingsGoals, updated);
    set({ savingsGoals: updated });
  },

  updateSavingsGoal: (id, updates) => {
    const updated = get().savingsGoals.map((g) => (g.id === id ? { ...g, ...updates } : g));
    saveStorage(STORAGE_KEYS.savingsGoals, updated);
    set({ savingsGoals: updated });
  },

  deleteSavingsGoal: (id) => {
    const updated = get().savingsGoals.filter((g) => g.id !== id);
    saveStorage(STORAGE_KEYS.savingsGoals, updated);
    set({ savingsGoals: updated });
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

  updateStorageAsset: (id, updates) => {
    const updated = get().storageAssets.map((a) => (a.id === id ? { ...a, ...updates } : a));
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
  },

  deleteStorageAsset: (id) => {
    const updated = get().storageAssets.filter((a) => a.id !== id);
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
  },

  saveJob: (jobType, job) => {
    const key = jobType === 'asf' ? STORAGE_KEYS.asf : jobType === 'irq' ? STORAGE_KEYS.irq : STORAGE_KEYS.partTimeJobs;
    const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
    const exists = currentList.some((j) => j.id === job.id);
    const updated = exists ? currentList.map((j) => (j.id === job.id ? job : j)) : [...currentList, job];

    saveStorage(key, updated);
    if (jobType === 'asf') set({ asfJobs: updated });
    else if (jobType === 'irq') set({ irqJobs: updated });
    else set({ partTimeJobs: updated });
  },

  deleteJob: (jobType, jobId) => {
    const key = jobType === 'asf' ? STORAGE_KEYS.asf : jobType === 'irq' ? STORAGE_KEYS.irq : STORAGE_KEYS.partTimeJobs;
    const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
    const updated = currentList.filter((j) => j.id !== jobId);

    saveStorage(key, updated);
    if (jobType === 'asf') set({ asfJobs: updated });
    else if (jobType === 'irq') set({ irqJobs: updated });
    else set({ partTimeJobs: updated });
  },

  setGistConfig: (token, gistId, autoSync) => {
    localStorage.setItem(STORAGE_KEYS.gistToken, token);
    localStorage.setItem(STORAGE_KEYS.gistId, gistId);
    localStorage.setItem(STORAGE_KEYS.gistAutoSync, String(autoSync));
    set({ gistToken: token, gistId, gistAutoSync: autoSync });
  },

  setHistoryAdminUnlocked: (unlocked) => {
    localStorage.setItem(STORAGE_KEYS.historyAdminUnlocked, String(unlocked));
    set({ historyAdminUnlocked: unlocked });
  },

  exportJSON: () => {
    const state = get();
    const payload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      entries: state.entries,
      archivedEntries: state.archivedEntries,
      accounts: state.accounts,
      salaryPattern: state.salaryPattern,
      installments: state.installments,
      rates: state.rates,
      storageAssets: state.storageAssets,
      categoryCaps: state.categoryCaps,
      savingsGoals: state.savingsGoals,
      asfJobs: state.asfJobs,
      irqJobs: state.irqJobs,
      partTimeJobs: state.partTimeJobs,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
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
      if (data.asfJobs) saveStorage(STORAGE_KEYS.asf, data.asfJobs);
      if (data.irqJobs) saveStorage(STORAGE_KEYS.irq, data.irqJobs);
      if (data.partTimeJobs) saveStorage(STORAGE_KEYS.partTimeJobs, data.partTimeJobs);
      if (data.entryActuals) saveStorage(STORAGE_KEYS.entryActuals, data.entryActuals);
      if (data.entryActualDates) saveStorage(STORAGE_KEYS.entryActualDates, data.entryActualDates);

      set({
        entries: data.entries || get().entries,
        archivedEntries: data.archivedEntries || get().archivedEntries,
        accounts: data.accounts || get().accounts,
        salaryPattern: data.salaryPattern || get().salaryPattern,
        installments: data.installments || get().installments,
        rates: data.rates || get().rates,
        storageAssets: data.storageAssets || get().storageAssets,
        categoryCaps: data.categoryCaps || get().categoryCaps,
        savingsGoals: data.savingsGoals || get().savingsGoals,
        asfJobs: data.asfJobs || get().asfJobs,
        irqJobs: data.irqJobs || get().irqJobs,
        partTimeJobs: data.partTimeJobs || get().partTimeJobs,
        entryActuals: data.entryActuals || get().entryActuals,
        entryActualDates: data.entryActualDates || get().entryActualDates,
      });
      return true;
    } catch (e) {
      console.error('Failed to import JSON data:', e);
      return false;
    }
  },
}));
