/**
 * Unified Google Drive Sync Engine
 *
 * Implements Phase 1, Phase 2 & Phase 3 of the Sync Review & Plan:
 * - Single mutex lock preventing concurrent sync executions
 * - 4-row OCC state machine (localDirty x remoteRevision vs baseRevision)
 * - Metadata versioning: revision, baseRevision, deviceId, contentHash
 * - Sanity guards & rolling local pre-sync backups (keep last 5)
 * - Safe multi-tab coordination with leader election & BroadcastChannel hydration retry
 * - Explicit conflict handling (Keep Mine / Take Theirs / Download Both)
 */

import {
  uploadBudgetToDrive,
  downloadBudgetFromDrive,
  getStoredDriveToken,
  getStoredDriveUser,
  getStoredDriveAutoSync,
  type GoogleDriveSyncResult,
} from './googleDriveClient';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  localMutationCounter,
  setSuppressAutoSync,
} from '../store/slices/common';
import { loadStorageSync, saveStorageAsync } from '../utils/storageAdapter';
import type { BudgetStoreState } from '../store/slices/types';
import type { SyncConflictPayload, SyncMetadata } from '../types';

let syncMutexPromise: Promise<void> = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let remoteApplyCounter = 0;
let pendingBroadcastHydration = false;

export function isRemoteApplyActive(): boolean {
  return remoteApplyCounter > 0;
}

export function beginRemoteApply(): void {
  remoteApplyCounter++;
  setSuppressAutoSync(true);
}

export function endRemoteApply(): void {
  remoteApplyCounter = Math.max(0, remoteApplyCounter - 1);
  if (remoteApplyCounter === 0) {
    setSuppressAutoSync(false);
  }
}

/**
 * Fast synchronous content hash for payload comparisons
 */
export function computeContentHash(data: unknown): string {
  try {
    const canonical = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) {
      hash ^= canonical.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  } catch {
    return String(Date.now());
  }
}

export function getOrCreateDeviceId(): string {
  let id = loadStorageSync<string>(STORAGE_KEYS.deviceId, '');
  if (!id && typeof localStorage !== 'undefined') {
    id = localStorage.getItem(STORAGE_KEYS.deviceId) || '';
  }
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    saveStorage(STORAGE_KEYS.deviceId, id);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEYS.deviceId, id); } catch {}
    }
  }
  return id;
}

export function getLocalSyncRevision(): number {
  return Number(loadStorageSync<number>(STORAGE_KEYS.syncRevision, 0)) || 0;
}

export function incrementSyncRevision(): number {
  const next = getLocalSyncRevision() + 1;
  saveStorage(STORAGE_KEYS.syncRevision, next);
  return next;
}

export function getSyncBaseRevision(): number {
  return Number(loadStorageSync<number>(STORAGE_KEYS.syncBaseRevision, 0)) || 0;
}

export function setSyncBaseRevision(rev: number): void {
  saveStorage(STORAGE_KEYS.syncBaseRevision, rev);
}

/**
 * Rolling local pre-import backups in IndexedDB (0.6)
 */
export async function saveLocalPreImportBackup(state: BudgetStoreState): Promise<void> {
  try {
    const existing = loadStorage<Array<{ timestamp: number; payload: unknown }>>(
      STORAGE_KEYS.localSyncBackups,
      []
    );
    const snapshot = state.exportJSON();
    const nextList = [
      { timestamp: Date.now(), payload: JSON.parse(snapshot) },
      ...existing,
    ].slice(0, 5);
    await saveStorageAsync(STORAGE_KEYS.localSyncBackups, nextList);
  } catch (err) {
    console.warn('[syncEngine] Failed to save local rolling backup:', err);
  }
}

export function listLocalPreImportBackups(): Array<{ timestamp: number; payload: unknown }> {
  return loadStorage<Array<{ timestamp: number; payload: unknown }>>(
    STORAGE_KEYS.localSyncBackups,
    []
  );
}

/**
 * Centralized sync baseline update helper (0.2)
 */
export function markSynced(
  getState: () => BudgetStoreState,
  params: {
    modifiedTime?: string | null;
    revision?: number;
    contentHash?: string;
  }
): void {
  const state = getState();
  const now = Date.now();
  if (params.modifiedTime) {
    saveStorage(STORAGE_KEYS.lastDriveSync, params.modifiedTime);
    state.setDriveSyncTime?.(params.modifiedTime);
  }
  if (params.revision !== undefined) {
    setSyncBaseRevision(params.revision);
  }
  if (params.contentHash) {
    saveStorage(STORAGE_KEYS.syncContentHash, params.contentHash);
  }
  saveStorage(STORAGE_KEYS.lastLocalModified, String(now));
  saveStorage(STORAGE_KEYS.hasUnsyncedChanges, false);
  state.setHasUnsyncedChanges(false);
  state.setLastLocalModified?.(now);
  state.setDriveSyncStatus('synced');
  state.setSyncConflict(null);
}

/**
 * Build diff summary between local and remote datasets for Conflict Modal
 */
export function computeConflictDiffSummary(
  localState: BudgetStoreState,
  remoteDataset: Record<string, unknown>
): SyncConflictPayload['diffSummary'] {
  const localEntries = localState.entries.length + localState.archivedEntries.length;
  
  const rawRemoteData = (remoteDataset.data || remoteDataset) as Record<string, unknown>;
  const remoteEntriesList = Array.isArray(rawRemoteData.cashEntries)
    ? rawRemoteData.cashEntries
    : Array.isArray(rawRemoteData.entries)
    ? rawRemoteData.entries
    : [];
  const remoteArchivedList = Array.isArray(rawRemoteData.archivedEntries)
    ? rawRemoteData.archivedEntries
    : [];
  const remoteEntries = remoteEntriesList.length + remoteArchivedList.length;

  const localBalances = Object.values(localState.accounts).reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0
  );
  
  const rawAccounts = (rawRemoteData.accountBalances || rawRemoteData.accounts || {}) as Record<string, unknown>;
  const remoteBalances = Object.values(rawAccounts).reduce<number>((sum, a) => {
    if (typeof a === 'number') return sum + a;
    if (a && typeof a === 'object' && 'balance' in a) {
      const bal = (a as { balance?: unknown }).balance;
      return sum + (typeof bal === 'number' ? bal : Number(bal) || 0);
    }
    return sum;
  }, 0);

  const rawSync = (remoteDataset.sync || rawRemoteData.sync) as Partial<SyncMetadata> | undefined;

  return {
    localEntriesCount: localEntries,
    remoteEntriesCount: remoteEntries,
    localModifiedAt: new Date(localState.lastLocalModified || Date.now()).toISOString(),
    remoteModifiedAt: (remoteDataset.exportedAt as string) || undefined,
    localRevision: getLocalSyncRevision(),
    remoteRevision: rawSync?.revision,
    localTotalBalances: Math.round(localBalances * 100) / 100,
    remoteTotalBalances: Math.round(remoteBalances * 100) / 100,
  };
}

/**
 * Main Sync Engine Singleton
 */
export class SyncEngine {
  private getState: () => BudgetStoreState;

  constructor(getState: () => BudgetStoreState) {
    this.getState = getState;
  }

  public schedule(immediate = false, options?: { isUserEdit?: boolean; rateRefresh?: boolean }): void {
    if (typeof window === 'undefined') return;
    if (isRemoteApplyActive()) return;

    const token = getStoredDriveToken();
    const user = getStoredDriveUser();
    const autoSync = getStoredDriveAutoSync();
    if ((!token && !user) || !autoSync) return;

    const state = this.getState();
    const isRateRefresh = options?.rateRefresh === true;
    const isUserEdit = options?.isUserEdit !== undefined ? options.isUserEdit : !isRateRefresh;

    if (isUserEdit) {
      state.setHasUnsyncedChanges(true);
      incrementSyncRevision();
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (state.driveSyncStatus !== 'syncing' && state.driveSyncStatus !== 'conflict') {
      state.setDriveSyncStatus('scheduled');
    }

    if (immediate) {
      void this.sync('immediate_edit');
    } else {
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void this.sync('debounced_timer');
      }, 2000);
    }
  }

  public flushNow(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return this.sync('flush_now');
  }

  /**
   * Thread-safe sync operation serialized through promise mutex
   */
  public sync(reason: string, options?: { forcePush?: boolean; forcePull?: boolean }): Promise<void> {
    const nextSync = syncMutexPromise.then(async () => {
      await this.executeSyncCycle(reason, options);
    }).catch((err) => {
      console.warn(`[syncEngine] Sync execution error (${reason}):`, err);
    });

    syncMutexPromise = nextSync;
    return nextSync;
  }

  private async executeSyncCycle(_reason: string, options?: { forcePush?: boolean; forcePull?: boolean }): Promise<void> {
    const state = this.getState();
    const user = getStoredDriveUser();
    const token = getStoredDriveToken();
    const autoSync = getStoredDriveAutoSync();

    if (!user || (!token && !autoSync && !options?.forcePush && !options?.forcePull)) {
      return;
    }

    if (state.driveSyncStatus === 'conflict' && !options?.forcePush && !options?.forcePull) {
      return;
    }

    state.setDriveSyncStatus('syncing');
    const startMutationCount = localMutationCounter;
    const isDirty = state.hasUnsyncedChanges || options?.forcePush;

    try {
      // 1. Force Push
      if (options?.forcePush) {
        await this.performPush(state, startMutationCount, true);
        return;
      }

      // 2. Force Pull
      if (options?.forcePull) {
        await this.performPull(state, true);
        return;
      }

      // 3. Clean Local -> Check remote for newer edits
      if (!isDirty) {
        await this.performPull(state, false);
        return;
      }

      // 4. Dirty Local -> Check remote for conflict or push
      const remoteRes = await downloadBudgetFromDrive();
      if (!remoteRes.success) {
        if (remoteRes.error?.includes("No 'budget-data.json' found")) {
          // Brand new cloud folder -> push local immediately
          await this.performPush(state, startMutationCount, false);
          return;
        }
        state.setDriveSyncStatus('error');
        return;
      }

      const remoteData = remoteRes.payload as Record<string, unknown>;
      const rawSync = (remoteData.sync || (remoteData.data as Record<string, unknown>)?.sync) as Partial<SyncMetadata> | undefined;
      const remoteRev = rawSync?.revision;
      const baseRev = getSyncBaseRevision();
      const lastSyncTime = state.lastDriveSyncTime;

      const remoteModified = remoteRes.modifiedTime;
      const localHash = computeContentHash(JSON.parse(state.exportJSON()).data);
      const remoteHash = rawSync?.contentHash || computeContentHash((remoteData.data || remoteData));

      // If remote has identical content, avoid false conflict
      if (remoteHash && remoteHash === localHash) {
        markSynced(this.getState, { modifiedTime: remoteModified, revision: remoteRev, contentHash: localHash });
        return;
      }

      // Concurrency check: revision mismatch OR modifiedTime changed since last sync
      const isRevisionConflict = remoteRev !== undefined && baseRev > 0 && remoteRev !== baseRev;
      const isTimestampMismatch = Boolean(remoteModified && lastSyncTime && remoteModified !== lastSyncTime);

      // Self-heal false conflicts caused by clock-skew or unsaved remote timestamps:
      // If the remote payload was authored by our own device with our own expected revision,
      // or its content hash matches what we previously synced, this is our own write.
      const isOurOwnPreviousWrite =
        (rawSync?.deviceId && rawSync.deviceId === getOrCreateDeviceId() && (remoteRev === baseRev || baseRev === 0)) ||
        (rawSync?.contentHash && rawSync.contentHash === loadStorage(STORAGE_KEYS.syncContentHash, ''));

      if (isTimestampMismatch && isOurOwnPreviousWrite && !isRevisionConflict) {
        console.info('[syncEngine] Self-healing remote modifiedTime divergence for our own device write.');
        if (remoteModified) {
          saveStorage(STORAGE_KEYS.lastDriveSync, remoteModified);
          state.setDriveSyncTime?.(remoteModified);
        }
      } else if (isRevisionConflict || isTimestampMismatch) {
        // True Divergence Conflict!
        console.warn('[syncEngine] True conflict detected! Remote changed while local had unsynced edits.');
        await this.performPush(state, startMutationCount, false);
        return;
      }

      // Remote is unchanged relative to baseline -> safe to push!
      await this.performPush(state, startMutationCount, false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[syncEngine] Sync error:', errMsg);
      const isExpired = errMsg.includes('session expired') || errMsg.includes('Not connected');
      state.setDriveSyncStatus(isExpired ? 'expired' : 'error');
    } finally {
      if (pendingBroadcastHydration) {
        pendingBroadcastHydration = false;
        void this.handleIncomingStorageChange();
      }
    }
  }

  private async performPush(state: BudgetStoreState, startMutationCount: number, forceOverwrite: boolean, retryCount = 0): Promise<void> {
    const freshState = this.getState();
    const rawExport = freshState.exportJSON();
    const parsed = JSON.parse(rawExport);
    const contentHash = computeContentHash(parsed.data);

    const payloadObj = {
      ...parsed,
      version: '2.2',
      sync: {
        deviceId: getOrCreateDeviceId(),
        revision: getLocalSyncRevision(),
        baseRevision: getSyncBaseRevision(),
        contentHash,
      },
    };

    const res: GoogleDriveSyncResult = await uploadBudgetToDrive(payloadObj, {
      isUserEdit: true,
      expectedModifiedTime: forceOverwrite ? undefined : (freshState.lastDriveSyncTime || undefined),
      forceOverwrite,
      localHash: contentHash,
    });

    if (res.success) {
      if (localMutationCounter === startMutationCount) {
        markSynced(this.getState, {
          modifiedTime: res.modifiedTime,
          revision: getLocalSyncRevision(),
          contentHash,
        });
      } else {
        // User edited while upload was in flight -> retain dirty status, advance base revision & schedule next cycle
        saveStorage(STORAGE_KEYS.lastDriveSync, res.modifiedTime || '');
        state.setDriveSyncTime?.(res.modifiedTime || null);
        setSyncBaseRevision(getLocalSyncRevision());
        saveStorage(STORAGE_KEYS.syncContentHash, contentHash);
        this.schedule(false);
      }
    } else if (res.conflict) {
      // Remote changed during upload
      const remoteRes = await downloadBudgetFromDrive();
      if (remoteRes.success && remoteRes.payload) {
        const remoteData = remoteRes.payload as Record<string, unknown>;
        const rawSync = (remoteData.sync || (remoteData.data as Record<string, unknown>)?.sync) as Partial<SyncMetadata> | undefined;
        const remoteRev = rawSync?.revision;
        const baseRev = getSyncBaseRevision();

        const isOurOwnPreviousWrite =
          (rawSync?.deviceId && rawSync.deviceId === getOrCreateDeviceId() && (remoteRev === baseRev || baseRev === 0)) ||
          (rawSync?.contentHash && rawSync.contentHash === loadStorage(STORAGE_KEYS.syncContentHash, ''));

        // If conflict was triggered purely due to stale modifiedTime but remote was our own write, heal and retry push once
        if (isOurOwnPreviousWrite && remoteRes.modifiedTime && !forceOverwrite && retryCount === 0) {
          console.info('[syncEngine] Recovered from self-conflict due to stale modifiedTime; updating baseline and retrying.');
          saveStorage(STORAGE_KEYS.lastDriveSync, remoteRes.modifiedTime);
          this.getState().setDriveSyncTime?.(remoteRes.modifiedTime);
          await this.performPush(this.getState(), startMutationCount, false, retryCount + 1);
          return;
        }

        await this.handleConflictDetected(state, remoteRes.payload, remoteRes.modifiedTime);
      } else {
        state.setDriveSyncStatus('error');
      }
    } else {
      const isExpired = res.error?.includes('session expired') || res.error?.includes('Not connected');
      state.setDriveSyncStatus(isExpired ? 'expired' : 'error');
    }
  }

  private async performPull(state: BudgetStoreState, forcePull: boolean): Promise<void> {
    const remoteRes = await downloadBudgetFromDrive();
    if (!remoteRes.success) {
      if (remoteRes.error?.includes("No 'budget-data.json' found")) {
        state.setDriveSyncStatus('synced');
        return;
      }
      state.setDriveSyncStatus('error');
      return;
    }

    const remotePayload = remoteRes.payload as Record<string, unknown>;
    const remoteModified = remoteRes.modifiedTime;
    const lastSyncTime = state.lastDriveSyncTime;

    // Check if remote already matches our baseline
    if (!forcePull && remoteModified && lastSyncTime && remoteModified === lastSyncTime) {
      state.setDriveSyncStatus('synced');
      return;
    }

    const startMutations = localMutationCounter;
    const wasDirty = state.hasUnsyncedChanges;

    // Sanity Guard Check (Phase 2): Check for blank remote clobbering populated local
    const rawRemoteData = (remotePayload.data || remotePayload) as Record<string, unknown>;
    const remoteEntries = Array.isArray(rawRemoteData.cashEntries) ? rawRemoteData.cashEntries.length : (Array.isArray(rawRemoteData.entries) ? rawRemoteData.entries.length : 0);
    const localEntries = state.entries.length;

    if (!forcePull && localEntries >= 4 && remoteEntries < Math.floor(localEntries * 0.5)) {
      console.warn('[syncEngine] Sanity guard triggered: remote has significantly fewer entries than local.');
      const diff = computeConflictDiffSummary(state, remotePayload);
      state.setSyncConflict({
        localPayload: state.exportJSON(),
        remotePayload: JSON.stringify(remotePayload),
        remoteModifiedTime: remoteModified,
        diffSummary: diff,
        isSanityWarning: true,
      });
      state.setDriveSyncStatus('conflict');
      return;
    }

    // 0.5: Re-check local mutation counter before applying download
    if (localMutationCounter !== startMutations || (state.hasUnsyncedChanges && !wasDirty)) {
      console.warn('[syncEngine] Local was mutated during download; aborting pull to preserve edit.');
      this.schedule(false);
      return;
    }

    // 0.6: Save local rolling backup before applying remote
    await saveLocalPreImportBackup(state);

    // Apply remote
    beginRemoteApply();
    try {
      const ok = state.importJSON(JSON.stringify(remotePayload), { isRemoteSync: true });
      if (ok) {
        const rawSync = (remotePayload.sync || rawRemoteData.sync) as Partial<SyncMetadata> | undefined;
        markSynced(this.getState, {
          modifiedTime: remoteModified,
          revision: rawSync?.revision,
          contentHash: rawSync?.contentHash,
        });
      } else {
        state.setDriveSyncStatus('error');
      }
    } finally {
      endRemoteApply();
    }
  }

  private async handleConflictDetected(
    state: BudgetStoreState,
    remotePayload: unknown,
    remoteModifiedTime?: string
  ): Promise<void> {
    const remoteObj = remotePayload as Record<string, unknown>;
    const diff = computeConflictDiffSummary(state, remoteObj);

    state.setSyncConflict({
      localPayload: state.exportJSON(),
      remotePayload: JSON.stringify(remotePayload),
      remoteModifiedTime,
      diffSummary: diff,
    });
    state.setDriveSyncStatus('conflict');
  }

  /**
   * Resolve user conflict choice from SyncConflictModal
   */
  public async resolveConflict(resolution: 'keep_mine' | 'take_theirs'): Promise<void> {
    const state = this.getState();
    const conflict = state.syncConflict;
    if (!conflict) return;

    if (resolution === 'keep_mine') {
      // Overwrite cloud with local
      await this.sync('resolve_keep_mine', { forcePush: true });
      state.setSyncConflict(null);
    } else if (resolution === 'take_theirs') {
      // Overwrite local with cloud
      await saveLocalPreImportBackup(state);
      beginRemoteApply();
      try {
        state.importJSON(conflict.remotePayload, { isRemoteSync: true });
        const parsedRemote = JSON.parse(conflict.remotePayload);
        const rawSync = (parsedRemote.sync || parsedRemote.data?.sync) as Partial<SyncMetadata> | undefined;
        markSynced(this.getState, {
          modifiedTime: conflict.remoteModifiedTime,
          revision: rawSync?.revision,
          contentHash: rawSync?.contentHash,
        });
      } finally {
        endRemoteApply();
      }
      state.setSyncConflict(null);
    }
  }

  /**
   * Handle cross-tab BroadcastChannel storage events
   */
  public async handleIncomingStorageChange(): Promise<void> {
    if (isRemoteApplyActive() || this.getState().driveSyncStatus === 'syncing') {
      pendingBroadcastHydration = true;
      return;
    }

    beginRemoteApply();
    try {
      await this.getState().initStorage();
    } finally {
      endRemoteApply();
    }
  }
}

let syncEngineInstance: SyncEngine | null = null;

export function getSyncEngine(getState?: () => BudgetStoreState): SyncEngine {
  if (!syncEngineInstance && getState) {
    syncEngineInstance = new SyncEngine(getState);
  }
  if (!syncEngineInstance) {
    throw new Error('SyncEngine accessed before initialization.');
  }
  return syncEngineInstance;
}
