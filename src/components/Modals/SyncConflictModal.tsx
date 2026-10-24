import React from 'react';
import { Modal } from '../Common/Modal';
import { useBudgetStore } from '../../store/useBudgetStore';
import { getSyncEngine } from '../../services/syncEngine';
import { formatMoney } from '../../engine/dateUtils';
import { AlertTriangle, Download, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export const SyncConflictModal: React.FC = () => {
  const syncConflict = useBudgetStore((state) => state.syncConflict);
  const setSyncConflict = useBudgetStore((state) => state.setSyncConflict);

  if (!syncConflict) return null;

  const { diffSummary, isSanityWarning, isFirstSignIn } = syncConflict;

  const handleKeepMine = async () => {
    await getSyncEngine().resolveConflict('keep_mine');
  };

  const handleTakeTheirs = async () => {
    await getSyncEngine().resolveConflict('take_theirs');
  };

  const handleDownloadBoth = () => {
    // Download local
    const localBlob = new Blob([syncConflict.localPayload], { type: 'application/json' });
    const localUrl = URL.createObjectURL(localBlob);
    const a1 = document.createElement('a');
    a1.href = localUrl;
    a1.download = `budget-local-${new Date().toISOString().slice(0, 10)}.json`;
    a1.click();
    URL.revokeObjectURL(localUrl);

    // Download remote
    setTimeout(() => {
      const remoteBlob = new Blob([syncConflict.remotePayload], { type: 'application/json' });
      const remoteUrl = URL.createObjectURL(remoteBlob);
      const a2 = document.createElement('a');
      a2.href = remoteUrl;
      a2.download = `budget-cloud-${new Date().toISOString().slice(0, 10)}.json`;
      a2.click();
      URL.revokeObjectURL(remoteUrl);
    }, 250);
  };

  return (
    <Modal
      isOpen={Boolean(syncConflict)}
      onClose={() => setSyncConflict(null)}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber, #f59e0b)' }}>
          <AlertTriangle size={20} />
          <span>{isFirstSignIn ? 'Cloud Budget Detected' : isSanityWarning ? 'Cloud Data Sanity Warning' : 'Google Drive Sync Conflict'}</span>
        </div>
      }
      subtitle={
        isFirstSignIn
          ? 'An existing budget was found in your Google Drive folder. Choose whether to import it or keep your local data.'
          : isSanityWarning
          ? 'The downloaded cloud budget has significantly fewer entries than your local ledger. Please verify before applying.'
          : 'Changes were made on another device while you had unsaved edits. Choose how you want to reconcile.'
      }
      maxWidth="580px"
      showCloseButton={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Comparison Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Local Box */}
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: 'var(--surface-soft, rgba(255,255,255,0.03))',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent, #6366f1)' }}>
              💻 This Device (Local)
            </div>
            <div style={{ fontSize: '12px' }}>
              <strong>{diffSummary.localEntriesCount}</strong> transactions
            </div>
            <div style={{ fontSize: '12px' }}>
              Balance: <strong>{formatMoney(diffSummary.localTotalBalances)} EGP</strong>
            </div>
            {diffSummary.localRevision !== undefined && (
              <div style={{ fontSize: '11px', opacity: 0.65 }}>
                Revision #{diffSummary.localRevision}
              </div>
            )}
            <div style={{ fontSize: '11px', opacity: 0.65 }}>
              Edited: {diffSummary.localModifiedAt ? new Date(diffSummary.localModifiedAt).toLocaleTimeString() : 'Recently'}
            </div>
          </div>

          {/* Cloud Box */}
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: 'var(--surface-soft, rgba(255,255,255,0.03))',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--blue, #3b82f6)' }}>
              ☁️ Google Drive (Cloud)
            </div>
            <div style={{ fontSize: '12px' }}>
              <strong>{diffSummary.remoteEntriesCount}</strong> transactions
            </div>
            <div style={{ fontSize: '12px' }}>
              Balance: <strong>{formatMoney(diffSummary.remoteTotalBalances)} EGP</strong>
            </div>
            {diffSummary.remoteRevision !== undefined && (
              <div style={{ fontSize: '11px', opacity: 0.65 }}>
                Revision #{diffSummary.remoteRevision}
              </div>
            )}
            <div style={{ fontSize: '11px', opacity: 0.65 }}>
              Edited: {diffSummary.remoteModifiedAt ? new Date(diffSummary.remoteModifiedAt).toLocaleTimeString() : 'Recently'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="primary-button"
            onClick={handleKeepMine}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            <ArrowUpRight size={16} />
            <span>Keep Mine (Overwrite Cloud with Local)</span>
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={handleTakeTheirs}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderColor: 'var(--blue)' }}
          >
            <ArrowDownLeft size={16} />
            <span>Take Theirs (Replace Local with Cloud)</span>
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="ghost-button"
              onClick={handleDownloadBoth}
              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              <span>Download Both Files</span>
            </button>

            <button
              type="button"
              className="ghost-button"
              onClick={() => setSyncConflict(null)}
              style={{ fontSize: '12px' }}
            >
              Decide Later
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
