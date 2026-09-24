import React from 'react';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
import { 
  Menu, 
  Sun, 
  Moon, 
  Cloud, 
  RotateCw, 
  Database, 
  CreditCard, 
  Plus 
} from 'lucide-react';

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
  const { theme, setTheme, activeTab, toggleSidebar, gistId } = useBudgetStore();

  return (
    <header className="topbar">
      <div className="topbar-title-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          className="ghost-button icon-button sidebar-open-btn"
          id="sidebarExpandBtn"
          type="button"
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

      <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className="ghost-button"
          id="themeToggle"
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <button
          className="ghost-button"
          id="refreshAppBtn"
          type="button"
          title="Check for updates, clear cache & reload app"
          onClick={() => window.location.reload()}
        >
          <RotateCw size={14} />
          <span>Refresh</span>
          <span className="sync-pill synced" id="appUpdateStatus">Latest</span>
        </button>

        <button
          className="ghost-button"
          id="gistSyncBtn"
          type="button"
          title="Configure Cloud Sync"
          onClick={onOpenGistSync}
        >
          <Cloud size={14} />
          <span>Sync</span>
          <span className={`sync-pill ${gistId ? 'synced' : ''}`} id="gistSyncStatus">
            {gistId ? 'Active' : 'Setup'}
          </span>
        </button>

        <button
          className="ghost-button"
          id="openDataToolsBtn"
          type="button"
          title="Data Backup, CSV/JSON & Tools"
          onClick={onOpenDataTools}
        >
          <Database size={14} />
          <span>Manage Data</span>
        </button>

        <button
          className="ghost-button"
          id="addLoanBtn"
          type="button"
          title="Bridge deficit or take loan"
          onClick={onOpenLoanModal}
        >
          <CreditCard size={14} />
          <span>Take loan</span>
        </button>

        <button
          className="ghost-button"
          id="addIncome"
          type="button"
          onClick={() => onOpenEntryModal('income')}
        >
          <Plus size={14} />
          <span>Income</span>
        </button>

        <button
          className="primary-button"
          id="addEntry"
          type="button"
          onClick={() => onOpenEntryModal('expense')}
        >
          <Plus size={14} />
          <span>Expense</span>
        </button>
      </div>
    </header>
  );
};
