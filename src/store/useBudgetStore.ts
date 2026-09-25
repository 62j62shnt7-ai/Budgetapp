// ==========================================================================
// Complete Zustand Budget Store with Full Legacy LocalStorage Sync
// ==========================================================================
import { create } from 'zustand';
import type {
  AccountBalance,
  CashEntry,
  Installment,
  JobItem,
  RatesData,
  SalaryPayment,
  StorageAsset,
} from '../types';
import { defaultRates, resolveRateSourceValue, computeTotalStorageValue } from '../engine/currency';
import {
  buildCreditDueEntries,
  getCreditSettlementMonth,
  isCardExpenseForAccount,
  isLumpCreditDueForAccount,
} from '../engine/creditCards';
import { buildSalaryEntries } from '../engine/salaryAndInstallments';

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
    const isQuotaError = err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (isQuotaError && !quotaAlertShown) {
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
  creditSettlementOverrides: Record<string, { amount?: number; date?: string }>;
  salaryAnchorMonth: string;

  // Cloud Sync & Admin
  gistToken: string;
  gistId: string;
  gistAutoSync: boolean;
  gistSyncStatus: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error';
  historyAdminUnlocked: boolean;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: ViewTab) => void;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;

  addEntry: (entry: Omit<CashEntry, 'id'>) => void;
  updateEntry: (id: string, updates: Partial<CashEntry>) => void;
  deleteEntry: (id: string) => void;
  recordActual: (entryId: string, amount: number, date?: string, drawMeta?: { note?: string; tag?: string; account?: string }) => void;
  clearActual: (entryId: string) => void;
  updateCreditSettlementOverride: (id: string, override: { amount?: number; date?: string }) => void;
  recalculateCreditSettlement: (id: string) => CashEntry | undefined;

  updateAccountBalance: (accountKey: string, newBalance: number) => void;
  updateSalaryPattern: (pattern: SalaryPayment[]) => void;
  populateSalaryForecast: (startMonth: string, quarters: number, anchorMonth?: string) => number;
  clearSalaryForecast: (startMonth?: string, quarters?: number) => number;

  addInstallment: (installment: Omit<Installment, 'id'>) => void;
  updateInstallment: (id: string, updates: Partial<Installment>) => void;
  deleteInstallment: (id: string) => void;

  updateRates: (rates: RatesData, syncImmediately?: boolean) => void;
  syncStorageRates: (rates?: RatesData) => void;

  addStorageAsset: (asset: Omit<StorageAsset, 'id'>) => void;
  updateStorageAsset: (id: string, updates: Partial<StorageAsset>) => void;
  deleteStorageAsset: (id: string) => void;

  // Jobs Actions
  saveJob: (jobType: 'asf' | 'irq' | 'partTime', job: JobItem) => void;
  deleteJob: (jobType: 'asf' | 'irq' | 'partTime', jobId: string) => void;

  setGistConfig: (token: string, gistId: string, autoSync: boolean) => void;
  syncFromGist: (token?: string, gistId?: string) => Promise<boolean>;
  autoTagEntries: () => number;
  resetData: () => void;
  restoreResetBackup: () => boolean;
  setHistoryAdminUnlocked: (unlocked: boolean) => void;

  exportJSON: () => string;
  importJSON: (jsonString: string) => boolean;
}

function scheduleAutoGistSync(getState: () => BudgetStoreState, immediate = false): void {
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

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  theme: (localStorage.getItem(STORAGE_KEYS.theme) as 'dark' | 'light') || 'light',
  activeTab: 'dashboard',
  sidebarCollapsed: loadStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false),

  entries: loadStorage<CashEntry[]>(STORAGE_KEYS.entries, []),
  archivedEntries: loadStorage<CashEntry[]>(STORAGE_KEYS.archivedEntries, []),
  deletedForecasts: loadStorage<string[]>(STORAGE_KEYS.deletedForecasts, []),
  accounts: withoutCashAccount(loadStorage<Record<string, AccountBalance>>(STORAGE_KEYS.accounts, defaultAccounts)),
  salaryPattern: loadStorage<SalaryPayment[]>(STORAGE_KEYS.salary, defaultSalaryPattern),
  installments: loadStorage<Installment[]>(STORAGE_KEYS.installments, []),
  rates: loadStorage<RatesData>(STORAGE_KEYS.rates, defaultRates),
  storageAssets: loadStorage<StorageAsset[]>(STORAGE_KEYS.storage, []),

  asfJobs: loadStorage<JobItem[]>(STORAGE_KEYS.asf, []),
  irqJobs: loadStorage<JobItem[]>(STORAGE_KEYS.irq, []),
  partTimeJobs: loadStorage<JobItem[]>(STORAGE_KEYS.partTimeJobs, []),

  entryActuals: loadStorage<Record<string, number>>(STORAGE_KEYS.entryActuals, {}),
  entryActualDates: loadStorage<Record<string, string>>(STORAGE_KEYS.entryActualDates, {}),

  creditDues: loadStorage<Record<string, Record<string, number>>>(STORAGE_KEYS.creditDues, {}),
  creditDueMonths: loadStorage<Record<string, string[]>>(STORAGE_KEYS.creditDueMonths, {}),
  creditSettlementOverrides: loadStorage<Record<string, { amount?: number; date?: string }>>(STORAGE_KEYS.creditSettlementOverrides, {}),
  salaryAnchorMonth: loadStorage<string>(STORAGE_KEYS.salaryAnchor, new Date().toISOString().slice(0, 7)),

  gistToken: localStorage.getItem(STORAGE_KEYS.gistToken) || '',
  gistId: localStorage.getItem(STORAGE_KEYS.gistId) || '',
  gistAutoSync: localStorage.getItem(STORAGE_KEYS.gistAutoSync) === null
    ? true
    : localStorage.getItem(STORAGE_KEYS.gistAutoSync) === 'true',
  gistSyncStatus: 'idle',
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
    scheduleAutoGistSync(get);
  },

  updateEntry: (id, updates) => {
    const current = get().entries.find((e) => e.id === id);
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
    scheduleAutoGistSync(get);
  },

  deleteEntry: (id) => {
    const target = get().entries.find((e) => e.id === id);
    const linkedLoanId = target?.type === 'income' ? target.loanId : undefined;
    const shouldDeleteLinked = Boolean(
      linkedLoanId &&
      typeof window !== 'undefined' &&
      window.confirm('This entry has a linked loan repayment. Delete the repayment too?')
    );
    const updated = get().entries.filter(
      (e) => e.id !== id && !(shouldDeleteLinked && e.loanId === linkedLoanId)
    );
    const updatedInstallments = shouldDeleteLinked && linkedLoanId
      ? get().installments.filter((installment) => installment.loanId !== linkedLoanId)
      : get().installments;
    saveStorage(STORAGE_KEYS.entries, updated);
    if (updatedInstallments !== get().installments) {
      saveStorage(STORAGE_KEYS.installments, updatedInstallments);
    }
    set({ entries: updated, installments: updatedInstallments });
    scheduleAutoGistSync(get);
  },

  recordActual: (entryId, amount, date, drawMeta) => {
    const actDate = date || new Date().toISOString().slice(0, 10);
    const actuals = { ...get().entryActuals, [entryId]: amount };
    const dates = { ...get().entryActualDates };
    if (date) dates[entryId] = date;

    const existingIndex = get().entries.findIndex((e) => e.id === entryId);
    let updatedEntries = get().entries;
    if (existingIndex !== -1) {
      const entry = get().entries[existingIndex];
      const prevActual = Number(get().entryActuals[entryId] ?? entry.actualAmount ?? 0);
      const tranche = amount > prevActual ? amount - prevActual : amount;

      let draws = Array.isArray(entry.draws) ? [...entry.draws] : [];
      if (draws.length === 0 && prevActual > 0) {
        draws.push({
          date: entry.actualDate || entry.date || actDate,
          amount: prevActual,
          tag: entry.tag || '',
          account: entry.account || 'cash',
        });
      }

      if (tranche > 0 && amount > prevActual) {
        draws.push({
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
    }

    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entries: updatedEntries, entryActuals: actuals, entryActualDates: dates });
    scheduleAutoGistSync(get);
  },

  clearActual: (entryId) => {
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

    saveStorage(STORAGE_KEYS.entryActuals, actuals);
    saveStorage(STORAGE_KEYS.entryActualDates, dates);
    set({ entries: updatedEntries, entryActuals: actuals, entryActualDates: dates });
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

  deleteInstallment: (id) => {
    const updated = get().installments.filter((i) => i.id !== id);
    saveStorage(STORAGE_KEYS.installments, updated);
    set({ installments: updated });
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
        files?: Record<string, { content?: string }>;
      };
      const file = data.files?.['budget-data.json']
        || data.files?.['budget-control-backup.json']
        || Object.values(data.files || {})[0];
      if (!file?.content || !get().importJSON(file.content)) {
        throw new Error('No valid budget JSON file found in this Gist');
      }
      set({ gistSyncStatus: 'synced' });
      return true;
    } catch (error) {
      console.error('Gist download failed:', error);
      set({ gistSyncStatus: 'error' });
      return false;
    }
  },

  autoTagEntries: () => {
    const state = get();
    let count = 0;
    const updatedEntries = state.entries.map((entry) => {
      if (entry.tag?.trim()) return entry;
      const tag = inferTag(entry);
      if (!tag) return entry;
      count += 1;
      return { ...entry, tag };
    });
    const updatedInstallments = state.installments.map((installment) => {
      if (installment.tag?.trim()) return installment;
      count += 1;
      return { ...installment, tag: inferTag({ category: installment.name, source: 'installment' }) || 'Installment' };
    });
    if (count > 0) {
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      saveStorage(STORAGE_KEYS.installments, updatedInstallments);
      set({ entries: updatedEntries, installments: updatedInstallments });
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
    saveStorage(STORAGE_KEYS.salaryAnchor, new Date().toISOString().slice(0, 7));
    set({
      entries: emptyEntries,
      archivedEntries: emptyEntries,
      accounts: resetAccounts,
      salaryPattern: resetSalary,
      rates: resetRates,
      creditDues: {},
      creditDueMonths: {},
      creditSettlementOverrides: {},
      salaryAnchorMonth: new Date().toISOString().slice(0, 7),
      installments: emptyInstallments,
      storageAssets: emptyStorage,
      asfJobs: emptyJobs,
      irqJobs: emptyJobs,
      partTimeJobs: emptyJobs,
      entryActuals: {},
      entryActualDates: {},
      deletedForecasts: [],
    });
  },

  restoreResetBackup: () => {
    const raw = localStorage.getItem(STORAGE_KEYS.resetBackup);
    if (!raw) return false;
    try {
      const backup = JSON.parse(raw);
      const restored = {
        salaryPattern: backup.salaryPattern || defaultSalaryPattern,
        salaryAnchorMonth: backup.salaryAnchorMonth || new Date().toISOString().slice(0, 7),
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
        creditDues: state.creditDues,
        creditDueMonths: state.creditDueMonths,
        creditSettlementOverrides: state.creditSettlementOverrides,
        salaryAnchorMonth: state.salaryAnchorMonth,
        archivedEntries: state.archivedEntries,
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
      asfJobs: state.asfJobs,
      irqJobs: state.irqJobs,
      partTimeJobs: state.partTimeJobs,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
      creditDues: state.creditDues,
      creditDueMonths: state.creditDueMonths,
      creditSettlementOverrides: state.creditSettlementOverrides,
      salaryAnchorMonth: state.salaryAnchorMonth,
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
          newAccounts = withoutCashAccount(accMap);
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

      const rawCreditDues = data.creditDues || parsed.creditDues;
      const rawCreditDueMonths = data.creditDueMonths || parsed.creditDueMonths;
      const rawSettlementOverrides = data.creditSettlementOverrides || parsed.creditSettlementOverrides;
      const rawSalaryAnchor = data.salaryAnchorMonth || parsed.salaryAnchorMonth;
      const newCreditDues = rawCreditDues && typeof rawCreditDues === 'object'
        ? rawCreditDues as Record<string, Record<string, number>>
        : get().creditDues;
      const newCreditDueMonths = rawCreditDueMonths && typeof rawCreditDueMonths === 'object'
        ? rawCreditDueMonths as Record<string, string[]>
        : get().creditDueMonths;
      const newSettlementOverrides = rawSettlementOverrides && typeof rawSettlementOverrides === 'object'
        ? rawSettlementOverrides as Record<string, { amount?: number; date?: string }>
        : get().creditSettlementOverrides;
      const newSalaryAnchor = typeof rawSalaryAnchor === 'string' ? rawSalaryAnchor : get().salaryAnchorMonth;
      saveStorage(STORAGE_KEYS.creditDues, newCreditDues);
      saveStorage(STORAGE_KEYS.creditDueMonths, newCreditDueMonths);
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, newSettlementOverrides);
      saveStorage(STORAGE_KEYS.salaryAnchor, newSalaryAnchor);

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
          day: Number(inst.day) || 10,
        }));
        saveStorage(STORAGE_KEYS.installments, newInstallments);
      }

      // 5. Rates
      const rawRates = data.ratesData || data.rates || parsed.ratesData || parsed.rates;
      let newRates: RatesData = get().rates;
      if (rawRates && typeof rawRates === 'object') {
        const localRates = get().rates;
        const localLast = localRates.lastFetched ? new Date(localRates.lastFetched).getTime() : 0;
        const rawLast = typeof rawRates.lastFetched === 'string' ? new Date(rawRates.lastFetched).getTime() : 0;

        // If local rates were updated more recently than the incoming backup/Gist, retain newer local rates
        if (localLast > 0 && rawLast > 0 && localLast > rawLast) {
          newRates = localRates;
        } else {
          newRates = {
            currencies: Array.isArray(rawRates.currencies) && rawRates.currencies.length > 0 ? rawRates.currencies : (localRates.currencies || defaultRates.currencies),
            gold: Array.isArray(rawRates.gold) && rawRates.gold.length > 0 ? rawRates.gold : (localRates.gold || defaultRates.gold),
            lastFetched: typeof rawRates.lastFetched === 'string' ? rawRates.lastFetched : localRates.lastFetched,
            currenciesLastFetched: typeof rawRates.currenciesLastFetched === 'string' ? rawRates.currenciesLastFetched : localRates.currenciesLastFetched,
            goldLastFetched: typeof rawRates.goldLastFetched === 'string' ? rawRates.goldLastFetched : localRates.goldLastFetched,
            previousStorageTotal: typeof rawRates.previousStorageTotal === 'number' ? rawRates.previousStorageTotal : localRates.previousStorageTotal,
          };
          saveStorage(STORAGE_KEYS.rates, newRates);
        }
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
        creditDues: newCreditDues,
        creditDueMonths: newCreditDueMonths,
        creditSettlementOverrides: newSettlementOverrides,
        salaryAnchorMonth: newSalaryAnchor,
        storageAssets: newStorage,
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
