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
  saveStorage,
  safeSetItem,
  scheduleAutoGistSync,
  upgradeLoadedEntries,
  withoutCashAccount,
  defaultAccounts,
  defaultSalaryPattern,
  captureFinancialSnapshot,
  persistFinancialSnapshot,
  recordUndoableStep,
  lastLocalMutationTimestamp,
  setLastLocalMutationTimestamp,
  lastGistUploadTimestamp,
  setLastGistUploadTimestamp,
  setSuppressAutoSync,
  initStoragePromise,
  setInitStoragePromise,
} from './common';
import type { SliceCreator, SyncSlice, BudgetStoreState } from './types';

let gistSyncInFlight = false;

export const createSyncSlice: SliceCreator<SyncSlice> = (set, get) => ({
  driveUser: getStoredDriveUser(),
  driveAutoSync: getStoredDriveAutoSync(),
  driveSyncStatus: 'idle',
  lastDriveSyncTime: null,
  lastLocalModified: lastLocalMutationTimestamp,

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

  setDriveSyncStatus: (status: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'error') =>
    set({ driveSyncStatus: status, gistSyncStatus: status }),

  gistToken: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.gistToken) || '' : '',
  gistId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.gistId) || '' : '',
  gistAutoSync: typeof localStorage !== 'undefined'
    ? (localStorage.getItem(STORAGE_KEYS.gistAutoSync) === null ? true : localStorage.getItem(STORAGE_KEYS.gistAutoSync) === 'true')
    : true,
  gistSyncStatus: 'idle',
  gistConflict: null,

  setGistConfig: (token: string, gistId: string, autoSync: boolean) => {
    safeSetItem(STORAGE_KEYS.gistToken, token);
    safeSetItem(STORAGE_KEYS.gistId, gistId);
    safeSetItem(STORAGE_KEYS.gistAutoSync, String(autoSync));
    set({ gistToken: token, gistId, gistAutoSync: autoSync, gistSyncStatus: 'idle' });
  },

  syncFromGist: async (tokenOverride?: string, gistIdOverride?: string) => {
    const state = get();
    const token = tokenOverride?.trim() || state.gistToken;
    const gistId = gistIdOverride?.trim() || state.gistId;
    if (!gistId) {
      set({ gistSyncStatus: 'error' });
      return false;
    }

    if (gistSyncInFlight) {
      return false;
    }
    gistSyncInFlight = true;
    try {
      set({ gistSyncStatus: 'syncing' });
      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
        if (!response.ok) {
          throw new Error(`Gist download failed: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as {
          files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
        };
        const file =
          data.files?.['budget-data.json'] ||
          data.files?.['budget-control-backup.json'] ||
          Object.values(data.files || {})[0];

        if (!file) {
          throw new Error('No budget JSON file found in this Gist');
        }

        let content = file.content;
        if ((file.truncated || !content) && file.raw_url) {
          const rawRes = await fetch(file.raw_url, { headers });
          if (rawRes.ok) {
            content = await rawRes.text();
          }
        }

        if (!content) {
          throw new Error('No valid budget JSON content could be restored from this Gist');
        }

        let parsedRemote: Record<string, unknown> | null = null;
        try {
          parsedRemote = JSON.parse(content) as Record<string, unknown>;
        } catch {
          // ignore
        }

        const remoteData =
          parsedRemote?.data && typeof parsedRemote.data === 'object'
            ? (parsedRemote.data as Record<string, unknown>)
            : null;
        const remoteExportedAt =
          (typeof parsedRemote?.exportedAt === 'string' ? parsedRemote.exportedAt : undefined) ||
          (typeof remoteData?.exportedAt === 'string' ? remoteData.exportedAt : undefined);
        const remoteTime = remoteExportedAt ? new Date(remoteExportedAt).getTime() : 0;

        const baselineTime = Math.max(lastGistUploadTimestamp, lastLocalMutationTimestamp);
        const remoteIsNewerThanLocal = remoteTime > 0 && remoteTime > baselineTime + 1000;
        const localHasUnuploadedChanges =
          lastLocalMutationTimestamp > 0 && lastLocalMutationTimestamp > lastGistUploadTimestamp;

        const currentLocalExport = get().exportJSON();
        let isActuallyDifferent = true;
        try {
          const parsedLocal = JSON.parse(currentLocalExport);
          isActuallyDifferent =
            JSON.stringify(parsedRemote?.data || parsedRemote) !== JSON.stringify(parsedLocal?.data || parsedLocal);
        } catch {
          isActuallyDifferent = content.trim() !== currentLocalExport.trim();
        }

        if (!isActuallyDifferent && !localHasUnuploadedChanges) {
          const newSyncTimestamp = remoteTime > 0 ? remoteTime : lastGistUploadTimestamp || Date.now();
          setLastGistUploadTimestamp(newSyncTimestamp);
          safeSetItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
          setLastLocalMutationTimestamp(0);
          set({ gistSyncStatus: 'synced', gistConflict: null });
          return true;
        }

        if (remoteIsNewerThanLocal && localHasUnuploadedChanges && isActuallyDifferent) {
          set({
            gistConflict: {
              remoteTime: remoteExportedAt,
              remoteData: content,
            },
            gistSyncStatus: 'idle',
          });
          return false;
        }

        if (localHasUnuploadedChanges && !remoteIsNewerThanLocal) {
          scheduleAutoGistSync(get, true);
          return true;
        }

        setSuppressAutoSync(true);
        let importSuccess = false;
        try {
          importSuccess = get().importJSON(content, { isRemoteSync: true });
        } finally {
          setSuppressAutoSync(false);
        }

        if (!importSuccess) {
          throw new Error('No valid budget JSON content could be restored from this Gist');
        }
        const newSyncTimestamp = remoteTime > 0 ? remoteTime : Date.now();
        setLastGistUploadTimestamp(newSyncTimestamp);
        safeSetItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
        safeSetItem(STORAGE_KEYS.lastGistSync, String(lastGistUploadTimestamp));
        setLastLocalMutationTimestamp(0);
        safeSetItem(STORAGE_KEYS.lastLocalModified, '0');
        set({ gistSyncStatus: 'synced', gistConflict: null });
        return true;
      } catch (error) {
        console.error('Gist download failed:', error);
        set({ gistSyncStatus: 'error' });
        return false;
      }
    } finally {
      gistSyncInFlight = false;
    }
  },

  resolveGistConflict: async (resolution: 'local' | 'remote') => {
    const conflict = get().gistConflict;
    if (resolution === 'local') {
      set({ gistConflict: null });
      scheduleAutoGistSync(get, true);
    } else if (resolution === 'remote' && conflict?.remoteData) {
      setSuppressAutoSync(true);
      let importSuccess = false;
      try {
        importSuccess = get().importJSON(conflict.remoteData, { isRemoteSync: true });
      } finally {
        setSuppressAutoSync(false);
      }
      if (!importSuccess) {
        set({ gistSyncStatus: 'error' });
        return;
      }
      setLastGistUploadTimestamp(Date.now());
      safeSetItem(STORAGE_KEYS.lastGistUpload, String(lastGistUploadTimestamp));
      safeSetItem(STORAGE_KEYS.lastGistSync, String(lastGistUploadTimestamp));
      safeSetItem(STORAGE_KEYS.lastLocalModified, '0');
      setLastLocalMutationTimestamp(0);
      set({ gistConflict: null, gistSyncStatus: 'synced' });
    } else {
      set({ gistConflict: null });
    }
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
      });

      if (!options?.isRemoteSync) {
        scheduleAutoGistSync(get);
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
      scheduleAutoGistSync(get);
    });
  },

  restoreResetBackup: () => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.resetBackup) : null;
    if (!raw) return false;
    try {
      const backup = JSON.parse(raw);
      const restored: BudgetFinancialSnapshot = {
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
      persistFinancialSnapshot(restored);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.resetBackup);
      }
      set(restored);
      scheduleAutoGistSync(get);
      return true;
    } catch (error) {
      console.error('Failed to restore reset backup:', error);
      return false;
    }
  },

  undoImport: () => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.importUndoBackup) : null;
    if (!raw) return false;
    try {
      const backup = JSON.parse(raw);
      const restored: BudgetFinancialSnapshot = {
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
      persistFinancialSnapshot(restored);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.importUndoBackup);
      }
      set(restored);
      scheduleAutoGistSync(get);
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
          if (storedData[STORAGE_KEYS.lastDriveSync]) {
            updates.lastDriveSyncTime = storedData[STORAGE_KEYS.lastDriveSync] as string;
          } else if (storedData[STORAGE_KEYS.lastGistSync]) {
            updates.lastDriveSyncTime = storedData[STORAGE_KEYS.lastGistSync] as string;
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

        set(updates);
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
});
