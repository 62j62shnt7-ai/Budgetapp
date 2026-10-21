import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { LayoutDashboard, TrendingUp, AlertTriangle, History, MoreHorizontal, Plus } from 'lucide-react';
import { isDriveTokenValid } from '../../services/googleDriveClient';

interface BottomNavProps {
  onOpenMobileMenu: () => void;
  onOpenQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenMobileMenu, onOpenQuickAdd }) => {
  const { activeTab, setActiveTab, driveUser, driveSyncStatus } = useBudgetStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      driveUser: state.driveUser,
      driveSyncStatus: state.driveSyncStatus,
    }))
  );

  const isConnected = Boolean(driveUser);
  const isExpired = driveSyncStatus === 'expired' || (isConnected && !isDriveTokenValid());
  const isError = driveSyncStatus === 'error';
  const showDot = isConnected && (isExpired || isError);

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <button
        type="button"
        className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => setActiveTab('dashboard')}
        aria-current={activeTab === 'dashboard' ? 'page' : undefined}
      >
        <div className="bottom-nav-icon">
          <LayoutDashboard size={19} />
        </div>
        <span className="bottom-nav-label">Dashboard</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${activeTab === 'cashflow' ? 'active' : ''}`}
        onClick={() => setActiveTab('cashflow')}
        aria-current={activeTab === 'cashflow' ? 'page' : undefined}
      >
        <div className="bottom-nav-icon">
          <TrendingUp size={19} />
        </div>
        <span className="bottom-nav-label">Cash Flow</span>
      </button>

      <button
        type="button"
        className="bottom-nav-item bottom-nav-fab"
        onClick={onOpenQuickAdd}
        aria-label="Quick Add transaction"
        title="Quick Add transaction"
      >
        <div className="bottom-nav-fab-btn">
          <Plus size={22} strokeWidth={2.5} />
        </div>
        <span className="bottom-nav-label">Add</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${activeTab === 'deficits' ? 'active' : ''}`}
        onClick={() => setActiveTab('deficits')}
        aria-current={activeTab === 'deficits' ? 'page' : undefined}
      >
        <div className="bottom-nav-icon">
          <AlertTriangle size={19} />
        </div>
        <span className="bottom-nav-label">Deficits</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => setActiveTab('history')}
        aria-current={activeTab === 'history' ? 'page' : undefined}
      >
        <div className="bottom-nav-icon">
          <History size={19} />
        </div>
        <span className="bottom-nav-label">History</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${['accounts', 'storage', 'jobs', 'rates'].includes(activeTab) ? 'active' : ''}`}
        onClick={onOpenMobileMenu}
        aria-label="More views"
      >
        <div className="bottom-nav-icon" style={{ position: 'relative' }}>
          <MoreHorizontal size={19} />
          {showDot && (
            <span
              style={{
                position: 'absolute',
                top: '-1px',
                right: '-3px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#ef4444',
                border: '1.5px solid var(--surface, #1e293b)',
              }}
            />
          )}
        </div>
        <span className="bottom-nav-label">More</span>
      </button>
    </nav>
  );
};
