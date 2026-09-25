import React from 'react';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
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
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, sidebarCollapsed, toggleSidebar, closeMobileSidebar } = useBudgetStore();

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
      </aside>
      <div
        className="sidebar-backdrop"
        id="sidebarBackdrop"
        onClick={closeMobileSidebar}
      />
    </>
  );
};

