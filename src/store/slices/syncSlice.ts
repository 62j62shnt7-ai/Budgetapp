import type {
  AccountBalance,
  CashEntry,
  Installment,
  JobItem,
  RatesData,
  SalaryPayment,
  StorageAsset,
  BudgetFinancialSnapshot,
  CreditSettlementOverride,
} from '../../types';
import { DateUtils } from '../../engine/dateUtils';
import { defaultRates, inferAssetLocation } from '../../engine/currency';
import { migrateBackupPayload } from '../../engine/migration';
import {
  migrateFromLocalStorageIfNeeded,
  loadAllFromIndexedDB,
  restoreUndoHistoryFromStorage,
  removeStorage,
} from '../../utils/storageAdapter';
import {
  getStoredDriveUser,
  saveStoredDriveUser,
  getStoredDriveAutoSync,
  saveStoredDriveAutoSync,
  type GoogleDriveUser,
} from '../../services/googleDriveClient';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  scheduleAutoDriveSync,
  upgradeLoadedEntries,
  withoutCashAccount,
  defaultAccounts,
  defaultSalaryPattern,
  captureFinancialSnapshot,
  persistFinancialSnapshot,
  recordUndoableStep,
  lastLocalMutationTimestamp,
  setLastLocalMutationTimestamp,
  initStoragePromise,
  setInitStoragePromise,
  suppressAutoSync,
  setSuppressAutoSync,
} from './common';
import type { SliceCreator, SyncSlice, BudgetStoreState } from './types';

export const createSyncSlice: SliceCreator<SyncSlice> = (set, get) => {
  const initialUser = getStoredDriveUser();
  const initialHasUnsynced = Boolean(loadStorage<boolean>(STORAGE_KEYS.hasUnsyncedChanges, false));

  return {
    driveUser: initialUser,
    driveAutoSync: getStoredDriveAutoSync(),
    driveSyncStatus: 'idle',
    lastDriveSyncTime: loadStorage<string | null>(STORAGE_KEYS.lastDriveSync, null),
    lastLocalModified: lastLocalMutationTimestamp,
    hasUnsyncedChanges: initialHasUnsynced,

    setHasUnsyncedChanges: (hasChanges: boolean) => {
      saveStorage(STORAGE_KEYS.hasUnsyncedChanges, hasChanges);
      set({ hasUnsyncedChanges: hasChanges });
    },

    setDriveUser: (user: GoogleDriveUser | null) => {
      saveStoredDriveUser(user);
      set({
        driveUser: user,
        driveSyncStatus: user ? 'synced' : 'idle',
        gistSyncStatus: user ? 'synced' : 'idle',
      });
    },

  setDriveAutoSync: (enabled: boolean) => {
    saveStoredDriveAutoSync(enabled);
    set({ driveAutoSync: enabled, gistAutoSync: enabled });
  },

  setDriveSyncStatus: (status: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error' | 'expired') =>
    set({
      driveSyncStatus: status,
      gistSyncStatus: status === 'expired' ? 'error' : status,
    }),

  setDriveSyncTime: (time: string | null) =>
    set({ lastDriveSyncTime: time }),

  setLastLocalModified: (timestamp: number) =>
    set({ lastLocalModified: timestamp }),

  // Deprecated Gist compatibility fields (maintained for test harness / zero-breakage)
  gistToken: '',
  gistId: '',
  gistAutoSync: false,
  gistSyncStatus: 'idle',
  gistConflict: null,

  setGistConfig: (_token: string, _gistId: string, _autoSync: boolean) => {
    // Deprecated: Google Drive is now the exclusive cloud sync engine
  },

  syncFromGist: async (_tokenOverride?: string, _gistIdOverride?: string) => {
    return true;
  },

  resolveGistConflict: async (resolution: 'local' | 'remote') => {
    const conflict = get().gistConflict;
    if (resolution === 'remote' && conflict?.remoteData) {
      get().importJSON(conflict.remoteData, { isRemoteSync: true });
    }
    set({ gistConflict: null });
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

  importJSON: (jsonString: string, options?: { isRemoteSync?: boolean }) => {
    try {
      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!parsed || typeof parsed !== 'object') {
        console.error('Invalid JSON payload');
        return false;
      }

      const isRemoteSync = Boolean(options?.isRemoteSync);
      const currentSnapshot = captureFinancialSnapshot(get());

      if (!isRemoteSync) {
        saveStorage(STORAGE_KEYS.importUndoBackup, currentSnapshot);
        recordUndoableStep(set, get, 'Data Import');
      }

      const migrated = migrateBackupPayload(parsed);

      const atomicPayload: BudgetFinancialSnapshot = {
        entries: migrated.entries,
        archivedEntries: migrated.archivedEntries,
        accounts: migrated.accounts,
        salaryPattern: migrated.salaryPattern,
        creditDues: migrated.creditDues,
        creditDueMonths: migrated.creditDueMonths,
        creditSettlementOverrides: migrated.creditSettlementOverrides,
        salaryAnchorMonth: migrated.salaryAnchorMonth,
        installments: migrated.installments,
        rates: migrated.rates,
        storageAssets: migrated.storageAssets,
        asfJobs: migrated.asfJobs,
        irqJobs: migrated.irqJobs,
        partTimeJobs: migrated.partTimeJobs,
        entryActuals: migrated.entryActuals,
        entryActualDates: migrated.entryActualDates,
        deletedForecasts: migrated.deletedForecasts,
      };
      persistFinancialSnapshot(atomicPayload);

      const prevSuppress = suppressAutoSync;
      if (isRemoteSync) {
        setSuppressAutoSync(true);
      }
      try {
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
          redoStack: [],
          undoToast: null,
          ...(isRemoteSync ? { hasUnsyncedChanges: false } : {}),
        });
      } finally {
        if (isRemoteSync) {
          setSuppressAutoSync(prevSuppress);
        }
      }

      if (!options?.isRemoteSync) {
        saveStorage(STORAGE_KEYS.hasUnsyncedChanges, true);
        set({ hasUnsyncedChanges: true });
        scheduleAutoDriveSync(get);
      }
      return true;
    } catch (e) {
      console.error('Failed to import JSON data:', e);
      return false;
    }
  },

  resetData: () => {
    return get().runTransaction('Reset Data', () => {
      const state = get();
      const backupPayload = {
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
      };
      saveStorage(STORAGE_KEYS.resetBackup, backupPayload);
      const emptyEntries: CashEntry[] = [];
      const emptyInstallments: Installment[] = [];
      const emptyStorage: StorageAsset[] = [];
      const emptyJobs: JobItem[] = [];
      const resetAccounts = structuredClone(defaultAccounts);
      const resetSalary = structuredClone(defaultSalaryPattern);
      const resetRates = structuredClone(defaultRates);
      const resetSnapshot: BudgetFinancialSnapshot = {
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
      };
      persistFinancialSnapshot(resetSnapshot);
      set(resetSnapshot);
      scheduleAutoDriveSync(get);
    });
  },

  restoreResetBackup: () => {
    // Check in-memory store / localStorage migration
    let backup = loadStorage<Record<string, unknown> | null>(STORAGE_KEYS.resetBackup, null);
    if (!backup && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEYS.resetBackup);
      if (raw) {
        try {
          backup = JSON.parse(raw) as Record<string, unknown>;
        } catch {}
      }
    }
    if (!backup) return false;
    try {
      const restored: BudgetFinancialSnapshot = {
        salaryPattern: (backup.salaryPattern as SalaryPayment[]) || defaultSalaryPattern,
        salaryAnchorMonth: (backup.salaryAnchorMonth as string) || DateUtils.currentYearMonth(),
        entries: (backup.cashEntries as CashEntry[]) || [],
        installments: (backup.installments as Installment[]) || [],
        storageAssets: (backup.storageAssets as StorageAsset[]) || [],
        accounts: withoutCashAccount((backup.accountBalances as Record<string, AccountBalance>) || defaultAccounts),
        asfJobs: (backup.asfJobs as JobItem[]) || [],
        irqJobs: (backup.irqJobs as JobItem[]) || [],
        partTimeJobs: (backup.partTimeJobs as JobItem[]) || [],
        rates: (backup.ratesData as RatesData) || defaultRates,
        creditDues: (backup.creditDues as Record<string, Record<string, number>>) || {},
        creditDueMonths: (backup.creditDueMonths as Record<string, string[]>) || {},
        entryActuals: (backup.entryActuals as Record<string, number>) || {},
        entryActualDates: (backup.entryActualDates as Record<string, string>) || {},
        deletedForecasts: (backup.deletedForecasts as string[]) || [],
        creditSettlementOverrides: (backup.creditSettlementOverrides as Record<string, CreditSettlementOverride>) || {},
        archivedEntries: (backup.archivedEntries as CashEntry[]) || [],
      };
      persistFinancialSnapshot(restored);
      void removeStorage(STORAGE_KEYS.resetBackup);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEYS.resetBackup);
        } catch {}
      }
      set(restored);
      scheduleAutoDriveSync(get);
      return true;
    } catch (error) {
      console.error('Failed to restore reset backup:', error);
      return false;
    }
  },

  undoImport: () => {
    let backup = loadStorage<Record<string, unknown> | null>(STORAGE_KEYS.importUndoBackup, null);
    if (!backup && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEYS.importUndoBackup);
      if (raw) {
        try {
          backup = JSON.parse(raw) as Record<string, unknown>;
        } catch {}
      }
    }
    if (!backup) return false;
    try {
      const restored: BudgetFinancialSnapshot = {
        salaryPattern: (backup.salaryPattern as SalaryPayment[]) || defaultSalaryPattern,
        salaryAnchorMonth: (backup.salaryAnchorMonth as string) || DateUtils.currentYearMonth(),
        entries: (backup.entries as CashEntry[]) || [],
        installments: (backup.installments as Installment[]) || [],
        storageAssets: (backup.storageAssets as StorageAsset[]) || [],
        accounts: withoutCashAccount((backup.accounts as Record<string, AccountBalance>) || defaultAccounts),
        asfJobs: (backup.asfJobs as JobItem[]) || [],
        irqJobs: (backup.irqJobs as JobItem[]) || [],
        partTimeJobs: (backup.partTimeJobs as JobItem[]) || [],
        rates: (backup.rates as RatesData) || defaultRates,
        creditDues: (backup.creditDues as Record<string, Record<string, number>>) || {},
        creditDueMonths: (backup.creditDueMonths as Record<string, string[]>) || {},
        entryActuals: (backup.entryActuals as Record<string, number>) || {},
        entryActualDates: (backup.entryActualDates as Record<string, string>) || {},
        deletedForecasts: (backup.deletedForecasts as string[]) || [],
        creditSettlementOverrides: (backup.creditSettlementOverrides as Record<string, CreditSettlementOverride>) || {},
        archivedEntries: (backup.archivedEntries as CashEntry[]) || [],
      };
      persistFinancialSnapshot(restored);
      void removeStorage(STORAGE_KEYS.importUndoBackup);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEYS.importUndoBackup);
        } catch {}
      }
      set(restored);
      scheduleAutoDriveSync(get);
      return true;
    } catch (err) {
      console.error('Failed to undo import:', err);
      return false;
    }
  },

  isStorageReady: false,
  initStorage: async () => {
    if (get().isStorageReady) return;
    if (initStoragePromise) return initStoragePromise;

    const promise = (async () => {
      try {
        await migrateFromLocalStorageIfNeeded(STORAGE_KEYS);
        const keysToLoad = Object.values(STORAGE_KEYS);
        const [storedData, undoData] = await Promise.all([
          loadAllFromIndexedDB(keysToLoad),
          restoreUndoHistoryFromStorage(),
        ]);

        const updates: Partial<BudgetStoreState> = { isStorageReady: true };

        if (storedData && Object.keys(storedData).length > 0) {
          if (storedData[STORAGE_KEYS.entries]) {
            updates.entries = upgradeLoadedEntries(storedData[STORAGE_KEYS.entries] as CashEntry[]);
          }
          if (storedData[STORAGE_KEYS.archivedEntries]) {
            updates.archivedEntries = upgradeLoadedEntries(storedData[STORAGE_KEYS.archivedEntries] as CashEntry[]);
          }
          if (storedData[STORAGE_KEYS.accounts]) {
            updates.accounts = withoutCashAccount(storedData[STORAGE_KEYS.accounts] as Record<string, AccountBalance>);
          }
          if (storedData[STORAGE_KEYS.salary]) {
            updates.salaryPattern = storedData[STORAGE_KEYS.salary] as SalaryPayment[];
          }
          if (storedData[STORAGE_KEYS.installments]) {
            updates.installments = storedData[STORAGE_KEYS.installments] as Installment[];
          }
          if (storedData[STORAGE_KEYS.rates]) {
            updates.rates = storedData[STORAGE_KEYS.rates] as RatesData;
          }
          if (storedData[STORAGE_KEYS.storage]) {
            updates.storageAssets = ((storedData[STORAGE_KEYS.storage] as StorageAsset[]) || []).map((asset) => {
              const loc = inferAssetLocation(asset);
              return {
                ...asset,
                locationType: asset.locationType || loc.locationType,
                location: asset.location || loc.location,
                locationLabel: asset.locationLabel || loc.locationLabel,
              };
            });
          }
          if (storedData[STORAGE_KEYS.asf]) {
            updates.asfJobs = storedData[STORAGE_KEYS.asf] as JobItem[];
          }
          if (storedData[STORAGE_KEYS.irq]) {
            updates.irqJobs = storedData[STORAGE_KEYS.irq] as JobItem[];
          }
          if (storedData[STORAGE_KEYS.partTimeJobs]) {
            updates.partTimeJobs = storedData[STORAGE_KEYS.partTimeJobs] as JobItem[];
          }
          if (storedData[STORAGE_KEYS.entryActuals]) {
            updates.entryActuals = storedData[STORAGE_KEYS.entryActuals] as Record<string, number>;
          }
          if (storedData[STORAGE_KEYS.entryActualDates]) {
            updates.entryActualDates = storedData[STORAGE_KEYS.entryActualDates] as Record<string, string>;
          }
          if (storedData[STORAGE_KEYS.creditDues]) {
            updates.creditDues = storedData[STORAGE_KEYS.creditDues] as Record<string, Record<string, number>>;
          }
          if (storedData[STORAGE_KEYS.creditDueMonths]) {
            updates.creditDueMonths = storedData[STORAGE_KEYS.creditDueMonths] as Record<string, string[]>;
          }
          if (storedData[STORAGE_KEYS.creditSettlementOverrides]) {
            updates.creditSettlementOverrides = storedData[STORAGE_KEYS.creditSettlementOverrides] as Record<string, CreditSettlementOverride>;
          }
          if (storedData[STORAGE_KEYS.salaryAnchor]) {
            updates.salaryAnchorMonth = storedData[STORAGE_KEYS.salaryAnchor] as string;
          }
          if (storedData[STORAGE_KEYS.deletedForecasts]) {
            updates.deletedForecasts = storedData[STORAGE_KEYS.deletedForecasts] as string[];
          }
          if (storedData[STORAGE_KEYS.theme]) {
            updates.theme = storedData[STORAGE_KEYS.theme] as 'dark' | 'light';
          }
          if (storedData[STORAGE_KEYS.sidebarCollapsed] !== undefined) {
            updates.sidebarCollapsed = Boolean(storedData[STORAGE_KEYS.sidebarCollapsed]);
          }
          if (storedData[STORAGE_KEYS.salaryCollapsed] !== undefined) {
            updates.salaryCollapsed = Boolean(storedData[STORAGE_KEYS.salaryCollapsed]);
          }
          if (storedData[STORAGE_KEYS.installmentsCollapsed] !== undefined) {
            updates.installmentsCollapsed = Boolean(storedData[STORAGE_KEYS.installmentsCollapsed]);
          }
          if (storedData[STORAGE_KEYS.expenseMixCollapsed] !== undefined) {
            updates.expenseMixCollapsed = Boolean(storedData[STORAGE_KEYS.expenseMixCollapsed]);
          }
          if (storedData[STORAGE_KEYS.historyAnalyticsCollapsed] !== undefined) {
            updates.historyAnalyticsCollapsed = Boolean(storedData[STORAGE_KEYS.historyAnalyticsCollapsed]);
          }
          if (storedData[STORAGE_KEYS.historyAdminUnlocked] !== undefined) {
            updates.historyAdminUnlocked = Boolean(storedData[STORAGE_KEYS.historyAdminUnlocked]);
          }
          if (storedData[STORAGE_KEYS.lastDriveSync]) {
            updates.lastDriveSyncTime = storedData[STORAGE_KEYS.lastDriveSync] as string;
          }
          if (storedData[STORAGE_KEYS.lastLocalModified]) {
            const mod = Number(storedData[STORAGE_KEYS.lastLocalModified]);
            if (!isNaN(mod) && mod > 0) {
              updates.lastLocalModified = mod;
              setLastLocalMutationTimestamp(mod);
            }
          }
        }

        if (undoData) {
          updates.undoStack = undoData.undoStack;
          updates.redoStack = undoData.redoStack;
        }

        // Verify Google Drive connection health on storage load
        // Do not mark 'expired' immediately; App.tsx will attempt silent token refresh first
        const storedUser = getStoredDriveUser();
        if (storedUser) {
          updates.driveUser = storedUser;
        }
        if (storedData[STORAGE_KEYS.gdriveAutoSync] !== undefined) {
          updates.driveAutoSync = Boolean(storedData[STORAGE_KEYS.gdriveAutoSync]);
        }
        if (storedData[STORAGE_KEYS.hasUnsyncedChanges] !== undefined) {
          updates.hasUnsyncedChanges = Boolean(storedData[STORAGE_KEYS.hasUnsyncedChanges]);
        }

        const prevSuppress = suppressAutoSync;
        setSuppressAutoSync(true);
        try {
          set(updates);
        } finally {
          setSuppressAutoSync(prevSuppress);
        }
      } catch (err) {
        console.warn('initStorage failed:', err);
        set({ isStorageReady: true });
      } finally {
        setInitStoragePromise(null);
      }
    })();

    setInitStoragePromise(promise);
    return promise;
  },
};
};
