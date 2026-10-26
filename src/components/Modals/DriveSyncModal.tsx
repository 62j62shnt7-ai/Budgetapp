import React, { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { requestAppConfirm } from '../Common/UndoToast';
import {
  Cloud,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Folder,
  Calendar,
  Clock,
  Save,
  Check,
  ArrowUp,
  ArrowDown,
  Archive,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  getStoredDriveUser,
  getStoredDriveAutoSync,
  saveStoredDriveAutoSync,
  getStoredDriveDailySnapshotsEnabled,
  saveStoredDriveDailySnapshotsEnabled,
  getStoredDriveBackupRetentionLimit,
  saveStoredDriveBackupRetentionLimit,
  isDriveTokenValid,
  pruneOldBackups,
  getOrCreateDailyBackupsFolder,
  signInWithGoogleDrive,
  signOutFromGoogleDrive,
  preWarmGisTokenClient,
  downloadBudgetFromDrive,
  createUserSnapshot,
  listDailyBackups,
  listEditSnapshots,
  listUserSnapshots,
  clearDailyBackups,
  clearEditSnapshots,
  clearUserSnapshots,
  downloadBackupFile,
  deleteDriveBackupFile,
  getLiveDriveMetadata,
  getGoogleDriveStorageQuota,
  MAX_EDIT_SNAPSHOTS_CAP,
  getStoredDriveRefreshToken,
  saveStoredDriveRefreshToken,
  getStoredDriveAuthProxyUrl,
  saveStoredDriveAuthProxyUrl,
  type GoogleDriveUser,
  type DriveBackupItem,
  type DriveLiveMetadata,
  type GoogleDriveStorageQuota,
} from '../../services/googleDriveClient';
import { getSyncEngine } from '../../services/syncEngine';

interface DriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const DriveSyncModal: React.FC<DriveSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    exportJSON,
    importJSON,
    runTransaction,
    entriesCount,
    accountsCount,
  } = useBudgetStore(
    useShallow((state) => ({
      exportJSON: state.exportJSON,
      importJSON: state.importJSON,
      runTransaction: state.runTransaction,
      entriesCount: state.entries.length + state.archivedEntries.length,
      accountsCount: Object.keys(state.accounts).length,
    }))
  );

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingBackups, setIsRefreshingBackups] = useState(false);

  // Google Drive states
  const [driveUser, setDriveUser] = useState<GoogleDriveUser | null>(getStoredDriveUser);
  const [driveAutoSync, setDriveAutoSync] = useState(getStoredDriveAutoSync);
  const [dailySnapshotsEnabled, setDailySnapshotsEnabled] = useState(getStoredDriveDailySnapshotsEnabled);
  const [retentionLimit, setRetentionLimit] = useState(getStoredDriveBackupRetentionLimit);
  const [liveMetadata, setLiveMetadata] = useState<DriveLiveMetadata | null>(null);
  const [storageQuota, setStorageQuota] = useState<GoogleDriveStorageQuota | null>(null);
  const [authProxyUrlInput, setAuthProxyUrlInput] = useState(getStoredDriveAuthProxyUrl);
  const [refreshTokenInput, setRefreshTokenInput] = useState(getStoredDriveRefreshToken() || '');
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false);

  // 3 Separated Snapshot Tiers
  const [dailyBackups, setDailyBackups] = useState<DriveBackupItem[]>([]);
  const [editSnapshots, setEditSnapshots] = useState<DriveBackupItem[]>([]);
  const [userSnapshots, setUserSnapshots] = useState<DriveBackupItem[]>([]);
  const [activeSnapshotTab, setActiveSnapshotTab] = useState<'daily' | 'edits' | 'user'>('daily');
  const [showSnapshotsSection, setShowSnapshotsSection] = useState(true);

  const showMsg = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
  };

  const fetchCloudDetails = useCallback(async () => {
    if (!getStoredDriveUser()) return;
    setIsRefreshingBackups(true);
    try {
      const [meta, daily, edits, user, quota] = await Promise.all([
        getLiveDriveMetadata(),
        listDailyBackups(),
        listEditSnapshots(),
        listUserSnapshots(),
        getGoogleDriveStorageQuota(),
      ]);
      setLiveMetadata(meta);
      setDailyBackups(daily);
      setEditSnapshots(edits);
      setUserSnapshots(user);
      setStorageQuota(quota);
    } catch (err) {
      console.warn('Failed to fetch cloud details:', err);
    } finally {
      setIsRefreshingBackups(false);
    }
  }, []);

  const [prevOpen, setPrevOpen] = useState(false);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setDriveUser(getStoredDriveUser());
      setDriveAutoSync(getStoredDriveAutoSync());
      setDailySnapshotsEnabled(getStoredDriveDailySnapshotsEnabled());
      setRetentionLimit(getStoredDriveBackupRetentionLimit());
      setStatusMessage(null);
    }
  }

  // Pre-warm GIS client and fetch remote details when modal opens
  useEffect(() => {
    if (!isOpen) return;
    // Eagerly pre-load GIS client in background so user click can trigger requestAccessToken synchronously
    void preWarmGisTokenClient().catch(() => {});
    const timer = setTimeout(() => {
      void fetchCloudDetails();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, fetchCloudDetails]);

  if (!isOpen) return null;

  // Google Drive Handlers
  const handleDriveSignIn = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    const { user, error } = await signInWithGoogleDrive();
    if (error) {
      setIsLoading(false);
      showMsg(error.message, true);
    } else if (user) {
      setDriveUser(user);
      useBudgetStore.getState().setDriveUser(user);
      useBudgetStore.getState().setDriveSyncStatus('synced');
      
      // Auto-reconciliation choice matrix on sign-in (Phase 0.4)
      try {
        const pullRes = await downloadBudgetFromDrive();
        const state = useBudgetStore.getState();
        const hasLocalData = state.entries.length > 0 || state.archivedEntries.length > 0;
        const hasUnsynced = state.hasUnsyncedChanges;

        if (pullRes.success && pullRes.payload) {
          if (hasUnsynced || hasLocalData) {
            // Prompt user: Keep Mine or Take Theirs via conflict modal
            await getSyncEngine().sync('first_signin_detected');
            showMsg(`✓ Connected as ${user.name}! Cloud budget detected — review choices.`);
          } else {
            // Local is fresh/empty -> auto-import remote
            importJSON(JSON.stringify(pullRes.payload), { isRemoteSync: true });
            showMsg(`✓ Connected as ${user.name}! Restored latest budget from Google Drive.`);
          }
        } else {
          // No remote file found yet -> push local if populated
          if (hasLocalData) {
            await getSyncEngine().sync('first_signin_push', { forcePush: true });
          }
          showMsg(`✓ Connected as ${user.name} (${user.email})! Ready to sync.`);
        }
      } catch {
        showMsg(`✓ Connected as ${user.name} (${user.email})!`);
      } finally {
        setIsLoading(false);
        void fetchCloudDetails();
      }
    }
  };

  const handleDriveSignOut = () => {
    signOutFromGoogleDrive();
    setDriveUser(null);
    useBudgetStore.getState().setDriveUser(null);
    useBudgetStore.getState().setDriveSyncStatus('idle');
    setLiveMetadata(null);
    setDailyBackups([]);
    setEditSnapshots([]);
    setUserSnapshots([]);
    setStorageQuota(null);
    showMsg('✓ Disconnected from Google Drive.');
  };

  const handleDrivePush = async () => {
    setIsLoading(true);
    try {
      await getSyncEngine().sync('manual_push', { forcePush: true });
      showMsg(`✓ Saved live budget to Google Drive! (${new Date().toLocaleTimeString()})`);
      void fetchCloudDetails();
    } catch (err) {
      showMsg(`Upload error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrivePull = async () => {
    setIsLoading(true);
    try {
      await getSyncEngine().sync('manual_pull', { forcePull: true });
      showMsg(`✓ Pulled latest budget ledger from your Google Drive! (${new Date().toLocaleTimeString()})`);
      void fetchCloudDetails();
    } catch (err) {
      showMsg(`Restore error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUserSnapshot = async () => {
    setIsLoading(true);
    try {
      const payload = JSON.parse(exportJSON());
      const res = await createUserSnapshot(payload);
      if (res.success) {
        showMsg(`✓ Created manual snapshot in 'User Snapshots': ${res.name || 'snapshot'}!`);
        setActiveSnapshotTab('user');
        void fetchCloudDetails();
      } else {
        showMsg(`Snapshot failed: ${res.error || 'Unknown error'}`, true);
      }
    } catch (err) {
      showMsg(`Snapshot error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreBackup = async (item: DriveBackupItem) => {
    const confirmed = await requestAppConfirm({
      title: 'Restore Cloud Backup',
      message: `Restore cloud backup '${item.name}' from ${new Date(item.modifiedTime).toLocaleString()}? Your current data will be safely backed up to undo history.`,
      confirmLabel: 'Restore Backup',
      tone: 'warning',
    });
    if (!confirmed) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await downloadBackupFile(item.id);
      if (!res.success || !res.payload) {
        showMsg(`Failed to download backup: ${res.error || 'Unknown error'}`, true);
        return;
      }
      const success = runTransaction(`Restore backup: ${item.name}`, () => {
        return importJSON(JSON.stringify(res.payload), { isRemoteSync: true });
      });
      if (success) {
        showMsg(`✓ Successfully restored backup from ${new Date(item.modifiedTime).toLocaleDateString()}!`);
      } else {
        showMsg('Failed to apply backup payload.', true);
      }
    } catch (err) {
      showMsg(`Restore error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteIndividualBackup = async (item: DriveBackupItem) => {
    const confirmed = await requestAppConfirm({
      title: 'Delete Cloud Backup',
      message: `Permanently delete backup '${item.name}' from Google Drive?`,
      confirmLabel: 'Delete Permanently',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    setIsLoading(true);
    try {
      const ok = await deleteDriveBackupFile(item.id);
      if (ok) {
        showMsg(`✓ Deleted file '${item.name}'.`);
        void fetchCloudDetails();
      } else {
        showMsg('Failed to delete file.', true);
      }
    } catch (err) {
      showMsg(`Delete error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearDaily = async () => {
    const confirmed = await requestAppConfirm({
      title: 'Clear Daily Backups',
      message: `Permanently delete all ${dailyBackups.length} daily backup files from 'Daily Backups/'? Your active ledger and other snapshots will remain intact.`,
      confirmLabel: 'Clear Daily Backups',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    setIsLoading(true);
    try {
      const count = await clearDailyBackups();
      showMsg(`✓ Cleared ${count} daily backups.`);
      void fetchCloudDetails();
    } catch (err) {
      showMsg(`Clear error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearEdits = async () => {
    const confirmed = await requestAppConfirm({
      title: 'Clear Edit Snapshots',
      message: `Permanently delete all ${editSnapshots.length} rolling edit snapshots from 'Edit Snapshots/'? Your active ledger will remain intact.`,
      confirmLabel: 'Clear Snapshots',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    setIsLoading(true);
    try {
      const count = await clearEditSnapshots();
      showMsg(`✓ Cleared ${count} edit snapshots.`);
      void fetchCloudDetails();
    } catch (err) {
      showMsg(`Clear error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearUser = async () => {
    const confirmed = await requestAppConfirm({
      title: 'Clear User Milestones',
      message: `Permanently delete all ${userSnapshots.length} user milestones from 'User Snapshots/'?`,
      confirmLabel: 'Clear Milestones',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    setIsLoading(true);
    try {
      const count = await clearUserSnapshots();
      showMsg(`✓ Cleared ${count} user milestones.`);
      void fetchCloudDetails();
    } catch (err) {
      showMsg(`Clear error: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDriveAutoSyncChange = (enabled: boolean) => {
    setDriveAutoSync(enabled);
    saveStoredDriveAutoSync(enabled);
    useBudgetStore.getState().setDriveAutoSync(enabled);
    showMsg(`Autonomous Google Drive auto-sync is now ${enabled ? 'enabled' : 'disabled'}.`);
  };

  const handleDailySnapshotsToggle = (enabled: boolean) => {
    setDailySnapshotsEnabled(enabled);
    saveStoredDriveDailySnapshotsEnabled(enabled);
    showMsg(`Daily cloud backups are now ${enabled ? `enabled (capped at ${retentionLimit} days)` : 'disabled'}.`);
  };

  const handleRetentionLimitChange = async (newLimit: number) => {
    saveStoredDriveBackupRetentionLimit(newLimit);
    setRetentionLimit(newLimit);
    showMsg(`✓ Daily retention limit set to ${newLimit} days.`);
    if (liveMetadata?.folderId) {
      try {
        const dailyFolderId = await getOrCreateDailyBackupsFolder(liveMetadata.folderId);
        const pruned = await pruneOldBackups(dailyFolderId, newLimit);
        if (pruned > 0) {
          showMsg(`✓ Pruned ${pruned} older backup(s) to match ${newLimit}-day limit.`);
        }
        void fetchCloudDetails();
      } catch (err) {
        console.warn('Prune on retention change error:', err);
      }
    }
  };

  // Aggregated storage calculation
  const dailyTotalBytes = dailyBackups.reduce((sum, b) => sum + (b.size || 0), 0);
  const editTotalBytes = editSnapshots.reduce((sum, b) => sum + (b.size || 0), 0);
  const userTotalBytes = userSnapshots.reduce((sum, b) => sum + (b.size || 0), 0);
  const totalBudgetBytes = (liveMetadata?.size || 0) + dailyTotalBytes + editTotalBytes + userTotalBytes;

  const currentTabList =
    activeSnapshotTab === 'daily'
      ? dailyBackups
      : activeSnapshotTab === 'edits'
      ? editSnapshots
      : userSnapshots;

  return (
    <dialog
      open
      className="native-dialog gist-sync-dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ display: 'block', zIndex: 1000, maxWidth: '720px', width: 'min(720px, 94vw)' }}
    >
      <div className="dialog-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cloud size={18} style={{ color: 'var(--blue, #3b82f6)' }} />
          <h3 style={{ margin: 0, fontSize: '16px' }}>Google Drive Cloud Sync</h3>
        </div>
        <button className="icon-button close-dialog-btn" type="button" aria-label="Close dialog" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {statusMessage && (
        <div className={`gist-sync-message ${statusMessage.isError ? 'is-error' : ''}`} role="status" aria-live="polite" style={{ margin: '12px 0' }}>
          <span>{statusMessage.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setStatusMessage(null)}>×</button>
        </div>
      )}

      <div className="gist-sync-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
        {driveUser ? (
          <>
            {/* User Account & Status Card */}
            <div style={{ padding: '12px 14px', background: 'var(--card-bg, rgba(255,255,255,0.03))', borderRadius: '10px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 200px' }}>
                  {driveUser.picture ? (
                    <img src={driveUser.picture} alt="Avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                      {(driveUser.name || driveUser.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driveUser.name || 'Google User'}</div>
                    <div style={{ fontSize: '11px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driveUser.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {isDriveTokenValid() ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--green, #22c55e)', fontWeight: 600 }}>
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleDriveSignIn}
                      disabled={isLoading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', borderColor: '#eab308', fontWeight: 600, cursor: 'pointer' }}
                      title="Session expired. Click to re-authorize Google Drive"
                    >
                      <AlertTriangle size={12} /> Reconnect
                    </button>
                  )}
                  <button className="ghost-button" type="button" onClick={handleDriveSignOut} disabled={isLoading} style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--red, #ef4444)' }}>
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Privacy Shield */}
              <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <Lock size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--kpi-cyan, #38bdf8)' }} />
                <span>
                  <strong>Privacy Sandboxed:</strong> Budget Control uses the strict <code>drive.file</code> scope. It can only access files it created inside this folder. It has zero access to your photos, personal docs, or other Drive folders.
                </span>
              </div>
            </div>

            {/* Folder Location & Telemetry Breakdown Card */}
            <div style={{ padding: '12px 14px', background: 'var(--card-bg, rgba(255,255,255,0.03))', borderRadius: '10px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}>
                  <Folder size={13} style={{ color: 'var(--brand-primary, #6366f1)' }} />
                  <span>Google Drive Location</span>
                </div>
                {liveMetadata?.folderUrl && (
                  <a
                    href={liveMetadata.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: 'var(--accent, #6366f1)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
                  >
                    Open in Google Drive ↗
                  </a>
                )}
              </div>

              <div style={{ fontSize: '12px', fontFamily: 'monospace', opacity: 0.85, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '10px', wordBreak: 'break-all' }}>
                My Drive / Budget Control / budget-data.json
              </div>

              {/* Storage Telemetry Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                  <div style={{ fontSize: '10px', opacity: 0.6 }}>Live File Size</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                    {formatBytes(liveMetadata?.size)}
                  </div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                  <div style={{ fontSize: '10px', opacity: 0.6 }}>Last Synced</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                    {liveMetadata?.modifiedTime ? new Date(liveMetadata.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                  <div style={{ fontSize: '10px', opacity: 0.6 }}>Local Ledger</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                    {entriesCount} entries · {accountsCount} accs
                  </div>
                </div>
              </div>

              {/* 3-Tier Storage Usage Breakdown */}
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '11px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.85 }}>
                    <Calendar size={11} />
                    <span>Daily: <strong>{dailyBackups.length}</strong> ({formatBytes(dailyTotalBytes)})</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.85 }}>
                    <Clock size={11} />
                    <span>Edits: <strong>{editSnapshots.length}</strong> ({formatBytes(editTotalBytes)})</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.85 }}>
                    <Save size={11} />
                    <span>User: <strong>{userSnapshots.length}</strong> ({formatBytes(userTotalBytes)})</span>
                  </div>
                </div>
              </div>

              {/* Google Drive Storage Quota Meter */}
              {storageQuota ? (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.7 }}>Google Drive Quota</span>
                    <span style={{ fontWeight: 600 }}>
                      {storageQuota.limit
                        ? `${formatBytes(storageQuota.usage)} / ${formatBytes(storageQuota.limit)} (${Math.round(((storageQuota.usage || 0) / storageQuota.limit) * 100)}%)`
                        : `${formatBytes(storageQuota.usage)} / Unlimited`}
                    </span>
                  </div>
                  {storageQuota.limit ? (
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.round(((storageQuota.usage || 0) / storageQuota.limit) * 100))}%`,
                          height: '100%',
                          background: 'var(--accent, #6366f1)',
                        }}
                      />
                    </div>
                  ) : null}
                  <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total App Storage: ~{formatBytes(totalBudgetBytes)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--green, #22c55e)' }}>
                      <Check size={10} /> Auto-pruned &lt; 1 MB
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Sync Actions & Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button className="primary-button" type="button" onClick={handleDrivePush} disabled={isLoading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px', fontSize: '12px' }}>
                  <ArrowUp size={13} /> Push Live
                </button>
                <button className="ghost-button" type="button" onClick={handleDrivePull} disabled={isLoading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px', fontSize: '12px' }}>
                  <ArrowDown size={13} /> Pull Live
                </button>
                <button className="ghost-button" type="button" onClick={handleCreateUserSnapshot} disabled={isLoading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px', fontSize: '12px' }}>
                  <Save size={13} /> Save Snapshot
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.05))' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={driveAutoSync}
                    onChange={(e) => handleDriveAutoSyncChange(e.target.checked)}
                  />
                  <span>Autonomous Auto-Sync (silently syncs edits in background to live file)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dailySnapshotsEnabled}
                    onChange={(e) => handleDailySnapshotsToggle(e.target.checked)}
                  />
                  <span>Retain automated daily backups (max 1 file per day)</span>
                </label>
                {dailySnapshotsEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '22px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', opacity: 0.75 }}>Daily backup retention limit:</span>
                    <select
                      value={retentionLimit}
                      onChange={(e) => void handleRetentionLimitChange(Number(e.target.value))}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'var(--surface-soft, rgba(255,255,255,0.06))',
                        color: 'inherit',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                        cursor: 'pointer',
                      }}
                    >
                      <option value={3}>3 days (Max 3 files · ~150 KB)</option>
                      <option value={7}>7 days (Max 7 files · ~350 KB)</option>
                      <option value={14}>14 days (Max 14 files · ~700 KB)</option>
                      <option value={30}>30 days (Max 30 files · ~1.5 MB)</option>
                    </select>
                  </div>
                )}

                {/* Advanced OAuth Proxy / Background Refresh */}
                <div style={{ marginTop: '4px', borderTop: '1px dashed var(--border-color, rgba(255,255,255,0.08))', paddingTop: '6px' }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setShowAdvancedAuth(!showAdvancedAuth)}
                    style={{ fontSize: '11px', opacity: 0.8, padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>{showAdvancedAuth ? '▼' : '►'}</span>
                    <span>Advanced: Cloudflare Auth Proxy / Refresh Token (Optional)</span>
                  </button>

                  {showAdvancedAuth && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
                        By default, Budget Control signs in using Google Identity Services. To enable automatic background renewal via a zero-secret Cloudflare Worker proxy, enter your worker endpoint:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ opacity: 0.8, fontWeight: 500 }}>Auth Proxy Endpoint URL</label>
                        <input
                          type="url"
                          value={authProxyUrlInput}
                          placeholder="https://drive-auth-proxy.your-name.workers.dev"
                          onChange={(e) => {
                            setAuthProxyUrlInput(e.target.value);
                            saveStoredDriveAuthProxyUrl(e.target.value);
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '4px',
                            background: 'var(--surface-soft, rgba(255,255,255,0.06))',
                            color: 'inherit',
                            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ opacity: 0.8, fontWeight: 500 }}>Permanent Refresh Token</label>
                        <input
                          type="password"
                          value={refreshTokenInput}
                          placeholder="Stored securely in IndexedDB"
                          onChange={(e) => {
                            setRefreshTokenInput(e.target.value);
                            saveStoredDriveRefreshToken(e.target.value);
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '4px',
                            background: 'var(--surface-soft, rgba(255,255,255,0.06))',
                            color: 'inherit',
                            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Separated Snapshot Tiers Display */}
            <div style={{ marginTop: '2px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowSnapshotsSection(!showSnapshotsSection)}
                  style={{ fontSize: '12px', fontWeight: 600, padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{showSnapshotsSection ? '▼' : '►'}</span>
                  <Archive size={13} style={{ color: 'var(--brand-primary, #6366f1)' }} />
                  <span>Backup &amp; Snapshot History</span>
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={fetchCloudDetails}
                    disabled={isRefreshingBackups}
                    style={{ fontSize: '11px', padding: '2px 6px', opacity: 0.8 }}
                  >
                    {isRefreshingBackups ? '↻ Refreshing...' : '↻ Refresh'}
                  </button>
                </div>
              </div>

              {showSnapshotsSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Folder Tabs */}
                  <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))', paddingBottom: '8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveSnapshotTab('daily')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontWeight: activeSnapshotTab === 'daily' ? 600 : 400,
                        background: activeSnapshotTab === 'daily' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                        color: activeSnapshotTab === 'daily' ? 'var(--accent, #6366f1)' : 'inherit',
                      }}
                    >
                      <Calendar size={12} /> Daily Backups ({dailyBackups.length}/{retentionLimit})
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveSnapshotTab('edits')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontWeight: activeSnapshotTab === 'edits' ? 600 : 400,
                        background: activeSnapshotTab === 'edits' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                        color: activeSnapshotTab === 'edits' ? 'var(--accent, #6366f1)' : 'inherit',
                      }}
                    >
                      <Clock size={12} /> Edit Snapshots ({editSnapshots.length}/{MAX_EDIT_SNAPSHOTS_CAP})
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveSnapshotTab('user')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontWeight: activeSnapshotTab === 'user' ? 600 : 400,
                        background: activeSnapshotTab === 'user' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                        color: activeSnapshotTab === 'user' ? 'var(--accent, #6366f1)' : 'inherit',
                      }}
                    >
                      <Save size={12} /> User Snapshots ({userSnapshots.length})
                    </button>
                  </div>

                  {/* Tab Header & Quick Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>
                      {activeSnapshotTab === 'daily' && (
                        <span>Folder: <code>Budget Control / Daily Backups /</code> (Exact 1 per day on edit days)</span>
                      )}
                      {activeSnapshotTab === 'edits' && (
                        <span>Folder: <code>Budget Control / Edit Snapshots /</code> (15-min cooldown · Capped at 5)</span>
                      )}
                      {activeSnapshotTab === 'user' && (
                        <span>Folder: <code>Budget Control / User Snapshots /</code> (Manual milestones · Permanent)</span>
                      )}
                    </div>
                    {currentTabList.length > 0 && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          if (activeSnapshotTab === 'daily') void handleClearDaily();
                          else if (activeSnapshotTab === 'edits') void handleClearEdits();
                          else void handleClearUser();
                        }}
                        disabled={isLoading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 6px', color: 'var(--red, #ef4444)' }}
                      >
                        <Trash2 size={11} /> Clear Folder
                      </button>
                    )}
                  </div>

                  {/* List Container */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {currentTabList.length === 0 ? (
                      <div style={{ fontSize: '11px', opacity: 0.6, fontStyle: 'italic', padding: '12px', textAlign: 'center' }}>
                        {activeSnapshotTab === 'daily' && 'No daily backups created yet. Created once per day whenever you make ledger changes.'}
                        {activeSnapshotTab === 'edits' && 'No edit snapshots yet. Created during active edit sessions (15-min cooldown, max 5 rolling files).'}
                        {activeSnapshotTab === 'user' && 'No user milestones saved yet. Click "Save Snapshot" above to save one anytime.'}
                      </div>
                    ) : (
                      currentTabList.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ minWidth: 0, paddingRight: '8px' }}>
                            <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{item.name}</div>
                            <div style={{ fontSize: '10px', opacity: 0.6 }}>
                              {new Date(item.modifiedTime).toLocaleString()} • {formatBytes(item.size)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleRestoreBackup(item)}
                              disabled={isLoading}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', color: 'var(--accent, #6366f1)' }}
                            >
                              <RotateCcw size={11} /> Restore
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleDeleteIndividualBackup(item)}
                              disabled={isLoading}
                              title="Delete this backup"
                              style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 6px', color: 'var(--red, #ef4444)' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Disconnected state */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}>
            <p className="gist-sync-intro" style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
              Save and autonomously sync your budget directly inside your own private Google Drive folder:
              <br />
              <code>My Drive / Budget Control / budget-data.json</code>
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={handleDriveSignIn}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                background: '#4285F4',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Sign in with Google to Sync Drive
            </button>

            <div style={{ padding: '10px 12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <Lock size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--kpi-cyan, #38bdf8)' }} />
              <span>
                <strong>Zero-Setup &amp; Private:</strong> Budget Control uses the strict <code>drive.file</code> scope. It only has permission to create and edit its own <code>Budget Control</code> folder. It cannot see or access any other files in your Google Drive.
              </span>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
