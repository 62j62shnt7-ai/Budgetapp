import React from 'react';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
import { useAppUpdateStatus } from '../../hooks/useAppUpdateStatus';
import { 
  Menu, 
  Sun, 
  Moon, 
  Cloud, 
  RotateCw,
  RotateCcw,
  Database, 
  CreditCard, 
  Plus
} from 'lucide-react';

import { executeAppRefresh } from '../../utils/appRefresh';

interface TopbarProps {
  onOpenEntryModal: (type: 'expense' | 'income') => void;
  onOpenLoanModal: () => void;
  onOpenDataTools: () => void;
  onOpenGistSync: () => void;
}

const tabTitles: Record<ViewTab, string> = {
  dashboard: 'Dashboard',
  deficits: 'Deficits',
  cashflow: 'Cash Flow',
  history: 'History',
  accounts: 'Accounts',
  storage: 'Storage',
  jobs: 'Jobs',
  rates: 'Rates',
};

export const Topbar: React.FC<TopbarProps> = ({
  onOpenEntryModal,
  onOpenLoanModal,
  onOpenDataTools,
  onOpenGistSync,
}) => {
  const {
    theme,
    setTheme,
    activeTab,
    toggleSidebar,
    gistId,
    gistAutoSync,
    gistSyncStatus,
    undoStack,
    redoStack,
    undo,
    redo,
  } = useBudgetStore();
  const updateStatus = useAppUpdateStatus();
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
    <>
      <header className="topbar">
        <div className="topbar-title-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="ghost-button icon-button sidebar-open-btn"
            id="sidebarExpandBtn"
            type="button"
            aria-label="Open navigation"
            title="Toggle Sidebar (Ctrl+B)"
            onClick={toggleSidebar}
          >
            <Menu size={18} />
          </button>
          <div>
            <p className="eyebrow" style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>
              Personal budget
            </p>
            <h2 id="viewTitle" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              {tabTitles[activeTab]}
            </h2>
          </div>
        </div>

        {/* Mobile-only compact actions (single-row) */}
        <div className="top-actions-mobile">
          {undoStack.length > 0 && (
            <button
              className="ghost-button icon-button mobile-undo-btn"
              id="mobileUndoBtn"
              type="button"
              aria-label={`Undo last action (${undoStack.length})`}
              title={`Undo: ${undoStack[0]?.label}`}
              onClick={() => undo()}
            >
              <RotateCcw size={16} />
              <span className="undo-counter-badge">{undoStack.length}</span>
            </button>
          )}
          <button
            className="primary-button mobile-quick-add-btn"
            type="button"
            onClick={() => onOpenEntryModal('expense')}
            aria-label="Add Expense"
          >
            <Plus size={15} />
            <span>Expense</span>
          </button>
          <button
            className="ghost-button icon-button mobile-refresh-btn"
            id="mobileRefreshBtn"
            type="button"
            aria-label="Refresh application"
            title="Check for updates, clear cache & reload app"
            onClick={() => executeAppRefresh()}
          >
            <RotateCw size={17} />
          </button>
        </div>

        {/* Desktop-only comprehensive toolbar */}
        <div className="top-actions desktop-top-actions">
          <div className="top-actions-cluster top-actions-utilities">
            <button
              className="ghost-button topbar-undo-btn"
              id="topbarUndoBtn"
              type="button"
              disabled={undoStack.length === 0}
              aria-label={undoStack[0] ? `Undo: ${undoStack[0].label} (${undoStack.length} steps available)` : 'Nothing to undo'}
              title={undoStack[0] ? `Undo: ${undoStack[0].label} (${undoStack.length} steps available, max 30)` : 'Nothing to undo'}
              onClick={() => undo()}
            >
              <RotateCcw size={15} />
              <span className="topbar-btn-label">Undo</span>
              {undoStack.length > 0 && (
                <span className="undo-counter-badge" id="undoCountBadge">{undoStack.length}</span>
              )}
            </button>

            <button
              className="ghost-button topbar-redo-btn"
              id="topbarRedoBtn"
              type="button"
              disabled={redoStack.length === 0}
              aria-label={redoStack[0] ? `Redo: ${redoStack[0].label} (${redoStack.length} steps available)` : 'Nothing to redo'}
              title={redoStack[0] ? `Redo: ${redoStack[0].label} (${redoStack.length} steps available)` : 'Nothing to redo'}
              onClick={() => redo()}
            >
              <RotateCw size={15} />
              <span className="topbar-btn-label">Redo</span>
              {redoStack.length > 0 && (
                <span className="undo-counter-badge" id="redoCountBadge">{redoStack.length}</span>
              )}
            </button>

            <button
              className="ghost-button"
              id="themeToggle"
              type="button"
              aria-pressed={theme === 'dark'}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span className="topbar-btn-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <button
              className="ghost-button"
              id="refreshAppBtn"
              type="button"
              aria-label="Refresh application"
              title="Check for updates, clear cache & reload app"
              onClick={() => executeAppRefresh()}
            >
              <RotateCw size={15} />
              <span className="topbar-btn-label">Refresh</span>
              <span className={`sync-pill ${updateStatus === 'Update ready' ? 'update-ready' : 'synced'}`} id="appUpdateStatus" role="status" aria-live="polite">
                {updateStatus}
              </span>
            </button>

            <button
              className="ghost-button"
              id="gistSyncBtn"
              type="button"
              title="Configure Cloud Sync"
              onClick={onOpenGistSync}
            >
              <Cloud size={15} />
              <span className="topbar-btn-label">Sync</span>
              <span
                className={`sync-pill ${syncPillClass}`}
                id="gistSyncStatus"
                role="status"
                aria-live="polite"
                title={gistSyncStatus === 'idle' && gistAutoSync ? 'Automatic sync is enabled and waiting for a data change.' : undefined}
              >
                {syncLabel}
              </span>
            </button>
          </div>

          <div className="topbar-divider" role="separator" />

          <div className="top-actions-cluster top-actions-operations">
            <button
              className="ghost-button"
              id="openDataToolsBtn"
              type="button"
              title="Data Backup, CSV/JSON & Tools"
              onClick={onOpenDataTools}
            >
              <Database size={15} />
              <span className="topbar-btn-label">Manage Data</span>
            </button>

            <button
              className="ghost-button"
              id="addLoanBtn"
              type="button"
              title="Bridge deficit or take loan"
              onClick={onOpenLoanModal}
            >
              <CreditCard size={15} />
              <span className="topbar-btn-label">Take loan</span>
            </button>

            <button
              className="ghost-button topbar-income-button"
              id="addIncome"
              type="button"
              onClick={() => onOpenEntryModal('income')}
            >
              <Plus size={15} />
              <span className="topbar-btn-label">Income</span>
            </button>

            <button
              className="primary-button topbar-expense-button"
              id="addEntry"
              type="button"
              onClick={() => onOpenEntryModal('expense')}
            >
              <Plus size={15} />
              <span className="topbar-btn-label">Expense</span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
};
