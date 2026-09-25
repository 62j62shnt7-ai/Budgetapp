import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { 
  Sun, 
  Moon, 
  RotateCw, 
  Cloud, 
  Database, 
  CreditCard, 
  PlusCircle, 
  MinusCircle,
  X 
} from 'lucide-react';
import { executeAppRefresh } from '../../utils/appRefresh';

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenEntryModal: (type: 'expense' | 'income') => void;
  onOpenLoanModal: () => void;
  onOpenDataTools: () => void;
  onOpenGistSync: () => void;
  updateStatus: string;
}

export const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  isOpen,
  onClose,
  onOpenEntryModal,
  onOpenLoanModal,
  onOpenDataTools,
  onOpenGistSync,
  updateStatus,
}) => {
  const { theme, setTheme, gistId, gistAutoSync, gistSyncStatus } = useBudgetStore();

  if (!isOpen) return null;

  const syncLabel = !gistId
    ? 'Setup'
    : !gistAutoSync
      ? 'Manual'
      : {
        idle: 'Ready',
        scheduled: 'Queued',
        syncing: 'Syncing',
        synced: 'Synced',
        error: 'Error',
      }[gistSyncStatus];

  const syncPillClass = gistSyncStatus === 'error'
    ? 'error'
    : gistSyncStatus === 'syncing' || gistSyncStatus === 'scheduled'
      ? 'syncing'
      : gistSyncStatus === 'synced'
        ? 'synced'
        : '';

  return (
    <div className="mobile-action-sheet-backdrop" onClick={onClose}>
      <div 
        className="mobile-action-sheet" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Actions & Tools"
      >
        <div className="action-sheet-header">
          <div className="action-sheet-drag-handle" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Quick Actions &amp; Tools</h3>
            <button 
              className="ghost-button icon-button" 
              type="button" 
              onClick={onClose}
              aria-label="Close action sheet"
              style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="action-sheet-grid">
          {/* Add Expense (Primary) */}
          <button
            type="button"
            className="action-sheet-btn action-sheet-btn-expense"
            onClick={() => {
              onClose();
              onOpenEntryModal('expense');
            }}
          >
            <MinusCircle size={20} color="var(--red)" />
            <div className="action-sheet-btn-text">
              <strong>Add Expense</strong>
              <span>Record a new spend or card transaction</span>
            </div>
          </button>

          {/* Add Income */}
          <button
            type="button"
            className="action-sheet-btn action-sheet-btn-income"
            onClick={() => {
              onClose();
              onOpenEntryModal('income');
            }}
          >
            <PlusCircle size={20} color="var(--green)" />
            <div className="action-sheet-btn-text">
              <strong>Add Income</strong>
              <span>Record incoming cash, revenue or bonus</span>
            </div>
          </button>

          {/* Take Loan */}
          <button
            type="button"
            className="action-sheet-btn"
            onClick={() => {
              onClose();
              onOpenLoanModal();
            }}
          >
            <CreditCard size={20} color="var(--teal)" />
            <div className="action-sheet-btn-text">
              <strong>Bridge Deficit / Loan</strong>
              <span>Borrow or inject liquidity into cashflow</span>
            </div>
          </button>

          {/* Cloud Sync */}
          <button
            type="button"
            className="action-sheet-btn"
            onClick={() => {
              onClose();
              onOpenGistSync();
            }}
          >
            <Cloud size={20} color="var(--blue)" />
            <div className="action-sheet-btn-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong>GitHub Gist Sync</strong>
                <span className={`sync-pill ${syncPillClass}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                  {syncLabel}
                </span>
              </div>
              <span>Backup, pull &amp; push across devices</span>
            </div>
          </button>

          {/* Data Tools */}
          <button
            type="button"
            className="action-sheet-btn"
            onClick={() => {
              onClose();
              onOpenDataTools();
            }}
          >
            <Database size={20} color="var(--purple, #8b5cf6)" />
            <div className="action-sheet-btn-text">
              <strong>Manage Data &amp; Backups</strong>
              <span>Export CSV/JSON, auto-tagging, data resets</span>
            </div>
          </button>

          {/* Theme Switcher */}
          <button
            type="button"
            className="action-sheet-btn"
            onClick={() => {
              setTheme(theme === 'dark' ? 'light' : 'dark');
            }}
          >
            {theme === 'dark' ? <Sun size={20} color="#f59e0b" /> : <Moon size={20} color="#6366f1" />}
            <div className="action-sheet-btn-text">
              <strong>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</strong>
              <span>Currently using {theme} appearance</span>
            </div>
          </button>

          {/* Refresh & Update */}
          <button
            type="button"
            className="action-sheet-btn"
            onClick={() => {
              onClose();
              executeAppRefresh();
            }}
          >
            <RotateCw size={20} color="var(--teal)" />
            <div className="action-sheet-btn-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong>Refresh App</strong>
                <span className={`sync-pill ${updateStatus === 'Update ready' ? 'update-ready' : 'synced'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                  {updateStatus}
                </span>
              </div>
              <span>Clear cache and reload latest version</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
