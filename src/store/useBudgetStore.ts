// ==========================================================================
// Complete Zustand Budget Store with Full Legacy LocalStorage Sync
// ==========================================================================
import { create } from 'zustand';
import type {
  AccountBalance,
  CashEntry,
  EntryDraw,
  Installment,
  JobItem,
  JobPayment,
  RatesData,
  SalaryPayment,
  StorageAsset,
} from '../types';
import {
  defaultRates,
  resolveRateSourceValue,
  computeTotalStorageValue,
  inferAssetLocation,
  getCurrencyRate,
} from '../engine/currency';
import { calculateJobFinancials } from '../engine/jobs';
import {
  buildCreditDueEntries,
  getCreditSettlementMonth,
  isCardExpenseForAccount,
  isLumpCreditDueForAccount,
} from '../engine/creditCards';
import { buildSalaryEntries } from '../engine/salaryAndInstallments';
import { DateUtils } from '../engine/dateUtils';
import { migrateBackupPayload } from '../engine/migration';

let gistSyncTimer: ReturnType<typeof setTimeout> | null = null;
let gistSyncInFlight = false;
let quotaAlertShown = false;

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
  entryActuals: 'budget-control-entry-actuals',
  entryActualDates: 'budget-control-entry-actual-dates',
  deletedForecasts: 'budget-control-deleted-forecasts',
  archivedEntries: 'budget-control-archived-entries',
  theme: 'budget-control-theme',
  gistToken: 'budget-control-gist-token',
  gistId: 'budget-control-gist-id',
  gistAutoSync: 'budget-control-gist-autosync',
  resetBackup: 'budget-control-reset-backup',
  historyAdminUnlocked: 'budget-control-history-admin-unlocked',
  sidebarCollapsed: 'budget-control-sidebar-collapsed',
  creditDues: 'budget-control-credit-dues',
  creditDueMonths: 'budget-control-credit-due-months',
  creditSettlementOverrides: 'budget-control-credit-settlement-overrides',
  salaryAnchor: 'budget-control-salary-anchor',
  forecastStartMonth: 'budget-control-forecast-start-month',
  forecastQuarters: 'budget-control-forecast-quarters',
  importUndoBackup: 'budget-control-import-undo-backup',
  lastLocalModified: 'budget-control-last-local-modified',
  lastGistUpload: 'budget-control-last-gist-upload',
};

function loadStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
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
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving ${key} to localStorage:`, err);
    const isQuotaError = typeof DOMException !== 'undefined' && err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (isQuotaError && !quotaAlertShown && typeof window !== 'undefined') {
      quotaAlertShown = true;
      window.alert(
        'Browser storage quota reached.\n\n' +
        'Export a JSON backup immediately, then archive old transactions or clear unused history.'
      );
    }
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
  asfJobs: JobItem[];
  irqJobs: JobItem[];
  partTimeJobs: JobItem[];

  // Actuals Tracking
  entryActuals: Record<string, number>;
  entryActualDates: Record<string, string>;

  // Credit Dues & Legacy Overrides
  creditDues: Record<string, Record<string, number>>;
  creditDueMonths: Record<string, string[]>;
  creditSettlementOverrides: Record<string, { amount?: number; date?: string; note?: string; tag?: string; account?: string; draws?: EntryDraw[] }>;
  salaryAnchorMonth: string;

  // Cloud Sync & Admin
  gistToken: string;
  gistId: string;
  gistAutoSync: boolean;
  gistSyncStatus: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error';
  gistConflict: { remoteTime?: string; remoteData: string } | null;
  historyAdminUnlocked: boolean;

  resolveGistConflict: (resolution: 'local' | 'remote') => Promise<void>;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: ViewTab) => void;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;

  addEntry: (entry: Omit<CashEntry, 'id'>) => string;
  updateEntry: (id: string, updates: Partial<CashEntry>, seriesMode?: 'single' | 'future') => void;
  deleteEntry: (id: string, seriesMode?: 'single' | 'future', options?: { deleteLinkedLoan?: boolean; deleteInstallmentPlan?: boolean; revertStorage?: boolean; storageAssetId?: string; syncJob?: boolean }) => void;
  recordActual: (entryId: string, amount: number, date?: string, drawMeta?: { note?: string; tag?: string; account?: string }) => void;
  clearActual: (entryId: string, options?: { revertStorage?: boolean; storageAssetId?: string; syncJob?: boolean }) => void;
  addDraw: (entryId: string, draw: { id?: string; date: string; amount: number; note?: string; tag?: string; account?: string }) => void;
  updateDraw: (entryId: string, drawIndex: number, draw: { date: string; amount: number; note?: string; tag?: string; account?: string }) => void;
  deleteDraw: (entryId: string, drawIndex: number, options?: { updateCashflow?: boolean; syncJob?: boolean; revertStorage?: boolean; storageAssetId?: string }) => void;
  updateCreditSettlementOverride: (id: string, override: { amount?: number; date?: string; note?: string }) => void;
  recalculateCreditSettlement: (id: string) => CashEntry | undefined;

  updateAccountBalance: (accountKey: string, newBalance: number) => void;
  updateSalaryPattern: (pattern: SalaryPayment[]) => void;
  populateSalaryForecast: (startMonth: string, quarters: number, anchorMonth?: string) => number;
  clearSalaryForecast: (startMonth?: string, quarters?: number) => number;

  addInstallment: (installment: Omit<Installment, 'id'>) => void;
  updateInstallment: (id: string, updates: Partial<Installment>) => void;
  deleteInstallment: (id: string, options?: { deleteCashEntries?: boolean }) => void;

  updateRates: (rates: RatesData, syncImmediately?: boolean) => void;
  syncStorageRates: (rates?: RatesData) => void;

  addStorageAsset: (asset: Omit<StorageAsset, 'id'>) => void;
  updateStorageAsset: (id: string, updates: Partial<StorageAsset>) => void;
  deleteStorageAsset: (id: string) => void;
  depositToStorageAsset: (assetId: string, amount: number) => void;
  transferStorageAsset: (fromAssetId: string, toAssetId: string, amount: number) => boolean;
  convertStorageAssetToEgp: (
    assetId: string,
    foreignAmount: number,
    targetAccount: string,
    customRate?: number
  ) => string | undefined;

  // Jobs Actions
  saveJob: (jobType: 'asf' | 'irq' | 'partTime', job: JobItem) => void;
  deleteJob: (jobType: 'asf' | 'irq' | 'partTime', jobId: string, options?: { deleteCashEntries?: boolean }) => void;
  deleteJobPayment: (
    jobType: 'asf' | 'irq' | 'partTime',
    jobId: string,
    paymentId: string,
    options?: { syncCashflow?: boolean; deleteCashEntry?: boolean; revertStorage?: boolean; storageAssetId?: string }
  ) => void;
  settleJobForecastPayment: (entryId: string, actualEgp: number, isFinishing?: boolean) => boolean;

  archiveSettledEntries: () => number;
  unarchiveEntry: (id: string) => void;

  setGistConfig: (token: string, gistId: string, autoSync: boolean) => void;
  syncFromGist: (token?: string, gistId?: string) => Promise<boolean>;
  autoTagEntries: () => number;
  resetData: () => void;
  restoreResetBackup: () => boolean;
  undoImport: () => boolean;
  restoreDeletedForecast: (id: string) => void;
  clearAllDeletedForecasts: () => void;

  exportJSON: () => string;
  importJSON: (jsonString: string) => boolean;
}

let lastLocalMutationTimestamp = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(STORAGE_KEYS.lastLocalModified) || 0) || 0 : 0;
let lastGistUploadTimestamp = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(STORAGE_KEYS.lastGistUpload) || 0) || 0 : 0;

function scheduleAutoGistSync(getState: () => BudgetStoreState, immediate = false): void {
  lastLocalMutationTimestamp = Date.now();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.lastLocalModified, String(lastLocalMutationTimestamp));
  }
  if (gistSyncTimer) {
    clearTimeout(gistSyncTimer);
    gistSyncTimer = null;
  }
  useBudgetStore.setState({ gistSyncStatus: 'scheduled' });

  const executeSync = async () => {
    gistSyncTimer = null;
    const state = getState();
    if (!state.gistAutoSync || !state.gistToken || !state.gistId) {
      useBudgetStore.setState({ gistSyncStatus: 'idle' });
      return;
    }
    if (gistSyncInFlight) {
      scheduleAutoGistSync(getState, false);
      return;
    }
    gistSyncInFlight = true;
    useBudgetStore.setState({ gistSyncStatus: 'syncing' });
    try {
      const response = await fetch(`https://api.github.com/gists/${state.gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${state.gistToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Budget Control Backup',
          files: {
            'budget-data.json': { content: state.exportJSON() },
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Gist auto-sync failed: ${response.status} ${response.statusText}`);
      }
      lastGistUploadTimestamp = Date.now();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
      }
      useBudgetStore.setState({ gistSyncStatus: 'synced' });
    } catch (error) {
      console.error(error);
      useBudgetStore.setState({ gistSyncStatus: 'error' });
    } finally {
      gistSyncInFlight = false;
    }
  };

  if (immediate) {
    void executeSync();
  } else {
    gistSyncTimer = setTimeout(executeSync, 1500);
  }
}

const defaultAccounts: Record<string, AccountBalance> = {
  cib: { name: 'CIB', balance: 0, maturityDay: 15 },
  hsbc: { name: 'HSBC', balance: 0, maturityDay: 30 },
};

function withoutCashAccount(accounts: Record<string, AccountBalance>): Record<string, AccountBalance> {
  const { cash: _cash, ...remaining } = accounts;
  return remaining;
}

const defaultSalaryPattern: SalaryPayment[] = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 },
];

export function inferTag(entry: Partial<CashEntry>): string {
  const category = (entry.category || '').toLowerCase();
  const source = (entry.source || '').toLowerCase();
  const creditType = (entry.creditType || '').toLowerCase();
  if (creditType === 'cib' || creditType === 'hsbc' || category.includes('credit due')) return 'Credit';
  if (source.includes('loan') || category.includes('loan') || category.includes('repayment')) return 'Loan';
  if (source === 'salary' || category === 'salary' || category.includes('bonus')) return 'Salary';
  if (source.includes('part-time') || category.includes('freelance')) return 'Part-Time';
  if (/electric|mobile|phone|internet|wifi|gas|water|utility|bills/.test(category)) return 'Bills';
  if (/kids|school|tuition|nursery|course/.test(category)) return 'Kids';
  if (/food|grocer|supermarket|market|^home$/.test(category)) return 'Food';
  if (/fix|repair|maintenance/.test(category)) return 'Maintenance';
  if (/amazon|noon|shopping/.test(category)) return 'Shopping';
  if (/medical|pharmacy|doctor|hospital|medicine/.test(category)) return 'Medical';
  if (source === 'installment' || category.includes('installment')) return 'Installment';
  return '';
}

function revertStorageOrAccountBalance(
  get: () => BudgetStoreState,
  params: {
    assetId?: string;
    account?: string;
    currency?: string;
    amount: number;
    isEgpAmount?: boolean;
    fxRate?: number;
    entryType?: 'income' | 'expense';
  }
) {
  const { assetId, account, currency = 'USD', amount, isEgpAmount = false, fxRate, entryType = 'income' } = params;
  if (!amount || amount <= 0) return;

  const storageAssets = get().storageAssets;
  const currUpper = (currency || 'USD').toUpperCase();
  const isForeign = currUpper !== 'EGP';
  const accountLower = (account || '').toLowerCase().trim();

  // 1. Direct assetId match
  let targetAsset = assetId ? storageAssets.find((a) => a.id === assetId) : undefined;

  // 2. Match by exact asset name (e.g. "HSBC USD Account", "USD Cash in Hand")
  if (!targetAsset && account) {
    targetAsset = storageAssets.find(
      (a) => a.name.trim().toLowerCase() === accountLower
    );
  }

  // 3. Match by account keyword and currency
  if (!targetAsset && isForeign) {
    if (accountLower.includes('hsbc') || accountLower.includes('bank')) {
      targetAsset = storageAssets.find(
        (a) => a.name.toLowerCase().includes('hsbc') && (a.unit || '').toUpperCase() === currUpper
      );
    } else if (accountLower.includes('cash') || accountLower.includes('hand') || accountLower.includes('vault')) {
      targetAsset = storageAssets.find(
        (a) => a.name.toLowerCase().includes('cash') && (a.unit || '').toUpperCase() === currUpper
      );
    }
  }

  // 4. Fallback match by unit / currency
  if (!targetAsset && isForeign) {
    targetAsset = storageAssets.find(
      (a) => (a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper
    );
  }

  if (targetAsset) {
    let nativeQty = amount;
    if (isEgpAmount && isForeign) {
      const rate = fxRate || targetAsset.rate || targetAsset.buyPrice || getCurrencyRate(get().rates, currUpper) || 1;
      nativeQty = Math.round((amount / rate) * 100) / 100;
    }
    const currentQty = Number(targetAsset.quantity) || 0;
    const nextQty = entryType === 'expense'
      ? currentQty + nativeQty // Reverting an expense refunds/adds back to storage
      : Math.max(0, currentQty - nativeQty); // Reverting an income deducts the deposited funds
    get().updateStorageAsset(targetAsset.id, { quantity: nextQty });
    return;
  }

  // If it's a bank account in accounts (e.g. cib, hsbc EGP)
  if (!isForeign && get().accounts[accountLower]) {
    const currentBal = get().accounts[accountLower].balance || 0;
    const nextBal = entryType === 'expense'
      ? currentBal + amount // Reverting an expense refunds/adds back to bank balance
      : Math.max(0, currentBal - amount); // Reverting an income deducts the deposited money
    get().updateAccountBalance(accountLower, nextBal);
  }
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  theme: loadStorage<'dark' | 'light'>(STORAGE_KEYS.theme, 'light'),
  activeTab: 'dashboard',
  sidebarCollapsed: loadStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false),

  entries: loadStorage<CashEntry[]>(STORAGE_KEYS.entries, []),
  archivedEntries: loadStorage<CashEntry[]>(STORAGE_KEYS.archivedEntries, []),
  deletedForecasts: loadStorage<string[]>(STORAGE_KEYS.deletedForecasts, []),
  accounts: withoutCashAccount(loadStorage<Record<string, AccountBalance>>(STORAGE_KEYS.accounts, defaultAccounts)),
  salaryPattern: loadStorage<SalaryPayment[]>(STORAGE_KEYS.salary, defaultSalaryPattern),
  installments: loadStorage<Installment[]>(STORAGE_KEYS.installments, []),
  rates: loadStorage<RatesData>(STORAGE_KEYS.rates, defaultRates),
  storageAssets: (loadStorage<StorageAsset[]>(STORAGE_KEYS.storage, []) || []).map((asset) => {
    const loc = inferAssetLocation(asset);
    return {
      ...asset,
      locationType: asset.locationType || loc.locationType,
      location: asset.location || loc.location,
      locationLabel: asset.locationLabel || loc.locationLabel,
    };
  }),

  asfJobs: loadStorage<JobItem[]>(STORAGE_KEYS.asf, []),
  irqJobs: loadStorage<JobItem[]>(STORAGE_KEYS.irq, []),
  partTimeJobs: loadStorage<JobItem[]>(STORAGE_KEYS.partTimeJobs, []),

  entryActuals: loadStorage<Record<string, number>>(STORAGE_KEYS.entryActuals, {}),
  entryActualDates: loadStorage<Record<string, string>>(STORAGE_KEYS.entryActualDates, {}),

  creditDues: loadStorage<Record<string, Record<string, number>>>(STORAGE_KEYS.creditDues, {}),
  creditDueMonths: loadStorage<Record<string, string[]>>(STORAGE_KEYS.creditDueMonths, {}),
  creditSettlementOverrides: loadStorage<Record<string, { amount?: number; date?: string; note?: string; tag?: string; account?: string; draws?: EntryDraw[] }>>(STORAGE_KEYS.creditSettlementOverrides, {}),
  salaryAnchorMonth: loadStorage<string>(STORAGE_KEYS.salaryAnchor, new Date().toISOString().slice(0, 7)),

  gistToken: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.gistToken) || '' : '',
  gistId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.gistId) || '' : '',
  gistAutoSync: typeof localStorage !== 'undefined'
    ? (localStorage.getItem(STORAGE_KEYS.gistAutoSync) === null ? true : localStorage.getItem(STORAGE_KEYS.gistAutoSync) === 'true')
    : true,
  gistSyncStatus: 'idle',
  gistConflict: null,
  historyAdminUnlocked: typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEYS.historyAdminUnlocked) === 'true'
    : false,

  setTheme: (theme) => {
    saveStorage(STORAGE_KEYS.theme, theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
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
    const id = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newEntry: CashEntry = {
      ...entryData,
      id,
    };
    const updated = [newEntry, ...get().entries];
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
    scheduleAutoGistSync(get);
    return id;
  },

  updateEntry: (id, updates, seriesMode = 'single') => {
    if (id.startsWith('credit-settlement-')) {
      const existingOverride = get().creditSettlementOverrides[id] || {};
      const updatedOverride = {
        ...existingOverride,
        ...(updates.amount !== undefined ? { amount: Number(updates.amount) } : {}),
        ...(updates.date ? { date: updates.date } : {}),
        ...(updates.statementNote !== undefined ? { note: updates.statementNote } : {}),
        ...(updates.tag !== undefined ? { tag: updates.tag } : {}),
        ...(updates.account !== undefined ? { account: updates.account } : {}),
        ...(updates.draws !== undefined ? { draws: updates.draws } : {}),
      };
      const nextOverrides = { ...get().creditSettlementOverrides, [id]: updatedOverride };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
      set({ creditSettlementOverrides: nextOverrides });
      if (updates.actualAmount !== undefined) {
        const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
        const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({ entryActuals: actuals, entryActualDates: dates });
      }
      scheduleAutoGistSync(get);
      return;
    }

    const inEntries = get().entries.find((e) => e.id === id);
    const inArchived = get().archivedEntries.find((e) => e.id === id);
    if (!inEntries && !inArchived) return;

    if (!inEntries && inArchived) {
      const updatedArchived = get().archivedEntries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      set({ archivedEntries: updatedArchived });
      if (updates.actualAmount !== undefined) {
        const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
        const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({ entryActuals: actuals, entryActualDates: dates });
      }
      if (updates.isClosed === true) {
        const currentActual = get().entryActuals[id] ?? updates.actualAmount ?? updates.amount ?? 0;
        get().settleJobForecastPayment(id, Number(currentActual) || 0, true);
      }
      scheduleAutoGistSync(get);
      return;
    }

    const current = inEntries!;

    if (seriesMode === 'future' && (current.seriesId || current.isRecurring)) {
      const seriesId = current.seriesId || id;
      const targetDate = current.date;
      const updated = get().entries.map((e) => {
        const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
        const isFutureOrCurrent = e.date >= targetDate;
        const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
        if (matchesSeries && isFutureOrCurrent && !isActualized) {
          return {
            ...e,
            ...updates,
            id: e.id,
            date: e.date, // keep original scheduled date
            seriesId,
          };
        }
        return e;
      });
      saveStorage(STORAGE_KEYS.entries, updated);
      set({ entries: updated });
      scheduleAutoGistSync(get);
      return;
    }

    const updated = get().entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
    const updatedEntry = updated.find((e) => e.id === id);
    if (
      current &&
      updatedEntry &&
      current.type === 'income' &&
      current.loanId &&
      Number(updates.amount) > 0 &&
      Number(updates.amount) !== Number(current.amount)
    ) {
      const ratio = Number(updates.amount) / Number(current.amount || 1);
      const shouldScale = typeof window === 'undefined' || window.confirm(
        'This loan disbursement has a linked repayment. Scale the repayment to match the new disbursement amount?'
      );
      const linkedEntries = updated.map((entry) =>
        shouldScale && entry.loanId === current.loanId && entry.type === 'expense'
          ? { ...entry, amount: Math.round(Number(entry.initialAmount || entry.amount) * ratio), initialAmount: entry.initialAmount || entry.amount }
          : entry
      );
      saveStorage(STORAGE_KEYS.entries, linkedEntries);
      set({ entries: linkedEntries });
      scheduleAutoGistSync(get);
      return;
    }
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
    if (updates.actualAmount !== undefined) {
      const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
      const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({ entryActuals: actuals, entryActualDates: dates });
    }
    if (updates.isClosed === true) {
      const currentActual = get().entryActuals[id] ?? updates.actualAmount ?? updates.amount ?? 0;
      get().settleJobForecastPayment(id, Number(currentActual) || 0, true);
    }
    scheduleAutoGistSync(get);
  },

  deleteEntry: (id, seriesMode = 'single', options) => {
    const inEntries = get().entries.find((e) => e.id === id);
    const inArchived = get().archivedEntries.find((e) => e.id === id);
    const target = inEntries || inArchived;

    // 1. Series deletion
    let updatedEntries = get().entries;
    let updatedArchived = get().archivedEntries;

    if (seriesMode === 'future' && target && (target.seriesId || target.isRecurring)) {
      const seriesId = target.seriesId || id;
      const targetDate = target.date;
      updatedEntries = updatedEntries.filter((e) => {
        const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
        const isFutureOrCurrent = e.date >= targetDate;
        const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
        return !(matchesSeries && isFutureOrCurrent && !isActualized);
      });
      updatedArchived = updatedArchived.filter((e) => {
        const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
        const isFutureOrCurrent = e.date >= targetDate;
        const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
        return !(matchesSeries && isFutureOrCurrent && !isActualized);
      });
    } else {
      updatedEntries = updatedEntries.filter((e) => e.id !== id);
      updatedArchived = updatedArchived.filter((e) => e.id !== id);
    }

    // 2. Handle linked loans & installment plans
    const linkedLoanId = target?.type === 'income' ? target.loanId : undefined;
    const shouldDeleteLinked = Boolean(
      linkedLoanId && (options?.deleteLinkedLoan !== undefined ? options.deleteLinkedLoan : true)
    );
    const shouldDeleteInstallmentPlan = Boolean(options?.deleteInstallmentPlan);
    if (shouldDeleteLinked && linkedLoanId) {
      updatedEntries = updatedEntries.filter((e) => e.loanId !== linkedLoanId);
      updatedArchived = updatedArchived.filter((e) => e.loanId !== linkedLoanId);
    }
    let updatedInstallments = shouldDeleteLinked && linkedLoanId
      ? get().installments.filter((installment) => installment.id !== linkedLoanId && installment.loanId !== linkedLoanId)
      : get().installments;

    if (shouldDeleteInstallmentPlan) {
      updatedInstallments = updatedInstallments.filter((inst) => {
        if (id.includes(inst.id)) return false;
        if (target?.loanId && (inst.id === target.loanId || (inst as any).loanId === target.loanId)) return false;
        if (target?.category && inst.name.toLowerCase().trim() === target.category.toLowerCase().trim()) return false;
        return true;
      });
    }

    // 3. If credit settlement entry, clean up manual lump payment and overrides
    let updatedOverrides = { ...get().creditSettlementOverrides };
    if (id.startsWith('credit-settlement-')) {
      const parts = id.split('-');
      const accountKey = parts[2];
      const monthKey = `${parts[3]}-${parts[4]}`;
      updatedEntries = updatedEntries.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
      updatedArchived = updatedArchived.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
      delete updatedOverrides[id];
    } else if (updatedOverrides[id]) {
      delete updatedOverrides[id];
    }

    // 4. Clean up entryActuals and entryActualDates
    const actuals = { ...get().entryActuals };
    delete actuals[id];
    const dates = { ...get().entryActualDates };
    delete dates[id];

    // 5. Track in deletedForecasts so virtual/calculated forecasts won't regenerate
    const deletedForecasts = get().deletedForecasts.includes(id)
      ? get().deletedForecasts
      : [...get().deletedForecasts, id];

    // 6. Clean up linked forecast scheduling or payments on any job
    const cleanJobForecast = (job: JobItem): JobItem => {
      let changed = false;
      let nextForecastEntryId = job.forecastEntryId;
      let nextForecastDueDate = job.forecastDueDate;
      let nextForecastAmount = job.forecastAmount;
      let nextForecastDestination = job.forecastDestination;
      let nextPayments = job.payments;

      if (job.forecastEntryId === id) {
        changed = true;
        nextForecastEntryId = undefined;
        nextForecastDueDate = undefined;
        nextForecastAmount = undefined;
        nextForecastDestination = undefined;
      }

      if (options?.syncJob !== false && job.payments && job.payments.some((p) => p.entryId === id || (target?.draws && target.draws.some((d) => d.id === p.id)))) {
        changed = true;
        nextPayments = job.payments.filter((p) => !(p.entryId === id || (target?.draws && target.draws.some((d) => d.id === p.id))));
      }

      if (changed) {
        const updatedJob: JobItem = {
          ...job,
          forecastEntryId: nextForecastEntryId,
          forecastDueDate: nextForecastDueDate,
          forecastAmount: nextForecastAmount,
          forecastDestination: nextForecastDestination,
          payments: nextPayments,
        };
        if (nextPayments !== job.payments) {
          const fin = calculateJobFinancials(updatedJob, get().rates);
          updatedJob.status = fin.computedStatus;
        }
        return updatedJob;
      }
      return job;
    };

    let asfJobsUpdated = false;
    const updatedAsf = get().asfJobs.map((j) => {
      const next = cleanJobForecast(j);
      if (next !== j) asfJobsUpdated = true;
      return next;
    });

    let irqJobsUpdated = false;
    const updatedIrq = get().irqJobs.map((j) => {
      const next = cleanJobForecast(j);
      if (next !== j) irqJobsUpdated = true;
      return next;
    });

    let partTimeJobsUpdated = false;
    const updatedPartTime = get().partTimeJobs.map((j) => {
      const next = cleanJobForecast(j);
      if (next !== j) partTimeJobsUpdated = true;
      return next;
    });

    // 7. Revert storage holding if selected
    if (options?.revertStorage && target) {
      const isForeign = (target.currency || 'EGP').toUpperCase() !== 'EGP';
      const actualAmt = Number(get().entryActuals[id] ?? target.actualAmount ?? target.amount ?? 0);
      revertStorageOrAccountBalance(get, {
        assetId: options.storageAssetId,
        account: target.account,
        currency: target.currency,
        amount: actualAmt,
        isEgpAmount: !isForeign || !target.originalAmount,
        fxRate: target.fxRateAtEntry,
        entryType: target.type,
      });
    }

    // 7. Persist
    saveStorage(STORAGE_KEYS.entries, updatedEntries);
    saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
    if (updatedInstallments !== get().installments) {
      saveStorage(STORAGE_KEYS.installments, updatedInstallments);
    }
    saveStorage(STORAGE_KEYS.creditSettlementOverrides, updatedOverrides);
    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    saveStorage(STORAGE_KEYS.deletedForecasts, deletedForecasts);
    if (asfJobsUpdated) saveStorage(STORAGE_KEYS.asf, updatedAsf);
    if (irqJobsUpdated) saveStorage(STORAGE_KEYS.irq, updatedIrq);
    if (partTimeJobsUpdated) saveStorage(STORAGE_KEYS.partTimeJobs, updatedPartTime);

    set({
      entries: updatedEntries,
      archivedEntries: updatedArchived,
      installments: updatedInstallments,
      creditSettlementOverrides: updatedOverrides,
      entryActuals: actuals,
      entryActualDates: dates,
      deletedForecasts,
      asfJobs: updatedAsf,
      irqJobs: updatedIrq,
      partTimeJobs: updatedPartTime,
    });
    scheduleAutoGistSync(get);
  },

  recordActual: (entryId, amount, date, drawMeta) => {
    const actDate = date || DateUtils.todayString();
    const actuals = { ...get().entryActuals, [entryId]: amount };
    const dates = { ...get().entryActualDates };
    if (date) dates[entryId] = date;

    if (entryId.startsWith('credit-settlement-')) {
      const existingOverride = get().creditSettlementOverrides[entryId] || {};
      const prevActual = Number(get().entryActuals[entryId] ?? 0);
      const tranche = amount > prevActual ? amount - prevActual : amount;

      let draws = Array.isArray(existingOverride.draws) ? [...existingOverride.draws] : [];
      if (draws.length === 0 && prevActual > 0) {
        draws.push({
          id: `draw-${Date.now()}-0`,
          date: actDate,
          amount: prevActual,
          tag: existingOverride.tag || 'Credit',
          account: existingOverride.account || 'cib',
        });
      }

      if (tranche > 0 && amount > prevActual) {
        draws.push({
          id: `draw-${Date.now()}-${draws.length}`,
          date: actDate,
          amount: tranche,
          tag: drawMeta?.tag || existingOverride.tag || 'Credit',
          account: drawMeta?.account || existingOverride.account || 'cib',
          note: drawMeta?.note,
        });
      }

      const updatedOverride = {
        ...existingOverride,
        tag: drawMeta?.tag || existingOverride.tag || 'Credit',
        account: drawMeta?.account || existingOverride.account || 'cib',
        draws,
      };
      const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
      set({ creditSettlementOverrides: nextOverrides });
    }

    const existingIndex = get().entries.findIndex((e) => e.id === entryId);
    let updatedEntries = get().entries;
    let updatedArchived = get().archivedEntries;

    if (existingIndex !== -1) {
      const entry = get().entries[existingIndex];
      const prevActual = Number(get().entryActuals[entryId] ?? entry.actualAmount ?? 0);
      const tranche = amount > prevActual ? amount - prevActual : amount;

      let draws = Array.isArray(entry.draws) ? [...entry.draws] : [];
      if (draws.length === 0 && prevActual > 0) {
        draws.push({
          id: `draw-${Date.now()}-0`,
          date: entry.actualDate || entry.date || actDate,
          amount: prevActual,
          tag: entry.tag || '',
          account: entry.account || 'cash',
        });
      }

      if (tranche > 0 && amount > prevActual) {
        draws.push({
          id: `draw-${Date.now()}-${draws.length}`,
          date: actDate,
          amount: tranche,
          tag: drawMeta?.tag || entry.tag || '',
          account: drawMeta?.account || entry.account || 'cash',
          note: drawMeta?.note,
        });
      }

      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: amount,
        actualDate: actDate,
        draws,
      };
      updatedEntries = [...get().entries];
      updatedEntries[existingIndex] = updatedEntry;
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
    } else {
      const archivedIndex = get().archivedEntries.findIndex((e) => e.id === entryId);
      if (archivedIndex !== -1) {
        const entry = get().archivedEntries[archivedIndex];
        const prevActual = Number(get().entryActuals[entryId] ?? entry.actualAmount ?? 0);
        const tranche = amount > prevActual ? amount - prevActual : amount;

        let draws = Array.isArray(entry.draws) ? [...entry.draws] : [];
        if (draws.length === 0 && prevActual > 0) {
          draws.push({
            id: `draw-${Date.now()}-0`,
            date: entry.actualDate || entry.date || actDate,
            amount: prevActual,
            tag: entry.tag || '',
            account: entry.account || 'cash',
          });
        }

        if (tranche > 0 && amount > prevActual) {
          draws.push({
            id: `draw-${Date.now()}-${draws.length}`,
            date: actDate,
            amount: tranche,
            tag: drawMeta?.tag || entry.tag || '',
            account: drawMeta?.account || entry.account || 'cash',
            note: drawMeta?.note,
          });
        }

        const updatedEntry: CashEntry = {
          ...entry,
          actualAmount: amount,
          actualDate: actDate,
          draws,
        };
        updatedArchived = [...get().archivedEntries];
        updatedArchived[archivedIndex] = updatedEntry;
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      }
    }

    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({
      entries: updatedEntries,
      archivedEntries: updatedArchived,
      entryActuals: actuals,
      entryActualDates: dates,
    });
    get().settleJobForecastPayment(entryId, amount, false);
    scheduleAutoGistSync(get);
  },

  clearActual: (entryId, options) => {
    const actuals = { ...get().entryActuals };
    delete actuals[entryId];
    const dates = { ...get().entryActualDates };
    delete dates[entryId];

    const existingIndex = get().entries.findIndex((e) => e.id === entryId);
    let updatedEntries = get().entries;
    if (existingIndex !== -1) {
      const entry = get().entries[existingIndex];
      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: undefined,
        actualDate: undefined,
        draws: [],
        isClosed: false,
      };
      delete (updatedEntry as any).keepOngoing;
      updatedEntries = [...get().entries];
      updatedEntries[existingIndex] = updatedEntry;
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
    }

    const archivedIndex = get().archivedEntries.findIndex((e) => e.id === entryId);
    let updatedArchived = get().archivedEntries;
    if (archivedIndex !== -1) {
      const entry = get().archivedEntries[archivedIndex];
      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: undefined,
        actualDate: undefined,
        draws: [],
        isClosed: false,
      };
      delete (updatedEntry as any).keepOngoing;
      updatedArchived = [...get().archivedEntries];
      updatedArchived[archivedIndex] = updatedEntry;
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
    }

    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({
      entries: updatedEntries,
      archivedEntries: updatedArchived,
      entryActuals: actuals,
      entryActualDates: dates,
    });

    if (options?.syncJob !== false) {
      // If this entry was linked to a job forecast payment, revert job status & storage deposit
      let jobType: 'partTime' | 'asf' | 'irq' = 'partTime';
      let targetJob = get().partTimeJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
      if (!targetJob) {
        targetJob = get().asfJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
        if (targetJob) jobType = 'asf';
      }
      if (!targetJob) {
        targetJob = get().irqJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
        if (targetJob) jobType = 'irq';
      }

      if (targetJob) {
        const entry = get().entries.find((e) => e.id === entryId) || get().archivedEntries.find((e) => e.id === entryId);
        const linkedPayment = targetJob.payments?.find((p) => p.entryId === entryId);

        // Revert deposited funds from Storage or Bank balance (if it was deposited and not unticked)
        if (options?.revertStorage !== false) {
          const isNoDeposit = (entry?.account || linkedPayment?.account || linkedPayment?.settlementAccount || '').toLowerCase().includes('no deposit') || (entry?.account || linkedPayment?.account || linkedPayment?.settlementAccount || '').toLowerCase().includes('recorded only');
          if (linkedPayment && linkedPayment.amount > 0 && !isNoDeposit) {
            const paidAmt = Number(linkedPayment.amount) || 0;
            const jobCurrency = (targetJob.currency || linkedPayment.currency || 'USD').toUpperCase();
            const isForeign = jobCurrency !== 'EGP';
            const dest = (targetJob.forecastDestination || '').trim();
            const accountField = (entry?.account || linkedPayment.account || linkedPayment.settlementAccount || '').toLowerCase().trim();

            if (options?.storageAssetId) {
              const existing = get().storageAssets.find((a) => a.id === options.storageAssetId);
              if (existing) {
                get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            } else if (dest === 'storage:hsbc_usd' || (!dest && isForeign && jobCurrency === 'USD' && accountField.includes('hsbc')) || accountField.includes('hsbc_usd') || accountField.includes('hsbc usd')) {
              const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'USD');
              if (existing) {
                get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            } else if (dest === 'storage:cash_usd' || (!dest && isForeign && jobCurrency === 'USD' && (accountField.includes('cash') || !accountField.includes('hsbc'))) || accountField.includes('cash_usd') || accountField.includes('usd cash')) {
              const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('cash') && a.unit.toUpperCase() === 'USD');
              if (existing) {
                get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            } else if (dest === 'storage:hsbc_eur' || (!dest && isForeign && jobCurrency === 'EUR' && accountField.includes('hsbc')) || accountField.includes('hsbc_eur') || accountField.includes('hsbc eur')) {
              const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'EUR');
              if (existing) {
                get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            } else if (dest.startsWith('storage:existing-')) {
              const assetId = dest.replace('storage:existing-', '');
              const existing = get().storageAssets.find((a) => a.id === assetId);
              if (existing) {
                get().updateStorageAsset(assetId, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            } else if (dest.startsWith('account:') || get().accounts[accountField]) {
              const accKey = dest.startsWith('account:') ? dest.replace('account:', '') : accountField;
              const egpAmt = linkedPayment.egpAmount || Math.round(paidAmt * (entry?.fxRateAtEntry || getCurrencyRate(get().rates, jobCurrency)));
              if (get().accounts[accKey]) {
                const currentBal = get().accounts[accKey].balance || 0;
                get().updateAccountBalance(accKey, Math.max(0, currentBal - egpAmt));
              }
            } else if (isForeign) {
              const existing = get().storageAssets.find((a) => a.unit.toUpperCase() === jobCurrency);
              if (existing) {
                get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
              }
            }
          }
        }

        // Filter out this payment from job
        const remainingPayments = (targetJob.payments || []).filter((p) => p.entryId !== entryId);
        const remainingJob = { ...targetJob, payments: remainingPayments };
        const fin = calculateJobFinancials(remainingJob, get().rates);
        const totalPaid = remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

        let newStatus: JobItem['status'] = targetJob.status;
        if (remainingPayments.length === 0) {
          newStatus = (targetJob.daysWorked && targetJob.daysWorked.length > 0) || (targetJob.logs && targetJob.logs.length > 0) ? 'invoiced' : 'invoiced';
        } else {
          newStatus = totalPaid >= fin.totalInvoice ? 'paid' : 'partial';
        }

        const updatedJob: JobItem = {
          ...targetJob,
          payments: remainingPayments,
          status: newStatus,
          forecastDueDate: entry?.date || targetJob.forecastDueDate || DateUtils.todayString(),
          forecastEntryId: entryId,
          forecastAmount: entry?.originalAmount || fin.remainingBalance || targetJob.forecastAmount,
          forecastDestination: targetJob.forecastDestination || (entry?.account ? `account:${entry.account}` : undefined),
        };

        get().saveJob(jobType, updatedJob);
      }
    }

    scheduleAutoGistSync(get);
  },

  addDraw: (entryId, draw) => {
    if (entryId.startsWith('credit-settlement-')) {
      const existingOverride = get().creditSettlementOverrides[entryId] || {};
      const newDraws = [
        ...(existingOverride.draws || []),
        { ...draw, id: draw.id || `draw-${Date.now()}-${(existingOverride.draws || []).length}` },
      ];
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const lastDate = draw.date || DateUtils.todayString();
      const updatedOverride = {
        ...existingOverride,
        draws: newDraws,
        tag: draw.tag || existingOverride.tag || 'Credit',
        account: draw.account || existingOverride.account || 'cib',
      };
      const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
      const actuals = { ...get().entryActuals, [entryId]: totalAmount };
      const dates = { ...get().entryActualDates, [entryId]: lastDate };
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({
        creditSettlementOverrides: nextOverrides,
        entryActuals: actuals,
        entryActualDates: dates,
      });
      scheduleAutoGistSync(get);
      return;
    }

    const inEntries = get().entries.findIndex((e) => e.id === entryId);
    const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
    if (inEntries === -1 && inArchived === -1) return;

    const isArchived = inEntries === -1;
    const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
    const newDraws = [
      ...(entry.draws || []),
      { ...draw, id: draw.id || `draw-${Date.now()}-${(entry.draws || []).length}` },
    ];
    const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const lastDate = draw.date || DateUtils.todayString();
    const updatedEntry: CashEntry = {
      ...entry,
      actualAmount: totalAmount,
      actualDate: lastDate,
      draws: newDraws,
    };

    if (isArchived) {
      const updatedArchived = [...get().archivedEntries];
      updatedArchived[inArchived] = updatedEntry;
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      set({ archivedEntries: updatedArchived });
    } else {
      const updatedEntries = [...get().entries];
      updatedEntries[inEntries] = updatedEntry;
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      set({ entries: updatedEntries });
    }
    const actuals = { ...get().entryActuals, [entryId]: totalAmount };
    const dates = { ...get().entryActualDates, [entryId]: lastDate };
    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entryActuals: actuals, entryActualDates: dates });
    get().settleJobForecastPayment(entryId, totalAmount, false);
    scheduleAutoGistSync(get);
  },

  updateDraw: (entryId, drawIndex, draw) => {
    if (entryId.startsWith('credit-settlement-')) {
      const existingOverride = get().creditSettlementOverrides[entryId] || {};
      const newDraws = [...(existingOverride.draws || [])];
      if (drawIndex >= 0 && drawIndex < newDraws.length) {
        newDraws[drawIndex] = { ...newDraws[drawIndex], ...draw };
      }
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const lastDate = newDraws.length > 0 ? newDraws[newDraws.length - 1].date : DateUtils.todayString();
      const updatedOverride = {
        ...existingOverride,
        draws: newDraws,
        tag: draw.tag || existingOverride.tag || 'Credit',
        account: draw.account || existingOverride.account || 'cib',
      };
      const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
      const actuals = { ...get().entryActuals, [entryId]: totalAmount };
      const dates = { ...get().entryActualDates, [entryId]: lastDate };
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({
        creditSettlementOverrides: nextOverrides,
        entryActuals: actuals,
        entryActualDates: dates,
      });
      scheduleAutoGistSync(get);
      return;
    }

    const inEntries = get().entries.findIndex((e) => e.id === entryId);
    const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
    if (inEntries === -1 && inArchived === -1) return;

    const isArchived = inEntries === -1;
    const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
    const newDraws = [...(entry.draws || [])];
    if (drawIndex >= 0 && drawIndex < newDraws.length) {
      newDraws[drawIndex] = { ...newDraws[drawIndex], ...draw };
    }
    const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const lastDate = newDraws.length > 0 ? newDraws[newDraws.length - 1].date : DateUtils.todayString();
    const updatedEntry: CashEntry = {
      ...entry,
      actualAmount: totalAmount,
      actualDate: lastDate,
      draws: newDraws,
    };

    if (isArchived) {
      const updatedArchived = [...get().archivedEntries];
      updatedArchived[inArchived] = updatedEntry;
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      set({ archivedEntries: updatedArchived });
    } else {
      const updatedEntries = [...get().entries];
      updatedEntries[inEntries] = updatedEntry;
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      set({ entries: updatedEntries });
    }
    const actuals = { ...get().entryActuals, [entryId]: totalAmount };
    const dates = { ...get().entryActualDates, [entryId]: lastDate };
    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entryActuals: actuals, entryActualDates: dates });
    get().settleJobForecastPayment(entryId, totalAmount, false);
    scheduleAutoGistSync(get);
  },

  deleteDraw: (entryId, drawIndex, options) => {
    if (entryId.startsWith('credit-settlement-')) {
      const existingOverride = get().creditSettlementOverrides[entryId] || {};
      const newDraws = [...(existingOverride.draws || [])];
      if (drawIndex >= 0 && drawIndex < newDraws.length) {
        newDraws.splice(drawIndex, 1);
      }
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const lastDate = newDraws.length > 0 ? newDraws[newDraws.length - 1].date : DateUtils.todayString();
      const updatedOverride = {
        ...existingOverride,
        draws: newDraws,
      };
      const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
      const actuals = { ...get().entryActuals };
      const dates = { ...get().entryActualDates };
      if (totalAmount > 0) {
        actuals[entryId] = totalAmount;
        dates[entryId] = lastDate;
      } else {
        delete actuals[entryId];
        delete dates[entryId];
      }
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({
        creditSettlementOverrides: nextOverrides,
        entryActuals: actuals,
        entryActualDates: dates,
      });

      if (options?.revertStorage && deletedDraw) {
        revertStorageOrAccountBalance(get, {
          assetId: options.storageAssetId || (deletedDraw as any).storageAssetId,
          account: deletedDraw.account || existingOverride.account || 'cib',
          currency: 'EGP',
          amount: deletedDraw.amount,
          isEgpAmount: true,
          entryType: 'expense',
        });
      }

      scheduleAutoGistSync(get);
      return;
    }

    const inEntries = get().entries.findIndex((e) => e.id === entryId);
    const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
    if (inEntries === -1 && inArchived === -1) return;

    const isArchived = inEntries === -1;
    const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
    const newDraws = [...(entry.draws || [])];
    let deletedDraw: EntryDraw | undefined;
    if (drawIndex >= 0 && drawIndex < newDraws.length) {
      deletedDraw = newDraws.splice(drawIndex, 1)[0];
    }
    
    if (options?.updateCashflow !== false) {
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const lastDate = newDraws.length > 0 ? newDraws[newDraws.length - 1].date : entry.date;
      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: totalAmount > 0 ? totalAmount : undefined,
        actualDate: totalAmount > 0 ? lastDate : undefined,
        draws: newDraws,
      };
      if (isArchived) {
        const updatedArchived = [...get().archivedEntries];
        updatedArchived[inArchived] = updatedEntry;
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        set({ archivedEntries: updatedArchived });
      } else {
        const updatedEntries = [...get().entries];
        updatedEntries[inEntries] = updatedEntry;
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries });
      }

      const actuals = { ...get().entryActuals };
      const dates = { ...get().entryActualDates };
      if (totalAmount > 0) {
        actuals[entryId] = totalAmount;
        dates[entryId] = lastDate;
      } else {
        delete actuals[entryId];
        delete dates[entryId];
      }
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({ entryActuals: actuals, entryActualDates: dates });

      if (options?.syncJob !== false) {
        get().settleJobForecastPayment(entryId, totalAmount, false);
      }
    }

    if (options?.revertStorage && deletedDraw) {
      revertStorageOrAccountBalance(get, {
        assetId: options.storageAssetId || (deletedDraw as any).storageAssetId,
        account: deletedDraw.account || entry.account,
        currency: entry.currency || 'USD',
        amount: deletedDraw.amount,
        isEgpAmount: true,
        fxRate: entry.fxRateAtEntry,
        entryType: entry.type,
      });
    }

    scheduleAutoGistSync(get);
  },

  updateCreditSettlementOverride: (id, override) => {
    const next = { ...get().creditSettlementOverrides };
    if (Object.keys(override).length === 0) delete next[id];
    else next[id] = override;
    saveStorage(STORAGE_KEYS.creditSettlementOverrides, next);
    set({ creditSettlementOverrides: next });
    scheduleAutoGistSync(get);
  },

  recalculateCreditSettlement: (id) => {
    const current = get().creditSettlementOverrides;
    const next = { ...current };
    const existingOverride = current[id];
    delete next[id];
    if (existingOverride?.date) next[id] = { date: existingOverride.date };
    const parts = id.split('-');
    const accountKey = parts[2];
    const monthKey = parts.length === 5 ? `${parts[3]}-${parts[4]}` : '';
    const allExpenses = [...get().entries, ...get().archivedEntries].filter(
      (entry) => entry.type === 'expense'
    );
    const actual = (entry: CashEntry) =>
      get().entryActuals[entry.id] !== undefined
        ? Number(get().entryActuals[entry.id]) || 0
        : Number(entry.actualAmount) || 0;
    const cardExpenses = allExpenses.filter((entry) => {
      const effective = get().entryActualDates[entry.id]
        ? { ...entry, actualDate: get().entryActualDates[entry.id] }
        : entry;
      return (
        isCardExpenseForAccount(effective, accountKey) &&
        getCreditSettlementMonth(effective, next) === monthKey
      );
    });
    const lumpEntries = allExpenses.filter(
      (entry) =>
        isLumpCreditDueForAccount(entry, accountKey) &&
        entry.id !== id &&
        entry.date.slice(0, 7) === monthKey
    );
    const monthData = get().creditDues[accountKey] || {};
    const calculatedAmount =
      Number(monthData[monthKey] || 0) +
      cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0) +
      lumpEntries.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0);
    const generated = buildCreditDueEntries({
      accounts: get().accounts,
      creditDues: get().creditDues,
      cashEntries: get().entries,
      archivedEntries: get().archivedEntries,
      entryActuals: get().entryActuals,
      entryActualDates: get().entryActualDates,
      creditSettlementOverrides: next,
    }).find((entry) => entry.id === id);
    if (generated) {
      return {
        ...generated,
        amount: calculatedAmount,
        calculatedAmount,
        cardSpendTotal: cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0),
        cardExpenseCount: cardExpenses.length,
      };
    }

    if (parts.length !== 5) return undefined;
    const [year, month] = monthKey.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const account = Object.entries(get().accounts).find(([key]) => key.toLowerCase() === accountKey)?.[1];
    const day = Math.min(Number(account?.maturityDay) || (accountKey === 'cib' ? 15 : lastDay), lastDay);
    return {
      id,
      date: existingOverride?.date || `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      category: `${account?.name || accountKey.toUpperCase()} Credit Due`,
      account: accountKey,
      type: 'expense',
      amount: calculatedAmount,
      creditType: accountKey,
      isCreditSettlement: true,
      source: 'recurring credit',
      tag: 'Credit',
      calculatedAmount,
      cardExpenseCount: cardExpenses.length,
      cardSpendTotal: cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0),
    };
  },

  updateAccountBalance: (accountKey, newBalance) => {
    const accounts = { ...get().accounts };
    if (accounts[accountKey]) {
      accounts[accountKey].balance = Math.round(newBalance);
      saveStorage(STORAGE_KEYS.accounts, accounts);
      set({ accounts });
        scheduleAutoGistSync(get);
    }
  },

  updateSalaryPattern: (salaryPattern) => {
    saveStorage(STORAGE_KEYS.salary, salaryPattern);
    set({ salaryPattern });
    scheduleAutoGistSync(get);
  },

  populateSalaryForecast: (startMonth, quarters, anchorMonth) => {
    const templates = buildSalaryEntries(
      get().salaryPattern,
      startMonth,
      Math.max(1, Number(quarters) || 1),
      anchorMonth || get().salaryAnchorMonth,
    );
    const currentEntries = [...get().entries];
    let added = 0;
    templates.forEach((template) => {
      const existing = currentEntries.find(
        (entry) =>
          entry.source === 'salary' &&
          entry.date === template.date &&
          entry.account === template.account &&
          entry.type === template.type,
      );
      if (existing) {
        existing.amount = template.amount;
        existing.category = template.category;
      } else {
        currentEntries.push({
          ...template,
          id: `salary-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${added}`,
        });
        added += 1;
      }
    });
    saveStorage(STORAGE_KEYS.entries, currentEntries);
    set({ entries: currentEntries });
    scheduleAutoGistSync(get);
    return added;
  },

  clearSalaryForecast: (startMonth, quarters) => {
    const hasActual = (entry: CashEntry) =>
      Number(get().entryActuals[entry.id] ?? entry.actualAmount ?? 0) > 0 ||
      Boolean(get().entryActualDates[entry.id] || entry.actualDate);
    const hasPeriod = Boolean(startMonth && quarters);
    const periodStart = hasPeriod ? `${startMonth}-01` : '';
    const [year, month] = hasPeriod ? (startMonth as string).split('-').map(Number) : [0, 0];
    const endMonthIndex = hasPeriod ? year * 12 + (month - 1) + Math.max(1, Number(quarters) || 1) * 3 : 0;
    const shouldRemove = (entry: CashEntry) => {
      if (entry.source !== 'salary' || hasActual(entry)) return false;
      if (!hasPeriod) return true;
      const entryMonth = entry.date.slice(0, 7);
      const [entryYear, entryMonthNumber] = entryMonth.split('-').map(Number);
      const entryMonthIndex = entryYear * 12 + (entryMonthNumber - 1);
      return entry.date >= periodStart && entryMonthIndex < endMonthIndex;
    };
    const removedIds = new Set(get().entries.filter(shouldRemove).map((entry) => entry.id));
    if (removedIds.size === 0) return 0;
    const updated = get().entries.filter((entry) => !removedIds.has(entry.id));
    saveStorage(STORAGE_KEYS.entries, updated);
    set({ entries: updated });
    scheduleAutoGistSync(get);
    return removedIds.size;
  },

  addInstallment: (instData) => {
    const newInst: Installment = {
      ...instData,
      id: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...get().installments, newInst];
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
    scheduleAutoGistSync(get);
  },

  updateInstallment: (id, updates) => {
    const current = get().installments.find((i) => i.id === id);
    const updated = get().installments.map((i) => (i.id === id ? { ...i, ...updates } : i));
    if (current?.loanId && Number(updates.amount) > 0 && Number(updates.amount) !== Number(current.amount)) {
      const ratio = Number(updates.amount) / Number(current.amount || 1);
      const shouldScale = typeof window === 'undefined' || window.confirm(
        'This loan has linked installments. Scale the installments to match the new disbursement amount?'
      );
      const linked = updated.map((i) =>
        shouldScale && i.loanId === current.loanId
          ? { ...i, amount: Math.round(Number(i.initialAmount || i.amount) * ratio), initialAmount: i.initialAmount || i.amount }
          : i
      );
      saveStorage(STORAGE_KEYS.installments, linked);
      set({ installments: linked });
      scheduleAutoGistSync(get);
      return;
    }
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
    scheduleAutoGistSync(get);
  },

  deleteInstallment: (id, options) => {
    const inst = get().installments.find((i) => i.id === id);
    const updated = get().installments.filter((i) => i.id !== id);
    let updatedEntries = get().entries;
    let updatedArchived = get().archivedEntries;
    const updatedDeletedForecasts = get().deletedForecasts.filter(
      (df) => !df.startsWith(`installment-${id}-`) && df !== id
    );

    if (options?.deleteCashEntries && inst) {
      const matchKey = (inst.name || '').toLowerCase().trim();
      const matchLoanId = (inst as any).loanId || inst.id;
      updatedEntries = updatedEntries.filter((e) => {
        if (e.loanId && (e.loanId === matchLoanId || e.loanId === inst.id)) return false;
        if (e.category && e.category.toLowerCase().trim() === matchKey) return false;
        return true;
      });
      updatedArchived = updatedArchived.filter((e) => {
        if (e.loanId && (e.loanId === matchLoanId || e.loanId === inst.id)) return false;
        if (e.category && e.category.toLowerCase().trim() === matchKey) return false;
        return true;
      });
    }

    saveStorage(STORAGE_KEYS.installments, updated);
    saveStorage(STORAGE_KEYS.entries, updatedEntries);
    saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
    saveStorage(STORAGE_KEYS.deletedForecasts, updatedDeletedForecasts);
    set({
      installments: updated,
      entries: updatedEntries,
      archivedEntries: updatedArchived,
      deletedForecasts: updatedDeletedForecasts,
    });
    scheduleAutoGistSync(get);
  },

  syncStorageRates: (customRates) => {
    const activeRates = customRates || get().rates;
    let changed = false;
    const updated = get().storageAssets.map((item) => {
      const resolved = resolveRateSourceValue((item as any).rateSource, activeRates);
      if (resolved !== null && resolved !== (item as any).rate) {
        changed = true;
        return { ...item, rate: resolved, buyPrice: resolved };
      }
      return item;
    });
    if (changed) {
      saveStorage(STORAGE_KEYS.storage, updated);
      set({ storageAssets: updated });
    }
  },

  updateRates: (newRates, syncImmediately = false) => {
    const currentStorageTotal = computeTotalStorageValue(get().storageAssets, get().rates);
    const nextStorageTotal = computeTotalStorageValue(get().storageAssets, newRates);

    let ratesToSave: RatesData = { ...newRates };
    if (currentStorageTotal > 0 && Math.round(nextStorageTotal) !== Math.round(currentStorageTotal)) {
      ratesToSave.previousStorageTotal = currentStorageTotal;
    } else if (newRates.previousStorageTotal === undefined && get().rates.previousStorageTotal) {
      ratesToSave.previousStorageTotal = get().rates.previousStorageTotal;
    }

    saveStorage(STORAGE_KEYS.rates, ratesToSave);
    let changed = false;
    const updatedStorage = get().storageAssets.map((item) => {
      const resolved = resolveRateSourceValue((item as any).rateSource, ratesToSave);
      if (resolved !== null && resolved !== (item as any).rate) {
        changed = true;
        return { ...item, rate: resolved, buyPrice: resolved };
      }
      return item;
    });
    if (changed) {
      saveStorage(STORAGE_KEYS.storage, updatedStorage);
      set({ rates: ratesToSave, storageAssets: updatedStorage });
    } else {
      set({ rates: ratesToSave });
    }
    scheduleAutoGistSync(get, syncImmediately);
  },

  addStorageAsset: (assetData) => {
    const loc = inferAssetLocation(assetData);
    const newAsset: StorageAsset = {
      ...assetData,
      locationType: assetData.locationType || loc.locationType,
      location: assetData.location || loc.location,
      locationLabel: assetData.locationLabel || loc.locationLabel,
      id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...get().storageAssets, newAsset];
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
    scheduleAutoGistSync(get);
  },

  updateStorageAsset: (id, updates) => {
    const updated = get().storageAssets.map((a) => {
      if (a.id !== id) return a;
      const merged = { ...a, ...updates };
      if (updates.locationType || updates.location) {
        const loc = inferAssetLocation(merged);
        merged.locationType = updates.locationType || merged.locationType || loc.locationType;
        merged.location = updates.location || merged.location || loc.location;
        merged.locationLabel = updates.locationLabel || loc.locationLabel;
      }
      return merged;
    });
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
    scheduleAutoGistSync(get);
  },

  deleteStorageAsset: (id) => {
    const updated = get().storageAssets.filter((a) => a.id !== id);
    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
    scheduleAutoGistSync(get);
  },

  depositToStorageAsset: (assetId, amount) => {
    if (!amount || amount <= 0) return;
    const current = get().storageAssets.find((a) => a.id === assetId);
    if (!current) return;
    const nextQty = (Number(current.quantity) || 0) + Number(amount);
    get().updateStorageAsset(assetId, { quantity: nextQty });
  },

  transferStorageAsset: (fromAssetId, toAssetId, amount) => {
    if (fromAssetId === toAssetId || !amount || amount <= 0) return false;
    const fromAsset = get().storageAssets.find((a) => a.id === fromAssetId);
    const toAsset = get().storageAssets.find((a) => a.id === toAssetId);
    if (!fromAsset || !toAsset) return false;
    if ((Number(fromAsset.quantity) || 0) < amount) return false;

    const updated = get().storageAssets.map((a) => {
      if (a.id === fromAssetId) {
        return { ...a, quantity: Math.max(0, (Number(a.quantity) || 0) - amount) };
      }
      if (a.id === toAssetId) {
        return { ...a, quantity: (Number(a.quantity) || 0) + amount };
      }
      return a;
    });

    saveStorage(STORAGE_KEYS.storage, updated);
    set({ storageAssets: updated });
    scheduleAutoGistSync(get);
    return true;
  },

  convertStorageAssetToEgp: (assetId, foreignAmount, targetAccount, customRate) => {
    if (!foreignAmount || foreignAmount <= 0) return undefined;
    const asset = get().storageAssets.find((a) => a.id === assetId);
    if (!asset || (Number(asset.quantity) || 0) < foreignAmount) return undefined;

    const rate = customRate || (asset.rateSource ? resolveRateSourceValue(asset.rateSource, get().rates) : null) || asset.rate || asset.buyPrice || 1;
    const egpGained = Math.round(foreignAmount * rate);

    // 1. Deduct foreign quantity from storage asset
    const updatedAssets = get().storageAssets.map((a) =>
      a.id === assetId ? { ...a, quantity: Math.max(0, (Number(a.quantity) || 0) - foreignAmount) } : a
    );
    saveStorage(STORAGE_KEYS.storage, updatedAssets);

    // 2. Deposit EGP to bank account
    const accounts = { ...get().accounts };
    if (accounts[targetAccount]) {
      accounts[targetAccount] = {
        ...accounts[targetAccount],
        balance: (accounts[targetAccount].balance || 0) + egpGained,
      };
      saveStorage(STORAGE_KEYS.accounts, accounts);
    }

    // 3. Log an income entry for record tracking
    const today = DateUtils.todayString();
    const entryId = get().addEntry({
      date: today,
      category: 'FX Conversion',
      subcategory: `Sold ${asset.name}`,
      tag: 'FX Exchange',
      account: targetAccount,
      type: 'income',
      amount: egpGained,
      actualAmount: egpGained,
      actualDate: today,
      currency: 'EGP',
      source: `Converted ${foreignAmount} ${asset.unit || asset.currency} @ ${rate} EGP`,
    });

    set({ storageAssets: updatedAssets, accounts });
    scheduleAutoGistSync(get);
    return entryId;
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
    scheduleAutoGistSync(get);
  },

  deleteJob: (jobType, jobId, options) => {
    const key = jobType === 'asf' ? STORAGE_KEYS.asf : jobType === 'irq' ? STORAGE_KEYS.irq : STORAGE_KEYS.partTimeJobs;
    const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
    const targetJob = currentList.find((j) => j.id === jobId);
    const updated = currentList.filter((j) => j.id !== jobId);

    // Optionally remove linked cashflow entries if explicitly requested
    const shouldDeleteCashEntries = options?.deleteCashEntries === true;
    const linkedEntryIds = new Set(
      (targetJob?.payments || []).map((p) => p.entryId).filter(Boolean) as string[]
    );
    let updatedEntries = get().entries;
    if (shouldDeleteCashEntries && linkedEntryIds.size > 0) {
      updatedEntries = get().entries.filter((e) => !linkedEntryIds.has(e.id));
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
    }

    saveStorage(key, updated);
    if (jobType === 'asf') set({ asfJobs: updated, entries: updatedEntries });
    else if (jobType === 'irq') set({ irqJobs: updated, entries: updatedEntries });
    else set({ partTimeJobs: updated, entries: updatedEntries });
    scheduleAutoGistSync(get);
  },

  deleteJobPayment: (jobType, jobId, paymentId, options) => {
    const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
    const targetJob = currentList.find((j) => j.id === jobId);
    if (!targetJob) return;

    const payment = (targetJob.payments || []).find((p) => p.id === paymentId);
    const remainingPayments = (targetJob.payments || []).filter((p) => p.id !== paymentId);

    const fin = calculateJobFinancials({ ...targetJob, payments: remainingPayments }, get().rates);
    const totalPaid = remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const updatedJob = {
      ...targetJob,
      payments: remainingPayments,
      status: (totalPaid >= fin.totalInvoice && fin.totalInvoice > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'invoiced')) as any,
      forecastAmount: Math.max(0, fin.totalInvoice - totalPaid),
    };

    get().saveJob(jobType, updatedJob);

    if (options?.syncCashflow !== false && payment?.entryId) {
      const shouldDeleteCashEntry = options?.deleteCashEntry === true;
      if (shouldDeleteCashEntry) {
        get().deleteEntry(payment.entryId, undefined, { syncJob: false, revertStorage: false });
      } else {
        // Sync cashflow entry draws and actual amount
        const entry = get().entries.find((e) => e.id === payment.entryId);
        if (entry) {
          const remainingDraws = (entry.draws || []).filter((d) => d.id !== paymentId);
          const newActual = remainingDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
          const lastDate = remainingDraws.length > 0 ? remainingDraws[remainingDraws.length - 1].date : entry.date;
          get().updateEntry(payment.entryId, {
            actualAmount: newActual > 0 ? newActual : undefined,
            actualDate: newActual > 0 ? lastDate : undefined,
            draws: remainingDraws,
            isClosed: false,
          });
          if (newActual === 0) {
            get().clearActual(payment.entryId, { revertStorage: false, syncJob: false });
          }
        }
      }
    }

    // If user selected to revert storage asset balance
    if (options?.revertStorage && payment) {
      revertStorageOrAccountBalance(get, {
        assetId: options.storageAssetId,
        account: payment.settlementAccount || payment.account,
        currency: payment.currency || targetJob.currency || 'USD',
        amount: Number(payment.amount) || 0,
        isEgpAmount: false,
      });
    }
  },

  settleJobForecastPayment: (entryId, actualEgp, isFinishing = false) => {
    if (!entryId || actualEgp < 0) return false;

    // 1. Locate entry
    const entry = get().entries.find((e) => e.id === entryId) || get().archivedEntries.find((e) => e.id === entryId);

    // 2. Locate linked job
    let jobType: 'partTime' | 'asf' | 'irq' = 'partTime';
    let targetJob = get().partTimeJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
    if (!targetJob) {
      targetJob = get().asfJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
      if (targetJob) jobType = 'asf';
    }
    if (!targetJob) {
      targetJob = get().irqJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
      if (targetJob) jobType = 'irq';
    }
    if (!targetJob) return false;

    // 3. Currency and amounts
    const jobCurrency = (targetJob.currency || entry?.currency || 'USD').toUpperCase();
    const isForeign = jobCurrency !== 'EGP';
    const fxRate = entry?.fxRateAtEntry || (isForeign ? getCurrencyRate(get().rates, jobCurrency) : 1);

    let nativeAmt = actualEgp;
    if (isForeign) {
      if (entry?.originalAmount && actualEgp >= (entry.amount || 0)) {
        nativeAmt = entry.originalAmount;
      } else if (fxRate > 0) {
        nativeAmt = Math.round((actualEgp / fxRate) * 100) / 100;
      }
    }

    // 4. Update payments on job (funds routing is handled via modal confirmation)
    const actDate = entry?.actualDate || DateUtils.todayString();
    const settlementAcc = entry?.account || (targetJob.forecastDestination?.replace('storage:', '').replace('account:', '')) || 'Operating';

    let updatedPayments = [...(targetJob.payments || [])];
    if (entry?.draws && entry.draws.length > 0) {
      // Sync draws 1-to-1 with job payments to maintain separate tranches
      updatedPayments = entry.draws.map((d, idx) => {
        const existingP = targetJob.payments?.find((p) => p.id === d.id);
        const dEgp = Number(d.amount) || 0;
        const dNative = isForeign ? (fxRate > 0 ? Math.round((dEgp / fxRate) * 100) / 100 : dEgp) : dEgp;
        return {
          id: d.id || existingP?.id || `pay-${idx}-${entryId}`,
          entryId,
          date: d.date || actDate,
          amount: existingP?.currency === jobCurrency && existingP.amount ? existingP.amount : dNative,
          currency: jobCurrency,
          egpAmount: dEgp,
          settlementAccount: d.account || existingP?.settlementAccount || settlementAcc,
          account: d.account || existingP?.account || settlementAcc,
          syncToBudget: true,
          paymentNote: d.note || existingP?.paymentNote || 'Tranche payment via Cashflow',
        };
      });
    } else {
      const existingPayment = targetJob.payments?.find((p) => p.entryId === entryId);
      if (existingPayment) {
        if ((targetJob.payments || []).length <= 1) {
          updatedPayments = [{ ...existingPayment, amount: nativeAmt, egpAmount: actualEgp, date: actDate }];
        } else {
          updatedPayments = (targetJob.payments || []).map((p) =>
            p.id === existingPayment.id
              ? { ...p, amount: nativeAmt, egpAmount: actualEgp, date: actDate }
              : p
          );
        }
      } else if (nativeAmt > 0) {
        const newPay: JobPayment = {
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          entryId,
          date: actDate,
          amount: nativeAmt,
          currency: jobCurrency,
          egpAmount: actualEgp,
          settlementAccount: settlementAcc,
          account: settlementAcc,
          syncToBudget: true,
          paymentNote: 'Received & settled via Cashflow Forecast',
        };
        updatedPayments.push(newPay);
      }
    }

    const fin = calculateJobFinancials({ ...targetJob, payments: updatedPayments }, get().rates);
    const totalPaid = updatedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const isFullyPaid = isFinishing || (totalPaid >= fin.totalInvoice && fin.totalInvoice > 0);

    const updatedJob: JobItem = {
      ...targetJob,
      payments: updatedPayments,
      status: isFullyPaid ? 'paid' : (totalPaid > 0 ? 'partial' : targetJob.status),
      forecastDueDate: isFullyPaid ? undefined : targetJob.forecastDueDate,
      forecastEntryId: isFullyPaid ? undefined : targetJob.forecastEntryId,
      forecastAmount: isFullyPaid ? undefined : Math.max(0, fin.totalInvoice - totalPaid),
      forecastDestination: isFullyPaid ? undefined : targetJob.forecastDestination,
    };

    get().saveJob(jobType, updatedJob);
    return true;
  },

  archiveSettledEntries: () => {
    const currentYm = DateUtils.currentYearMonth();
    const toArchive: CashEntry[] = [];
    const remaining: CashEntry[] = [];

    get().entries.forEach((entry) => {
      const actAmount = Number(get().entryActuals[entry.id] ?? entry.actualAmount ?? 0);
      const effDate = entry.actualDate || entry.date || '';
      const entryMonth = effDate.slice(0, 7);

      // Settle condition: past month and has recorded actual payment
      if (actAmount > 0 && entryMonth < currentYm) {
        toArchive.push({
          ...entry,
          archivedAt: new Date().toISOString(),
        });
      } else {
        remaining.push(entry);
      }
    });

    if (toArchive.length === 0) return 0;

    const updatedArchived = [...get().archivedEntries, ...toArchive];
    saveStorage(STORAGE_KEYS.entries, remaining);
    saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
    set({ entries: remaining, archivedEntries: updatedArchived });
    scheduleAutoGistSync(get, true);
    return toArchive.length;
  },

  unarchiveEntry: (id) => {
    const target = get().archivedEntries.find((e) => e.id === id);
    if (!target) return;
    const updatedArchived = get().archivedEntries.filter((e) => e.id !== id);
    const restoredEntry: CashEntry = { ...target };
    delete restoredEntry.archivedAt;
    const updatedEntries = [restoredEntry, ...get().entries];
    saveStorage(STORAGE_KEYS.entries, updatedEntries);
    saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
    set({ entries: updatedEntries, archivedEntries: updatedArchived });
    scheduleAutoGistSync(get, true);
  },

  setGistConfig: (token, gistId, autoSync) => {
    localStorage.setItem(STORAGE_KEYS.gistToken, token);
    localStorage.setItem(STORAGE_KEYS.gistId, gistId);
    localStorage.setItem(STORAGE_KEYS.gistAutoSync, String(autoSync));
    set({ gistToken: token, gistId, gistAutoSync: autoSync, gistSyncStatus: 'idle' });
  },

  syncFromGist: async (tokenOverride, gistIdOverride) => {
    const state = get();
    const token = tokenOverride?.trim() || state.gistToken;
    const gistId = gistIdOverride?.trim() || state.gistId;
    if (!gistId) {
      set({ gistSyncStatus: 'error' });
      return false;
    }

    // If local modifications exist that haven't finished uploading to Gist yet, upload first instead of overwriting with old remote data
    if (lastLocalMutationTimestamp > lastGistUploadTimestamp || state.gistSyncStatus === 'scheduled' || state.gistSyncStatus === 'syncing') {
      scheduleAutoGistSync(get, true);
      return true;
    }

    set({ gistSyncStatus: 'syncing' });
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (token) headers.Authorization = `token ${token}`;
      const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
      if (!response.ok) {
        throw new Error(`Gist download failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json() as {
        files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
      };
      const file = data.files?.['budget-data.json']
        || data.files?.['budget-control-backup.json']
        || Object.values(data.files || {})[0];

      if (!file) {
        throw new Error('No budget JSON file found in this Gist');
      }

      let content = file.content;
      // Handle truncated Gist content
      if ((file.truncated || !content) && file.raw_url) {
        const rawRes = await fetch(file.raw_url, { headers });
        if (rawRes.ok) {
          content = await rawRes.text();
        }
      }

      if (!content) {
        throw new Error('No valid budget JSON content could be restored from this Gist');
      }

      // Check for remote conflict if local data has also changed
      let parsedRemote: any = null;
      try {
        parsedRemote = JSON.parse(content);
      } catch {
        // ignore
      }

      const remoteExportedAt = parsedRemote?.exportedAt || parsedRemote?.data?.exportedAt;
      const remoteTime = remoteExportedAt ? new Date(remoteExportedAt).getTime() : 0;

      // Remote is genuinely newer than our last known sync if remoteTime > lastGistUploadTimestamp + 1000
      const remoteIsNewerThanLastSync = remoteTime > 0 && remoteTime > (lastGistUploadTimestamp + 1000);
      const localHasUnuploadedChanges = lastLocalMutationTimestamp > 0 && lastLocalMutationTimestamp > lastGistUploadTimestamp;

      if (remoteIsNewerThanLastSync && localHasUnuploadedChanges) {
        // Both local and remote have mutated since last sync. Check if content actually differs
        const currentLocalExport = get().exportJSON();
        let isActuallyDifferent = true;
        try {
          const parsedLocal = JSON.parse(currentLocalExport);
          isActuallyDifferent = JSON.stringify(parsedRemote?.data || parsedRemote) !== JSON.stringify(parsedLocal?.data || parsedLocal);
        } catch {
          isActuallyDifferent = content.trim() !== currentLocalExport.trim();
        }

        if (isActuallyDifferent) {
          set({
            gistConflict: {
              remoteTime: remoteExportedAt,
              remoteData: content,
            },
            gistSyncStatus: 'idle',
          });
          return false;
        }
      }

      // If local has un-uploaded changes and remote is not newer than our last sync,
      // upload local data to Gist rather than overwriting with older remote data
      if (localHasUnuploadedChanges && !remoteIsNewerThanLastSync) {
        scheduleAutoGistSync(get, true);
        return true;
      }

      if (!get().importJSON(content)) {
        throw new Error('No valid budget JSON content could be restored from this Gist');
      }
      const newSyncTimestamp = remoteTime > 0 ? remoteTime : Date.now();
      lastGistUploadTimestamp = newSyncTimestamp;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
      }
      lastLocalMutationTimestamp = 0;
      set({ gistSyncStatus: 'synced', gistConflict: null });
      return true;
    } catch (error) {
      console.error('Gist download failed:', error);
      set({ gistSyncStatus: 'error' });
      return false;
    }
  },

  resolveGistConflict: async (resolution: 'local' | 'remote') => {
    const conflict = get().gistConflict;
    if (resolution === 'local') {
      set({ gistConflict: null });
      scheduleAutoGistSync(get, true);
    } else if (resolution === 'remote' && conflict?.remoteData) {
      get().importJSON(conflict.remoteData);
      lastGistUploadTimestamp = Date.now();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
      }
      lastLocalMutationTimestamp = 0;
      set({ gistConflict: null, gistSyncStatus: 'synced' });
    } else {
      set({ gistConflict: null });
    }
  },

  autoTagEntries: () => {
    const state = get();
    let count = 0;
    const updatedEntries = state.entries.map((entry) => {
      let entryChanged = false;
      let newTag = entry.tag;
      if (!newTag?.trim()) {
        const inferred = inferTag(entry);
        if (inferred) {
          newTag = inferred;
          entryChanged = true;
          count += 1;
        }
      }
      let updatedDraws = entry.draws;
      if (entry.draws && entry.draws.length > 0 && newTag) {
        const hasUntagged = entry.draws.some((d) => !d.tag || !d.tag.trim());
        if (hasUntagged) {
          entryChanged = true;
          updatedDraws = entry.draws.map((d) => (!d.tag || !d.tag.trim() ? { ...d, tag: newTag } : d));
        }
      }
      return entryChanged ? { ...entry, tag: newTag, draws: updatedDraws } : entry;
    });

    const updatedArchived = state.archivedEntries.map((entry) => {
      let entryChanged = false;
      let newTag = entry.tag;
      if (!newTag?.trim()) {
        const inferred = inferTag(entry);
        if (inferred) {
          newTag = inferred;
          entryChanged = true;
          count += 1;
        }
      }
      let updatedDraws = entry.draws;
      if (entry.draws && entry.draws.length > 0 && newTag) {
        const hasUntagged = entry.draws.some((d) => !d.tag || !d.tag.trim());
        if (hasUntagged) {
          entryChanged = true;
          updatedDraws = entry.draws.map((d) => (!d.tag || !d.tag.trim() ? { ...d, tag: newTag } : d));
        }
      }
      return entryChanged ? { ...entry, tag: newTag, draws: updatedDraws } : entry;
    });

    const updatedInstallments = state.installments.map((installment) => {
      if (installment.tag?.trim()) return installment;
      count += 1;
      return { ...installment, tag: inferTag({ category: installment.name, source: 'installment' }) || 'Installment' };
    });

    if (count > 0) {
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      saveStorage(STORAGE_KEYS.installments, updatedInstallments);
      set({ entries: updatedEntries, archivedEntries: updatedArchived, installments: updatedInstallments });
      scheduleAutoGistSync(get);
    }
    return count;
  },

  resetData: () => {
    const state = get();
    localStorage.setItem(STORAGE_KEYS.resetBackup, JSON.stringify({
      salaryPattern: state.salaryPattern,
      salaryAnchorMonth: state.salaryAnchorMonth,
      cashEntries: state.entries,
      installments: state.installments,
      storageAssets: state.storageAssets,
      accountBalances: state.accounts,
      asfJobs: state.asfJobs,
      irqJobs: state.irqJobs,
      partTimeJobs: state.partTimeJobs,
      ratesData: state.rates,
      creditDues: state.creditDues,
      creditDueMonths: state.creditDueMonths,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
      creditSettlementOverrides: state.creditSettlementOverrides,
      archivedEntries: state.archivedEntries,
    }));
    const emptyEntries: CashEntry[] = [];
    const emptyInstallments: Installment[] = [];
    const emptyStorage: StorageAsset[] = [];
    const emptyJobs: JobItem[] = [];
    const resetAccounts = structuredClone(defaultAccounts);
    const resetSalary = structuredClone(defaultSalaryPattern);
    const resetRates = structuredClone(defaultRates);
    saveStorage(STORAGE_KEYS.entries, emptyEntries);
    saveStorage(STORAGE_KEYS.archivedEntries, emptyEntries);
    saveStorage(STORAGE_KEYS.installments, emptyInstallments);
    saveStorage(STORAGE_KEYS.storage, emptyStorage);
    saveStorage(STORAGE_KEYS.asf, emptyJobs);
    saveStorage(STORAGE_KEYS.irq, emptyJobs);
    saveStorage(STORAGE_KEYS.partTimeJobs, emptyJobs);
    saveStorage(STORAGE_KEYS.accounts, resetAccounts);
    saveStorage(STORAGE_KEYS.salary, resetSalary);
    saveStorage(STORAGE_KEYS.rates, resetRates);
    saveStorage(STORAGE_KEYS.entryActuals, {});
    saveStorage(STORAGE_KEYS.entryActualDates, {});
    saveStorage(STORAGE_KEYS.deletedForecasts, []);
    saveStorage(STORAGE_KEYS.creditDues, {});
    saveStorage(STORAGE_KEYS.creditDueMonths, {});
    saveStorage(STORAGE_KEYS.creditSettlementOverrides, {});
    saveStorage(STORAGE_KEYS.salaryAnchor, DateUtils.currentYearMonth());
    set({
      entries: emptyEntries,
      archivedEntries: emptyEntries,
      accounts: resetAccounts,
      salaryPattern: resetSalary,
      rates: resetRates,
      creditDues: {},
      creditDueMonths: {},
      creditSettlementOverrides: {},
      salaryAnchorMonth: DateUtils.currentYearMonth(),
      installments: emptyInstallments,
      storageAssets: emptyStorage,
      asfJobs: emptyJobs,
      irqJobs: emptyJobs,
      partTimeJobs: emptyJobs,
      entryActuals: {},
      entryActualDates: {},
      deletedForecasts: [],
    });
    scheduleAutoGistSync(get);
  },

  restoreResetBackup: () => {
    const raw = localStorage.getItem(STORAGE_KEYS.resetBackup);
    if (!raw) return false;
    try {
      const backup = JSON.parse(raw);
      const restored = {
        salaryPattern: backup.salaryPattern || defaultSalaryPattern,
        salaryAnchorMonth: backup.salaryAnchorMonth || DateUtils.currentYearMonth(),
        entries: backup.cashEntries || [],
        installments: backup.installments || [],
        storageAssets: backup.storageAssets || [],
        accounts: withoutCashAccount(backup.accountBalances || defaultAccounts),
        asfJobs: backup.asfJobs || [],
        irqJobs: backup.irqJobs || [],
        partTimeJobs: backup.partTimeJobs || [],
        rates: backup.ratesData || defaultRates,
        creditDues: backup.creditDues || {},
        creditDueMonths: backup.creditDueMonths || {},
        entryActuals: backup.entryActuals || {},
        entryActualDates: backup.entryActualDates || {},
        deletedForecasts: backup.deletedForecasts || [],
        creditSettlementOverrides: backup.creditSettlementOverrides || {},
        archivedEntries: backup.archivedEntries || [],
      };
      saveStorage(STORAGE_KEYS.salary, restored.salaryPattern);
      saveStorage(STORAGE_KEYS.salaryAnchor, restored.salaryAnchorMonth);
      saveStorage(STORAGE_KEYS.entries, restored.entries);
      saveStorage(STORAGE_KEYS.installments, restored.installments);
      saveStorage(STORAGE_KEYS.storage, restored.storageAssets);
      saveStorage(STORAGE_KEYS.accounts, restored.accounts);
      saveStorage(STORAGE_KEYS.asf, restored.asfJobs);
      saveStorage(STORAGE_KEYS.irq, restored.irqJobs);
      saveStorage(STORAGE_KEYS.partTimeJobs, restored.partTimeJobs);
      saveStorage(STORAGE_KEYS.rates, restored.rates);
      saveStorage(STORAGE_KEYS.creditDues, restored.creditDues);
      saveStorage(STORAGE_KEYS.creditDueMonths, restored.creditDueMonths);
      saveStorage(STORAGE_KEYS.entryActuals, restored.entryActuals);
      saveStorage(STORAGE_KEYS.entryActualDates, restored.entryActualDates);
      saveStorage(STORAGE_KEYS.deletedForecasts, restored.deletedForecasts);
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, restored.creditSettlementOverrides);
      saveStorage(STORAGE_KEYS.archivedEntries, restored.archivedEntries);
      localStorage.removeItem(STORAGE_KEYS.resetBackup);
      set(restored);
      scheduleAutoGistSync(get);
      return true;
    } catch (error) {
      console.error('Failed to restore reset backup:', error);
      return false;
    }
  },

  undoImport: () => {
    const raw = localStorage.getItem(STORAGE_KEYS.importUndoBackup);
    if (!raw) return false;
    try {
      const backup = JSON.parse(raw);
      const restored = {
        salaryPattern: backup.salaryPattern || defaultSalaryPattern,
        salaryAnchorMonth: backup.salaryAnchorMonth || DateUtils.currentYearMonth(),
        entries: backup.entries || [],
        installments: backup.installments || [],
        storageAssets: backup.storageAssets || [],
        accounts: withoutCashAccount(backup.accounts || defaultAccounts),
        asfJobs: backup.asfJobs || [],
        irqJobs: backup.irqJobs || [],
        partTimeJobs: backup.partTimeJobs || [],
        rates: backup.rates || defaultRates,
        creditDues: backup.creditDues || {},
        creditDueMonths: backup.creditDueMonths || {},
        entryActuals: backup.entryActuals || {},
        entryActualDates: backup.entryActualDates || {},
        deletedForecasts: backup.deletedForecasts || [],
        creditSettlementOverrides: backup.creditSettlementOverrides || {},
        archivedEntries: backup.archivedEntries || [],
      };
      saveStorage(STORAGE_KEYS.salary, restored.salaryPattern);
      saveStorage(STORAGE_KEYS.salaryAnchor, restored.salaryAnchorMonth);
      saveStorage(STORAGE_KEYS.entries, restored.entries);
      saveStorage(STORAGE_KEYS.installments, restored.installments);
      saveStorage(STORAGE_KEYS.storage, restored.storageAssets);
      saveStorage(STORAGE_KEYS.accounts, restored.accounts);
      saveStorage(STORAGE_KEYS.asf, restored.asfJobs);
      saveStorage(STORAGE_KEYS.irq, restored.irqJobs);
      saveStorage(STORAGE_KEYS.partTimeJobs, restored.partTimeJobs);
      saveStorage(STORAGE_KEYS.rates, restored.rates);
      saveStorage(STORAGE_KEYS.creditDues, restored.creditDues);
      saveStorage(STORAGE_KEYS.creditDueMonths, restored.creditDueMonths);
      saveStorage(STORAGE_KEYS.entryActuals, restored.entryActuals);
      saveStorage(STORAGE_KEYS.entryActualDates, restored.entryActualDates);
      saveStorage(STORAGE_KEYS.deletedForecasts, restored.deletedForecasts);
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, restored.creditSettlementOverrides);
      saveStorage(STORAGE_KEYS.archivedEntries, restored.archivedEntries);
      localStorage.removeItem(STORAGE_KEYS.importUndoBackup);
      set(restored);
      scheduleAutoGistSync(get);
      return true;
    } catch (err) {
      console.error('Failed to undo import:', err);
      return false;
    }
  },

  restoreDeletedForecast: (id) => {
    const updated = get().deletedForecasts.filter((fId) => fId !== id);
    saveStorage(STORAGE_KEYS.deletedForecasts, updated);
    set({ deletedForecasts: updated });
    scheduleAutoGistSync(get);
  },

  clearAllDeletedForecasts: () => {
    saveStorage(STORAGE_KEYS.deletedForecasts, []);
    set({ deletedForecasts: [] });
    scheduleAutoGistSync(get);
  },

  exportJSON: () => {
    const state = get();
    const payload = {
      app: 'budget-control',
      version: '2.1',
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
        creditDues: state.creditDues,
        creditDueMonths: state.creditDueMonths,
        creditSettlementOverrides: state.creditSettlementOverrides,
        salaryAnchorMonth: state.salaryAnchorMonth,
        archivedEntries: state.archivedEntries,
      },
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

      // 1. Create a full snapshot before mutating state (for Undo Import)
      const currentSnapshot = {
        entries: get().entries,
        archivedEntries: get().archivedEntries,
        deletedForecasts: get().deletedForecasts,
        accounts: get().accounts,
        salaryPattern: get().salaryPattern,
        installments: get().installments,
        rates: get().rates,
        storageAssets: get().storageAssets,
        asfJobs: get().asfJobs,
        irqJobs: get().irqJobs,
        partTimeJobs: get().partTimeJobs,
        entryActuals: get().entryActuals,
        entryActualDates: get().entryActualDates,
        creditDues: get().creditDues,
        creditDueMonths: get().creditDueMonths,
        creditSettlementOverrides: get().creditSettlementOverrides,
        salaryAnchorMonth: get().salaryAnchorMonth,
      };
      saveStorage(STORAGE_KEYS.importUndoBackup, currentSnapshot);

      // 2. Run versioned migration pipeline
      const migrated = migrateBackupPayload(parsed);

      // 3. Commit all storage changes atomically
      saveStorage(STORAGE_KEYS.entries, migrated.entries);
      saveStorage(STORAGE_KEYS.archivedEntries, migrated.archivedEntries);
      saveStorage(STORAGE_KEYS.accounts, migrated.accounts);
      saveStorage(STORAGE_KEYS.salary, migrated.salaryPattern);
      saveStorage(STORAGE_KEYS.creditDues, migrated.creditDues);
      saveStorage(STORAGE_KEYS.creditDueMonths, migrated.creditDueMonths);
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, migrated.creditSettlementOverrides);
      saveStorage(STORAGE_KEYS.salaryAnchor, migrated.salaryAnchorMonth);
      saveStorage(STORAGE_KEYS.installments, migrated.installments);
      saveStorage(STORAGE_KEYS.rates, migrated.rates);
      saveStorage(STORAGE_KEYS.storage, migrated.storageAssets);
      saveStorage(STORAGE_KEYS.asf, migrated.asfJobs);
      saveStorage(STORAGE_KEYS.irq, migrated.irqJobs);
      saveStorage(STORAGE_KEYS.partTimeJobs, migrated.partTimeJobs);
      saveStorage(STORAGE_KEYS.entryActuals, migrated.entryActuals);
      saveStorage(STORAGE_KEYS.entryActualDates, migrated.entryActualDates);
      saveStorage(STORAGE_KEYS.deletedForecasts, migrated.deletedForecasts);

      // 4. Update state atomically
      set({
        entries: migrated.entries,
        archivedEntries: migrated.archivedEntries,
        accounts: migrated.accounts,
        salaryPattern: migrated.salaryPattern,
        installments: migrated.installments,
        rates: migrated.rates,
        creditDues: migrated.creditDues,
        creditDueMonths: migrated.creditDueMonths,
        creditSettlementOverrides: migrated.creditSettlementOverrides,
        salaryAnchorMonth: migrated.salaryAnchorMonth,
        storageAssets: migrated.storageAssets,
        asfJobs: migrated.asfJobs,
        irqJobs: migrated.irqJobs,
        partTimeJobs: migrated.partTimeJobs,
        entryActuals: migrated.entryActuals,
        entryActualDates: migrated.entryActualDates,
        deletedForecasts: migrated.deletedForecasts,
      });

      scheduleAutoGistSync(get);
      return true;
    } catch (e) {
      console.error('Failed to import JSON data:', e);
      return false;
    }
  },
}));

const syncedDataKeys: Array<keyof BudgetStoreState> = [
  'entries',
  'archivedEntries',
  'deletedForecasts',
  'accounts',
  'salaryPattern',
  'installments',
  'rates',
  'storageAssets',
  'asfJobs',
  'irqJobs',
  'partTimeJobs',
  'entryActuals',
  'entryActualDates',
  'creditDues',
  'creditDueMonths',
  'creditSettlementOverrides',
  'salaryAnchorMonth',
];

useBudgetStore.subscribe((state, previousState) => {
  if (syncedDataKeys.some((key) => state[key] !== previousState[key])) {
    scheduleAutoGistSync(() => useBudgetStore.getState());
  }
});
