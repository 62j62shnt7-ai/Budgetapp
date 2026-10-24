import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
import { getSyncStatusPresentation } from '../../utils/syncPresentation';
import {
  LayoutDashboard,
  AlertTriangle,
  TrendingUp,
  History,
  Landmark,
  Coins,
  Briefcase,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Cloud,
} from 'lucide-react';

interface SidebarProps {
  onOpenDriveSync?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenDriveSync }) => {
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    toggleSidebar,
    closeMobileSidebar,
    driveUser,
    driveSyncStatus,
    driveAutoSync,
    hasUnsyncedChanges,
  } = useBudgetStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      sidebarCollapsed: state.sidebarCollapsed,
      toggleSidebar: state.toggleSidebar,
      closeMobileSidebar: state.closeMobileSidebar,
      driveUser: state.driveUser,
      driveSyncStatus: state.driveSyncStatus,
      driveAutoSync: state.driveAutoSync,
      hasUnsyncedChanges: state.hasUnsyncedChanges,
    }))
  );

  const {
    label: syncLabel,
    dotColor,
    isExpired,
    isConnected,
  } = getSyncStatusPresentation({
    driveUser,
    driveAutoSync,
    driveSyncStatus,
    hasUnsyncedChanges,
  });

  const tabs: Array<{ id: ViewTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'deficits', label: 'Deficits', icon: <AlertTriangle size={18} /> },
    { id: 'cashflow', label: 'Cash Flow', icon: <TrendingUp size={18} /> },
    { id: 'history', label: 'History', icon: <History size={18} /> },
    { id: 'accounts', label: 'Accounts', icon: <Landmark size={18} /> },
    { id: 'storage', label: 'Storage', icon: <Coins size={18} /> },
    { id: 'jobs', label: 'Jobs', icon: <Briefcase size={18} /> },
    { id: 'rates', label: 'Rates', icon: <ArrowLeftRight size={18} /> },
  ];

  const handleTabClick = (tabId: ViewTab) => {
    setActiveTab(tabId);
    if (typeof window !== 'undefined' && window.innerWidth <= 980) {
      closeMobileSidebar();
    }
  };

  const handleCollapseClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 980) {
      closeMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  return (
    <>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Main sidebar">
        <div className="brand">
          <div
            className="brand-mark"
            title="Budget Control"
            onClick={() => {
              if (sidebarCollapsed && typeof window !== 'undefined' && window.innerWidth > 980) {
                toggleSidebar();
              }
            }}
            style={{ cursor: sidebarCollapsed ? 'pointer' : 'default' }}
          >
            BC
          </div>
          <div className="brand-details" style={{ flex: 1, minWidth: 0 }}>
            <h1>Budget Control</h1>
            <p>Cash, jobs, storage</p>
          </div>
          <button
            className="sidebar-toggle-btn"
            id="sidebarCollapseBtn"
            type="button"
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={handleCollapseClick}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="nav" aria-label="Main views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              data-view={tab.id}
              data-tooltip={tab.label}
              type="button"
              title={sidebarCollapsed ? tab.label : undefined}
              aria-label={tab.label}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => handleTabClick(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        {onOpenDriveSync && (
          <div style={{ marginTop: 'auto', padding: '10px 12px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <button
              type="button"
              className="ghost-button"
              onClick={onOpenDriveSync}
              title={`Google Drive: ${syncLabel}${driveUser ? ` (${driveUser.email})` : ''}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: sidebarCollapsed ? '0' : '10px',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                padding: sidebarCollapsed ? '8px 0' : '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                background: 'var(--surface-soft, rgba(255,255,255,0.03))',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cloud size={17} color={isExpired ? '#ef4444' : isConnected ? 'var(--blue, #3b82f6)' : 'var(--muted)'} />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    right: '-2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: dotColor,
                    border: '1px solid var(--surface, #1e293b)',
                  }}
                />
              </div>
              {!sidebarCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600, fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                    {isConnected ? (driveUser?.name || 'Google Drive') : 'Connect Drive'}
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.7, color: isExpired ? '#ef4444' : 'inherit' }}>
                    {syncLabel}
                  </span>
                </div>
              )}
            </button>
          </div>
        )}
      </aside>
      <div
        className="sidebar-backdrop"
        id="sidebarBackdrop"
        onClick={closeMobileSidebar}
      />
    </>
  );
};

