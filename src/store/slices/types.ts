import type { StateCreator } from 'zustand';
import type {
  AccountBalance,
  CashEntry,
  Installment,
  JobItem,
  RatesData,
  SalaryPayment,
  StorageAsset,
  ViewTab,
  NavigationIntent,
  UndoableAction,
  UndoToastState,
  CreditSettlementOverride,
} from '../../types';
import type { GoogleDriveUser } from '../../services/googleDriveClient';

export interface UISlice {
  theme: 'dark' | 'light';
  activeTab: ViewTab;
  pendingNavigation: NavigationIntent | null;
  sidebarCollapsed: boolean;
  historyAdminUnlocked: boolean;
  salaryCollapsed: boolean;
  installmentsCollapsed: boolean;
  expenseMixCollapsed: boolean;
  historyAnalyticsCollapsed: boolean;

  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: ViewTab) => void;
  navigateTo: (tab: ViewTab, filters?: NavigationIntent['filters']) => void;
  clearPendingNavigation: () => void;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;
  setSalaryCollapsed: (collapsed: boolean) => void;
  setInstallmentsCollapsed: (collapsed: boolean) => void;
  setExpenseMixCollapsed: (collapsed: boolean) => void;
  setHistoryAnalyticsCollapsed: (collapsed: boolean) => void;
}

export interface UndoSlice {
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  undoToast: UndoToastState | null;

  undo: () => boolean;
  redo: () => boolean;
  runTransaction: <T>(label: string, fn: () => T) => T;
  dismissUndoToast: () => void;
  clearUndoHistory: () => void;
}

export interface EntriesSlice {
  entries: CashEntry[];
  archivedEntries: CashEntry[];
  deletedForecasts: string[];
  entryActuals: Record<string, number>;
  entryActualDates: Record<string, string>;
  salaryPattern: SalaryPayment[];
  salaryAnchorMonth: string;
  installments: Installment[];

  addEntry: (entry: Omit<CashEntry, 'id'>) => string;
  updateEntry: (
    id: string,
    updates: Partial<CashEntry>,
    seriesMode?: 'single' | 'future',
    options?: { skipLoanScaling?: boolean }
  ) => void;
  deleteEntry: (
    id: string,
    seriesMode?: 'single' | 'future',
    options?: {
      deleteLinkedLoan?: boolean;
      deleteInstallmentPlan?: boolean;
      revertStorage?: boolean;
      storageAssetId?: string;
      syncJob?: boolean;
      restoreForeignAsset?: boolean;
    }
  ) => void;
  recordActual: (
    entryId: string,
    amount: number,
    date?: string,
    drawMeta?: { note?: string; tag?: string; account?: string }
  ) => void;
  clearActual: (
    entryId: string,
    options?: { revertStorage?: boolean; storageAssetId?: string; syncJob?: boolean; keepDraws?: boolean }
  ) => void;
  addDraw: (
    entryId: string,
    draw: { id?: string; date: string; amount: number; note?: string; tag?: string; account?: string }
  ) => void;
  updateDraw: (
    entryId: string,
    drawIndex: number,
    draw: { date: string; amount: number; note?: string; tag?: string; account?: string }
  ) => void;
  deleteDraw: (
    entryId: string,
    drawIndex: number,
    options?: { updateCashflow?: boolean; syncJob?: boolean; revertStorage?: boolean; storageAssetId?: string }
  ) => void;

  updateSalaryPattern: (pattern: SalaryPayment[]) => void;
  setSalaryAnchorMonth: (month: string) => void;
  populateSalaryForecast: (startMonth: string, quarters: number, anchorMonth?: string) => number;
  clearSalaryForecast: (startMonth?: string, quarters?: number) => number;

  addInstallment: (installment: Omit<Installment, 'id'>) => void;
  updateInstallment: (id: string, updates: Partial<Installment>) => void;
  deleteInstallment: (id: string, options?: { deleteCashEntries?: boolean }) => void;

  archiveSettledEntries: () => number;
  unarchiveEntry: (id: string) => void;
  autoTagEntries: () => number;
  restoreDeletedForecast: (id: string) => void;
  clearAllDeletedForecasts: () => void;
  linkRecurringSeries: (entryIds: string[], customSeriesId?: string) => { seriesId: string; modifiedCount: number };
  unlinkRecurringSeries: (seriesId: string) => number;
  autoLinkAllRecurringCandidates: () => { linkedGroupsCount: number; modifiedEntriesCount: number };
}

export interface AccountsSlice {
  accounts: Record<string, AccountBalance>;
  creditDues: Record<string, Record<string, number>>;
  creditDueMonths: Record<string, string[]>;
  creditSettlementOverrides: Record<string, CreditSettlementOverride>;

  updateAccountBalance: (accountKey: string, newBalance: number) => void;
  transferAccountFunds: (fromAccountKey: string, toAccountKey: string, amount: number, note?: string) => boolean;
  updateCreditSettlementOverride: (id: string, override: { amount?: number; date?: string; note?: string }) => void;
  recalculateCreditSettlement: (id: string) => CashEntry | undefined;
}

export interface JobsSlice {
  asfJobs: JobItem[];
  irqJobs: JobItem[];
  partTimeJobs: JobItem[];

  saveJob: (jobType: 'asf' | 'irq' | 'partTime', job: JobItem) => void;
  deleteJob: (jobType: 'asf' | 'irq' | 'partTime', jobId: string, options?: { deleteCashEntries?: boolean }) => void;
  deleteJobPayment: (
    jobType: 'asf' | 'irq' | 'partTime',
    jobId: string,
    paymentId: string,
    options?: { syncCashflow?: boolean; deleteCashEntry?: boolean; revertStorage?: boolean; storageAssetId?: string }
  ) => void;
  settleJobForecastPayment: (entryId: string, actualEgp: number, isFinishing?: boolean) => boolean;
}

export interface RatesSlice {
  rates: RatesData;
  storageAssets: StorageAsset[];

  updateRates: (rates: RatesData, syncImmediately?: boolean) => void;
  syncStorageRates: (rates?: RatesData) => void;

  addStorageAsset: (asset: Omit<StorageAsset, 'id'>) => void;
  updateStorageAsset: (id: string, updates: Partial<StorageAsset>) => void;
  deleteStorageAsset: (id: string, options?: { resetJobDestinations?: boolean }) => void;
  depositToStorageAsset: (assetId: string, amount: number) => void;
  transferStorageAsset: (fromAssetId: string, toAssetId: string, amount: number) => boolean;
  convertStorageAssetToEgp: (
    assetId: string,
    foreignAmount: number,
    targetAccount: string,
    customRate?: number
  ) => string | undefined;
}

export interface SyncSlice {
  // Google Drive Cloud Sync & Admin
  driveUser: GoogleDriveUser | null;
  driveAutoSync: boolean;
  driveSyncStatus: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error' | 'expired';
  lastDriveSyncTime: string | null;
  lastLocalModified: number;

  setDriveUser: (user: GoogleDriveUser | null) => void;
  setDriveAutoSync: (enabled: boolean) => void;
  setDriveSyncStatus: (status: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error' | 'expired') => void;

  // Legacy compatibility fields (deprecated)
  gistToken: string;
  gistId: string;
  gistAutoSync: boolean;
  gistSyncStatus: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error';
  gistConflict: { remoteTime?: string; remoteData: string } | null;

  resolveGistConflict: (resolution: 'local' | 'remote') => Promise<void>;
  setGistConfig: (token: string, gistId: string, autoSync: boolean) => void;
  syncFromGist: (token?: string, gistId?: string) => Promise<boolean>;

  exportJSON: () => string;
  importJSON: (jsonString: string, options?: { isRemoteSync?: boolean }) => boolean;
  resetData: () => void;
  restoreResetBackup: () => boolean;
  undoImport: () => boolean;

  // Storage Lifecycle
  isStorageReady: boolean;
  initStorage: () => Promise<void>;
}

export type BudgetStoreState = UISlice &
  UndoSlice &
  EntriesSlice &
  AccountsSlice &
  JobsSlice &
  RatesSlice &
  SyncSlice;

export type SliceCreator<T> = StateCreator<BudgetStoreState, [], [], T>;
