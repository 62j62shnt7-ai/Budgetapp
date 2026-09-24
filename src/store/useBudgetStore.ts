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
      app: 'budget-control',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      seedVersion: 'blank-template-v2',
      data: {
        salaryPattern: state.salaryPattern,
        cashEntries: state.entries,
        installments: state.installments,
        storageAssets: state.storageAssets,
        accountBalances: state.accounts,
        asfJobs: state.asfJobs,
        irqJobs: state.irqJobs,
        partTimeJobs: state.partTimeJobs,
        ratesData: state.rates,
        entryActuals: state.entryActuals,
        entryActualDates: state.entryActualDates,
        deletedForecasts: state.deletedForecasts,
        archivedEntries: state.archivedEntries,
        categoryCaps: state.categoryCaps,
        savingsGoals: state.savingsGoals,
        // Aliases inside data:
        entries: state.entries,
        accounts: state.accounts,
        rates: state.rates,
      },
      // Root-level aliases for direct access:
      entries: state.entries,
      cashEntries: state.entries,
      accounts: state.accounts,
      accountBalances: state.accounts,
      salaryPattern: state.salaryPattern,
      installments: state.installments,
      rates: state.rates,
      ratesData: state.rates,
      storageAssets: state.storageAssets,
      categoryCaps: state.categoryCaps,
      savingsGoals: state.savingsGoals,
      asfJobs: state.asfJobs,
      irqJobs: state.irqJobs,
      partTimeJobs: state.partTimeJobs,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
      archivedEntries: state.archivedEntries,
    };
    return JSON.stringify(payload, null, 2);
  },

  importJSON: (jsonString: string) => {
    try {
      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!parsed || typeof parsed !== 'object') {
        console.error('Invalid JSON payload');
        return false;
      }

      // 1. Direct array of cash entries
      if (Array.isArray(parsed)) {
        const normalized: CashEntry[] = parsed.map((e, idx) => ({
          ...e,
          id: e.id || `entry-import-${Date.now()}-${idx}`,
          amount: Number(e.amount) || 0,
          actualAmount: e.actualAmount !== undefined && e.actualAmount !== '' ? Number(e.actualAmount) : undefined,
        }));
        saveStorage(STORAGE_KEYS.entries, normalized);
        set({ entries: normalized });
        return true;
      }

      // 2. Direct raw localStorage dump format: { "budget-control-cash-entries": [...] }
      if (parsed['budget-control-cash-entries'] || parsed['budget-control-account-balances']) {
        for (const [k, v] of Object.entries(parsed)) {
          if (k.startsWith('budget-control-')) {
            try {
              localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            } catch (_) {}
          }
        }
      }

      // Standard budget export format (may be nested in .data or at root)
      const data = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
        ? parsed.data
        : parsed;

      // 1. Cash entries: check cashEntries, entries, items
      const rawEntries = data.cashEntries || data.entries || data.items || parsed.cashEntries || parsed.entries;
      let newEntries: CashEntry[] = get().entries;
      if (Array.isArray(rawEntries)) {
        newEntries = rawEntries.map((e: any, idx: number) => ({
          ...e,
          id: e.id || `entry-import-${Date.now()}-${idx}`,
          amount: Number(e.amount) || 0,
          actualAmount: e.actualAmount !== undefined && e.actualAmount !== '' ? Number(e.actualAmount) : undefined,
        }));
        saveStorage(STORAGE_KEYS.entries, newEntries);
      }

      // 2. Accounts: check accountBalances, accounts
      const rawAccounts = data.accountBalances || data.accounts || parsed.accountBalances || parsed.accounts;
      let newAccounts: Record<string, AccountBalance> = get().accounts;
      if (rawAccounts && typeof rawAccounts === 'object') {
        const accMap: Record<string, AccountBalance> = {};
        for (const [k, v] of Object.entries(rawAccounts)) {
          if (v && typeof v === 'object' && 'balance' in (v as any)) {
            accMap[k] = {
              name: (v as any).name || k.toUpperCase(),
              balance: Number((v as any).balance) || 0,
              maturityDay: Number((v as any).maturityDay) || 1,
            };
          } else if (typeof v === 'number') {
            accMap[k] = {
              name: k.toUpperCase(),
              balance: v,
              maturityDay: k.toLowerCase().includes('hsbc') ? 30 : 15,
            };
          }
        }
        if (Object.keys(accMap).length > 0) {
          newAccounts = accMap;
          saveStorage(STORAGE_KEYS.accounts, newAccounts);
        }
      }

      // 3. Salary pattern
      const rawSalary = data.salaryPattern || parsed.salaryPattern;
      let newSalary: SalaryPayment[] = get().salaryPattern;
      if (Array.isArray(rawSalary) && rawSalary.length > 0) {
        newSalary = rawSalary.map((s: any) => ({
          monthOffset: Number(s.monthOffset) || 0,
          day: Number(s.day) || 15,
          amount: Number(s.amount) || 0,
        }));
        saveStorage(STORAGE_KEYS.salary, newSalary);
      }

      // 4. Installments
      const rawInstallments = data.installments || parsed.installments;
      let newInstallments: Installment[] = get().installments;
      if (Array.isArray(rawInstallments)) {
        newInstallments = rawInstallments.map((inst: any, idx: number) => ({
          ...inst,
          id: inst.id || `inst-${Date.now()}-${idx}`,
          name: inst.name || inst.item || 'Installment',
          amount: Number(inst.amount) || Number(inst.monthlyAmount) || 0,
          totalMonths: Number(inst.totalMonths) || Number(inst.months) || Number(inst.installmentsCount) || 1,
          remainingMonths: Number(inst.remainingMonths) || Number(inst.totalMonths) || Number(inst.months) || 1,
          startMonth: inst.startMonth || new Date().toISOString().slice(0, 7),
        }));
        saveStorage(STORAGE_KEYS.installments, newInstallments);
      }

      // 5. Rates
      const rawRates = data.ratesData || data.rates || parsed.ratesData || parsed.rates;
      let newRates: RatesData = get().rates;
      if (rawRates && typeof rawRates === 'object') {
        newRates = {
          currencies: Array.isArray(rawRates.currencies) && rawRates.currencies.length > 0 ? rawRates.currencies : defaultRates.currencies,
          gold: Array.isArray(rawRates.gold) && rawRates.gold.length > 0 ? rawRates.gold : defaultRates.gold,
        };
        saveStorage(STORAGE_KEYS.rates, newRates);
      }

      // 6. Storage assets
      const rawStorage = data.storageAssets || data.storage || parsed.storageAssets || parsed.storage;
      let newStorage: StorageAsset[] = get().storageAssets;
      if (Array.isArray(rawStorage)) {
        newStorage = rawStorage.map((asset: any, idx: number) => ({
          ...asset,
          id: asset.id || `storage-${Date.now()}-${idx}`,
          amount: Number(asset.amount) || 0,
          buyRate: Number(asset.buyRate) || 1,
        }));
        saveStorage(STORAGE_KEYS.storage, newStorage);
      }

      // 7. Category Caps
      const rawCaps = data.categoryCaps || parsed.categoryCaps;
      let newCaps: CategoryCap[] = get().categoryCaps;
      if (Array.isArray(rawCaps)) {
        newCaps = rawCaps.map((c: any) => ({
          category: c.category || '',
          cap: Number(c.cap) || 0,
        }));
        saveStorage(STORAGE_KEYS.categoryCaps, newCaps);
      }

      // 8. Savings Goals
      const rawGoals = data.savingsGoals || parsed.savingsGoals;
      let newGoals: SavingsGoal[] = get().savingsGoals;
      if (Array.isArray(rawGoals)) {
        newGoals = rawGoals.map((g: any, idx: number) => ({
          ...g,
          id: g.id || `goal-${Date.now()}-${idx}`,
          targetAmount: Number(g.targetAmount) || 0,
          currentAmount: Number(g.currentAmount) || 0,
        }));
        saveStorage(STORAGE_KEYS.savingsGoals, newGoals);
      }

      // 9. ASF Jobs
      const rawAsf = data.asfJobs || data.asf || parsed.asfJobs || parsed.asf;
      let newAsf: JobItem[] = get().asfJobs;
      if (Array.isArray(rawAsf)) {
        newAsf = rawAsf;
        saveStorage(STORAGE_KEYS.asf, newAsf);
      }

      // 10. IRQ Jobs
      const rawIrq = data.irqJobs || data.irq || parsed.irqJobs || parsed.irq;
      let newIrq: JobItem[] = get().irqJobs;
      if (Array.isArray(rawIrq)) {
        newIrq = rawIrq;
        saveStorage(STORAGE_KEYS.irq, newIrq);
      }

      // 11. Part Time Jobs
      const rawPartTime = data.partTimeJobs || parsed.partTimeJobs;
      let newPartTime: JobItem[] = get().partTimeJobs;
      if (Array.isArray(rawPartTime)) {
        newPartTime = rawPartTime;
        saveStorage(STORAGE_KEYS.partTimeJobs, newPartTime);
      }

      // 12. Actuals Tracking
      const rawActuals = data.entryActuals || parsed.entryActuals;
      let newActuals: Record<string, number> = get().entryActuals;
      if (rawActuals && typeof rawActuals === 'object') {
        newActuals = { ...get().entryActuals, ...rawActuals };
        saveStorage(STORAGE_KEYS.entryActuals, newActuals);
      }

      const rawActualDates = data.entryActualDates || parsed.entryActualDates;
      let newActualDates: Record<string, string> = get().entryActualDates;
      if (rawActualDates && typeof rawActualDates === 'object') {
        newActualDates = { ...get().entryActualDates, ...rawActualDates };
        saveStorage(STORAGE_KEYS.entryActualDates, newActualDates);
      }

      // 13. Deleted forecasts & archived entries
      const rawDeleted = data.deletedForecasts || parsed.deletedForecasts;
      let newDeleted: string[] = get().deletedForecasts;
      if (Array.isArray(rawDeleted)) {
        newDeleted = rawDeleted;
        saveStorage(STORAGE_KEYS.deletedForecasts, newDeleted);
      }

      const rawArchived = data.archivedEntries || parsed.archivedEntries;
      let newArchived: CashEntry[] = get().archivedEntries;
      if (Array.isArray(rawArchived)) {
        newArchived = rawArchived;
        saveStorage(STORAGE_KEYS.archivedEntries, newArchived);
      }

      // 14. Preserve auxiliary legacy localStorage keys
      try {
        if (data.creditDues || parsed.creditDues) {
          localStorage.setItem('budget-control-credit-dues', JSON.stringify(data.creditDues || parsed.creditDues));
        }
        if (data.creditDueMonths || parsed.creditDueMonths) {
          localStorage.setItem('budget-control-credit-due-months', JSON.stringify(data.creditDueMonths || parsed.creditDueMonths));
        }
        if (data.creditSettlementOverrides || parsed.creditSettlementOverrides) {
          localStorage.setItem('budget-control-credit-settlement-overrides', JSON.stringify(data.creditSettlementOverrides || parsed.creditSettlementOverrides));
        }
        if (data.salaryAnchorMonth || parsed.salaryAnchorMonth) {
          localStorage.setItem('budget-control-salary-anchor', JSON.stringify(data.salaryAnchorMonth || parsed.salaryAnchorMonth));
        }
        localStorage.setItem('budget-control-salary-materialized', 'true');
        localStorage.setItem('budget-control-seed-version', 'blank-template-v2');
      } catch (_) {}

      // Update Zustand state
      set({
        entries: newEntries,
        accounts: newAccounts,
        salaryPattern: newSalary,
        installments: newInstallments,
        rates: newRates,
        storageAssets: newStorage,
        categoryCaps: newCaps,
        savingsGoals: newGoals,
        asfJobs: newAsf,
        irqJobs: newIrq,
        partTimeJobs: newPartTime,
        entryActuals: newActuals,
        entryActualDates: newActualDates,
        deletedForecasts: newDeleted,
        archivedEntries: newArchived,
      });

      return true;
    } catch (e) {
      console.error('Failed to import JSON data:', e);
      return false;
    }
  },
}));
