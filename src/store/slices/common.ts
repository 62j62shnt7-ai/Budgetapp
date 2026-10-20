import type {
  AccountBalance,
  CashEntry,
  RatesData,
  SalaryPayment,
  BudgetFinancialSnapshot,
  UndoableAction,
} from '../../types';
import { getCurrencyRateOr } from '../../engine/currency';
import { inferTag } from '../../engine/tags';
import {
  saveStorage as adapterSaveStorage,
  loadStorageSync as adapterLoadStorageSync,
  persistUndoHistoryToStorage,
} from '../../utils/storageAdapter';
import {
  getStoredDriveToken,
  getStoredDriveAutoSync,
  uploadBudgetToDrive,
} from '../../services/googleDriveClient';
import type { BudgetStoreState } from './types';

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
  lastDriveSync: 'budget-control-last-drive-sync',
  lastGistUpload: 'budget-control-last-gist-upload',
  lastGistSync: 'budget-control-last-gist-sync',
};

export function loadStorage<T>(key: string, fallback: T): T {
  try {
    const val = adapterLoadStorageSync<unknown>(key, undefined);
    if (val === undefined || val === null) {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || parsed === undefined) return fallback;
        return validateFallbackShape(key, parsed, fallback);
      }
      return fallback;
    }
    return validateFallbackShape(key, val, fallback);
  } catch (err) {
    console.warn(`Error reading ${key} from storage:`, err);
    return fallback;
  }
}

function validateFallbackShape<T>(key: string, parsed: unknown, fallback: T): T {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(parsed)) return fallback;
    if (key === STORAGE_KEYS.deletedForecasts) {
      return (parsed.filter((item): item is string => typeof item === 'string') as unknown) as T;
    }
    return (parsed.filter((item) => item !== null && item !== undefined && typeof item === 'object') as unknown) as T;
  }

  if (typeof fallback === 'object' && fallback !== null) {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fallback;
    if (key === STORAGE_KEYS.rates) {
      const r = parsed as Partial<RatesData>;
      if (!Array.isArray(r.currencies) || !Array.isArray(r.gold)) return fallback;
    }
    if (key === STORAGE_KEYS.accounts) {
      const accs = parsed as Record<string, unknown>;
      if (Object.keys(accs).length === 0) return fallback;
    }
    return parsed as T;
  }

  if (typeof fallback === 'string') {
    if (typeof parsed !== 'string') return fallback;
    if (key === STORAGE_KEYS.salaryAnchor && parsed.length < 7) return fallback;
    return parsed as T;
  }

  if (typeof fallback === 'number') {
    return (typeof parsed === 'number' && !isNaN(parsed)) ? (parsed as T) : fallback;
  }

  if (typeof fallback === 'boolean') {
    return typeof parsed === 'boolean' ? (parsed as T) : fallback;
  }

  return parsed as T;
}

export function saveStorage<T>(key: string, value: T): void {
  adapterSaveStorage(key, value);
}

export function safeSetItem(key: string, value: string): void {
  try {
    adapterSaveStorage(key, value);
  } catch {
    // Bookkeeping only — losing this write must not fail the user's action.
  }
}

export let lastLocalMutationTimestamp = (() => {
  const mem = adapterLoadStorageSync<number>(STORAGE_KEYS.lastLocalModified, 0);
  if (mem) return mem;
  if (typeof localStorage !== 'undefined') {
    return Number(localStorage.getItem(STORAGE_KEYS.lastLocalModified) || 0) || 0;
  }
  return 0;
})();

export function setLastLocalMutationTimestamp(ts: number) {
  lastLocalMutationTimestamp = ts;
}

export let lastGistUploadTimestamp = (() => {
  const mem = adapterLoadStorageSync<number>(STORAGE_KEYS.lastGistUpload, 0);
  if (mem) return mem;
  if (typeof localStorage !== 'undefined') {
    return Number(localStorage.getItem(STORAGE_KEYS.lastGistUpload) || 0) || 0;
  }
  return 0;
})();

export function setLastGistUploadTimestamp(ts: number) {
  lastGistUploadTimestamp = ts;
}

export let suppressDirtyMarking = false;
export function setSuppressDirtyMarking(val: boolean) {
  suppressDirtyMarking = val;
}

export let hasPendingUserEdit = false;
export function setHasPendingUserEdit(val: boolean) {
  hasPendingUserEdit = val;
}

export let initStoragePromise: Promise<void> | null = null;
export function setInitStoragePromise(promise: Promise<void> | null) {
  initStoragePromise = promise;
}

let driveSyncTimer: ReturnType<typeof setTimeout> | null = null;
let driveSyncInFlight = false;
export let suppressAutoSync = false;
export function setSuppressAutoSync(val: boolean) {
  suppressAutoSync = val;
}

export function scheduleAutoDriveSync(
  getState: () => BudgetStoreState,
  immediate = false,
  options?: { isUserEdit?: boolean; rateRefresh?: boolean }
): void {
  if (typeof window === 'undefined') return;
  const token = getStoredDriveToken();
  const autoSync = getStoredDriveAutoSync();
  if (!token || !autoSync) return;

  const isRateRefresh = options?.rateRefresh === true;
  const isUserEdit = options?.isUserEdit !== undefined ? options.isUserEdit : !isRateRefresh;
  if (isUserEdit) {
    hasPendingUserEdit = true;
  }

  if (driveSyncTimer) {
    clearTimeout(driveSyncTimer);
    driveSyncTimer = null;
  }

  try {
    const curStatus = getState().driveSyncStatus;
    if (curStatus !== 'syncing') {
      getState().setDriveSyncStatus('scheduled');
    }
  } catch {
    // Store might not be fully initialized yet
  }

  const executeSync = async () => {
    driveSyncTimer = null;
    if (driveSyncInFlight) {
      scheduleAutoDriveSync(getState, false);
      return;
    }
    driveSyncInFlight = true;
    getState().setDriveSyncStatus('syncing');
    const wasUserEdit = hasPendingUserEdit;
    hasPendingUserEdit = false;
    try {
      const state = getState();
      const payload = state.exportJSON();
      const res = await uploadBudgetToDrive(payload, { isUserEdit: wasUserEdit });
      if (res.success) {
        getState().setDriveSyncStatus('synced');
        if (res.modifiedTime) {
          const syncTime = res.modifiedTime;
          const now = Date.now();
          lastLocalMutationTimestamp = now;
          state.setDriveSyncStatus('synced');
          saveStorage(STORAGE_KEYS.lastDriveSync, syncTime);
          saveStorage(STORAGE_KEYS.lastLocalModified, String(now));
        }
      } else {
        getState().setDriveSyncStatus('error');
      }
    } catch (err) {
      console.warn('[scheduleAutoDriveSync] background sync error:', err);
      getState().setDriveSyncStatus('error');
    } finally {
      driveSyncInFlight = false;
    }
  };

  if (immediate) {
    void executeSync();
  } else {
    driveSyncTimer = setTimeout(executeSync, 2000);
  }
}

export function scheduleAutoGistSync(
  getState: () => BudgetStoreState,
  immediate = false,
  options: { rateRefresh?: boolean; isUserEdit?: boolean } = {}
): void {
  scheduleAutoDriveSync(getState, immediate, options);
}

export const defaultAccounts: Record<string, AccountBalance> = {
  hsbc: { name: 'HSBC', balance: 0, maturityDay: 30 },
  cib: { name: 'CIB', balance: 0, maturityDay: 15 },
};

export function withoutCashAccount(accounts: Record<string, AccountBalance>): Record<string, AccountBalance> {
  const { cash: _cash, ...remaining } = accounts;
  return remaining;
}

export const defaultSalaryPattern: SalaryPayment[] = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 },
];

export function revertStorageOrAccountBalance(
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
  const { assetId, account, currency = 'EGP', amount, isEgpAmount = false, fxRate, entryType = 'income' } = params;
  if (!amount || amount <= 0) return;

  const storageAssets = get().storageAssets;
  const currUpper = (currency || 'EGP').toUpperCase();
  const isForeign = currUpper !== 'EGP';
  const accountLower = (account || '').toLowerCase().trim();

  let targetAsset = assetId ? storageAssets.find((a) => a.id === assetId) : undefined;

  if (!targetAsset && account) {
    targetAsset = storageAssets.find(
      (a) => a.name.trim().toLowerCase() === accountLower
    );
  }

  const isDirectOperatingAccount = Boolean(!assetId && accountLower && get().accounts[accountLower]);
  if (!targetAsset && isForeign && !isDirectOperatingAccount) {
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

  if (!targetAsset && isForeign && !isDirectOperatingAccount) {
    targetAsset = storageAssets.find(
      (a) => (a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper
    );
  }

  if (targetAsset) {
    let nativeQty = amount;
    if (isEgpAmount && isForeign) {
      const rate = fxRate || targetAsset.rate || targetAsset.buyPrice || getCurrencyRateOr(get().rates, currUpper, 1);
      nativeQty = Math.round((amount / rate) * 100) / 100;
    }
    const currentQty = Number(targetAsset.quantity) || 0;
    const nextQty = entryType === 'expense'
      ? currentQty + nativeQty
      : currentQty - nativeQty;
    get().updateStorageAsset(targetAsset.id, { quantity: nextQty });
    return;
  }

  if (get().accounts[accountLower]) {
    let egpDelta = amount;
    if (!isEgpAmount && isForeign) {
      const rate = fxRate || getCurrencyRateOr(get().rates, currUpper, 1);
      egpDelta = Math.round(amount * rate * 100) / 100;
    }
    const currentBal = get().accounts[accountLower].balance || 0;
    const nextBal = Math.round((entryType === 'expense'
      ? currentBal + egpDelta
      : currentBal - egpDelta) * 100) / 100;
    get().updateAccountBalance(accountLower, nextBal);
  }
}

export const MAX_UNDO_DEPTH = 30;
export let isTransactionRunning = false;
export function setIsTransactionRunning(val: boolean) {
  isTransactionRunning = val;
}

export let transactionDepth = 0;
export function setTransactionDepth(val: number) {
  transactionDepth = val;
}

export function captureFinancialSnapshot(state: BudgetStoreState): BudgetFinancialSnapshot {
  return structuredClone({
    entries: state.entries,
    archivedEntries: state.archivedEntries,
    deletedForecasts: state.deletedForecasts,
    accounts: state.accounts,
    salaryPattern: state.salaryPattern,
    installments: state.installments,
    rates: state.rates,
    storageAssets: state.storageAssets,
    asfJobs: state.asfJobs,
    irqJobs: state.irqJobs,
    partTimeJobs: state.partTimeJobs,
    entryActuals: state.entryActuals,
    entryActualDates: state.entryActualDates,
    creditDues: state.creditDues,
    creditDueMonths: state.creditDueMonths,
    creditSettlementOverrides: state.creditSettlementOverrides,
    salaryAnchorMonth: state.salaryAnchorMonth,
  });
}

export function persistFinancialSnapshot(snapshot: BudgetFinancialSnapshot): void {
  saveStorage(STORAGE_KEYS.entries, snapshot.entries);
  saveStorage(STORAGE_KEYS.archivedEntries, snapshot.archivedEntries);
  saveStorage(STORAGE_KEYS.deletedForecasts, snapshot.deletedForecasts);
  saveStorage(STORAGE_KEYS.accounts, snapshot.accounts);
  saveStorage(STORAGE_KEYS.salary, snapshot.salaryPattern);
  saveStorage(STORAGE_KEYS.installments, snapshot.installments);
  saveStorage(STORAGE_KEYS.rates, snapshot.rates);
  saveStorage(STORAGE_KEYS.storage, snapshot.storageAssets);
  saveStorage(STORAGE_KEYS.asf, snapshot.asfJobs);
  saveStorage(STORAGE_KEYS.irq, snapshot.irqJobs);
  saveStorage(STORAGE_KEYS.partTimeJobs, snapshot.partTimeJobs);
  saveStorage(STORAGE_KEYS.entryActuals, snapshot.entryActuals);
  saveStorage(STORAGE_KEYS.entryActualDates, snapshot.entryActualDates);
  saveStorage(STORAGE_KEYS.creditDues, snapshot.creditDues);
  saveStorage(STORAGE_KEYS.creditDueMonths, snapshot.creditDueMonths);
  saveStorage(STORAGE_KEYS.creditSettlementOverrides, snapshot.creditSettlementOverrides);
  saveStorage(STORAGE_KEYS.salaryAnchor, snapshot.salaryAnchorMonth);
}

export function recordUndoableStep(
  set: (partial: Partial<BudgetStoreState> | ((state: BudgetStoreState) => Partial<BudgetStoreState>)) => void,
  get: () => BudgetStoreState,
  label: string
): void {
  const now = Date.now();
  hasPendingUserEdit = true;
  lastLocalMutationTimestamp = now;
  saveStorage(STORAGE_KEYS.lastLocalModified, String(now));
  if (isTransactionRunning) return;

  try {
    const snapshot = captureFinancialSnapshot(get());
    const action: UndoableAction = {
      id: `undo-${now}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: now,
      snapshot,
    };

    const nextUndoStack = [action, ...get().undoStack].slice(0, MAX_UNDO_DEPTH);
    set({
      undoStack: nextUndoStack,
      redoStack: [],
      undoToast: { id: action.id, label, timestamp: now },
      lastLocalModified: now,
    });
    void persistUndoHistoryToStorage(nextUndoStack, []);
  } catch (err) {
    console.warn('Failed to capture undo snapshot:', err);
  }
}

export function upgradeLoadedEntries(rawEntries: CashEntry[]): CashEntry[] {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries.map((entry) => {
    let tag = entry.tag;
    const lower = (tag || '').toLowerCase().trim();
    if (!lower || lower === 'credit' || lower === 'credit card' || lower === 'card spend') {
      const inferred = inferTag(entry);
      if (inferred) tag = inferred;
    }
    return tag !== entry.tag ? { ...entry, tag } : entry;
  });
}
