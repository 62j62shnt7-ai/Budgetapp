import type { GoogleDriveUser } from '../services/googleDriveClient';

export interface SyncStatusPresentation {
  label: string;
  pillClass: 'synced' | 'syncing' | 'error' | 'unsaved' | '';
  dotColor: string; // Hex color for compact mobile dot indicators
  isExpired: boolean;
  isConnected: boolean;
}

/**
 * Single source of truth for sync status across all UI surfaces
 * (Desktop Topbar, Mobile Topbar, Mobile BottomNav, Mobile ActionSheet, Sidebar Drawer)
 */
export function getSyncStatusPresentation(params: {
  driveUser: GoogleDriveUser | null;
  driveAutoSync: boolean;
  driveSyncStatus: 'idle' | 'scheduled' | 'syncing' | 'synced' | 'conflict' | 'error' | 'expired';
  hasUnsyncedChanges: boolean;
}): SyncStatusPresentation {
  const { driveUser, driveAutoSync, driveSyncStatus, hasUnsyncedChanges } = params;
  const isConnected = Boolean(driveUser);
  const isExpired = driveSyncStatus === 'expired';

  if (!isConnected) {
    return {
      label: 'Setup',
      pillClass: '',
      dotColor: 'var(--muted, #94a3b8)',
      isExpired: false,
      isConnected: false,
    };
  }

  if (isExpired) {
    return {
      label: 'Reconnect',
      pillClass: 'error',
      dotColor: '#ef4444',
      isExpired: true,
      isConnected: true,
    };
  }

  if (driveSyncStatus === 'conflict') {
    return {
      label: 'Conflict',
      pillClass: 'error',
      dotColor: '#f59e0b',
      isExpired: false,
      isConnected: true,
    };
  }

  if (driveSyncStatus === 'error') {
    return {
      label: 'Error',
      pillClass: 'error',
      dotColor: '#ef4444',
      isExpired: false,
      isConnected: true,
    };
  }

  if (driveSyncStatus === 'syncing' || driveSyncStatus === 'scheduled') {
    return {
      label: driveSyncStatus === 'scheduled' ? 'Queued' : 'Syncing',
      pillClass: 'syncing',
      dotColor: '#eab308',
      isExpired: false,
      isConnected: true,
    };
  }

  if (!driveAutoSync) {
    return {
      label: hasUnsyncedChanges ? 'Unsynced' : 'Manual',
      pillClass: hasUnsyncedChanges ? 'unsaved' : 'synced',
      dotColor: hasUnsyncedChanges ? '#f59e0b' : '#3b82f6',
      isExpired: false,
      isConnected: true,
    };
  }

  if (hasUnsyncedChanges) {
    return {
      label: 'Unsaved',
      pillClass: 'unsaved',
      dotColor: '#f59e0b',
      isExpired: false,
      isConnected: true,
    };
  }

  return {
    label: 'Synced',
    pillClass: 'synced',
    dotColor: '#22c55e',
    isExpired: false,
    isConnected: true,
  };
}
