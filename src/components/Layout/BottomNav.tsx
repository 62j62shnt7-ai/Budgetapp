import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { getSyncStatusPresentation } from '../../utils/syncPresentation';
import { LayoutDashboard, TrendingUp, Landmark, MoreHorizontal, Plus } from 'lucide-react';

interface BottomNavProps {
  onOpenMobileMenu: () => void;
  onOpenQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenMobileMenu, onOpenQuickAdd }) => {
  const {
    activeTab,
    setActiveTab,
    driveUser,
    driveAutoSync,
    driveSyncStatus,
    hasUnsyncedChanges,
  } = useBudgetStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      driveUser: state.driveUser,
      driveAutoSync: state.driveAutoSync,
      driveSyncStatus: state.driveSyncStatus,
      hasUnsyncedChanges: state.hasUnsyncedChanges,
    }))
  );

  const { isConnected, isExpired, dotColor } = getSyncStatusPresentation({
    driveUser,
    driveAutoSync,
    driveSyncStatus,
    hasUnsyncedChanges,
  });
  const isError = driveSyncStatus === 'error';
  const showDot = isConnected && (isExpired || isError || hasUnsyncedChanges);

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
        <span className="bottom-nav-label">Home</span>
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
        <span className="bottom-nav-label">Cashflow</span>
      </button>

      <button
        type="button"
        className="bottom-nav-item bottom-nav-fab"
        onClick={onOpenQuickAdd}
        aria-label="Add expense"
        title="Add expense"
      >
        <div className="bottom-nav-fab-btn">
          <Plus size={22} strokeWidth={2.5} />
        </div>
        <span className="bottom-nav-label">Add</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
        onClick={() => setActiveTab('accounts')}
        aria-current={activeTab === 'accounts' ? 'page' : undefined}
      >
        <div className="bottom-nav-icon">
          <Landmark size={19} />
        </div>
        <span className="bottom-nav-label">Accounts</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${['deficits', 'history', 'storage', 'jobs', 'rates'].includes(activeTab) ? 'active' : ''}`}
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
                background: dotColor,
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
