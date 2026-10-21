import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  signInWithGoogleDrive,
  downloadBudgetFromDrive,
  isDriveTokenValid,
} from '../../services/googleDriveClient';
import { AlertCircle, RefreshCw, X, ExternalLink } from 'lucide-react';

interface DriveReconnectBannerProps {
  onOpenDriveSync?: () => void;
}

export const DriveReconnectBanner: React.FC<DriveReconnectBannerProps> = ({ onOpenDriveSync }) => {
  const { driveUser, driveSyncStatus, setDriveUser, setDriveSyncStatus, importJSON } = useBudgetStore(
    useShallow((state) => ({
      driveUser: state.driveUser,
      driveSyncStatus: state.driveSyncStatus,
      setDriveUser: state.setDriveUser,
      setDriveSyncStatus: state.setDriveSyncStatus,
      importJSON: state.importJSON,
    }))
  );

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Render if a user has linked Google Drive and either sync status is expired or token is invalid
  const isRequired = Boolean(driveUser) && (driveSyncStatus === 'expired' || !isDriveTokenValid());

  if (!isRequired || dismissed) {
    return null;
  }

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setErrorMessage(null);

    try {
      const { user, error } = await signInWithGoogleDrive();
      if (error) {
        setErrorMessage(error.message || 'Failed to reconnect Google Drive');
        setIsReconnecting(false);
        return;
      }

      if (user) {
        setDriveUser(user);
        setDriveSyncStatus('synced');

        // Attempt to auto-sync latest data
        try {
          const pullRes = await downloadBudgetFromDrive();
          if (pullRes.success && pullRes.payload) {
            importJSON(JSON.stringify(pullRes.payload), { isRemoteSync: true });
          }
        } catch (syncErr) {
          console.warn('[DriveReconnectBanner] Post-reconnect sync notice:', syncErr);
        }
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Unexpected reconnection error');
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div
      className="drive-reconnect-banner"
      role="alert"
      aria-live="assertive"
    >
      <div className="drive-reconnect-content">
        <div className="drive-reconnect-icon-wrapper">
          <AlertCircle size={18} className="drive-reconnect-icon" />
        </div>

        <div className="drive-reconnect-text-group">
          <span className="drive-reconnect-title">Google Drive Reconnection Required</span>
          <span className="drive-reconnect-desc">
            Your Google session expired for <strong>{driveUser?.email || driveUser?.name || 'your account'}</strong>. Reconnect now to restore automatic cloud sync & backups.
          </span>
          {errorMessage && (
            <span className="drive-reconnect-error">{errorMessage}</span>
          )}
        </div>
      </div>

      <div className="drive-reconnect-actions">
        <button
          type="button"
          className="drive-reconnect-btn primary"
          onClick={handleReconnect}
          disabled={isReconnecting}
          aria-label="Reconnect Google Drive"
        >
          <RefreshCw size={14} className={isReconnecting ? 'spin' : ''} />
          <span>{isReconnecting ? 'Reconnecting...' : 'Reconnect Account'}</span>
        </button>

        {onOpenDriveSync && (
          <button
            type="button"
            className="drive-reconnect-btn secondary"
            onClick={onOpenDriveSync}
            title="Open Google Drive Cloud Settings"
          >
            <ExternalLink size={13} />
            <span>Settings</span>
          </button>
        )}

        <button
          type="button"
          className="drive-reconnect-close"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
          title="Dismiss banner for this session"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
