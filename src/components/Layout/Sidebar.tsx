import React from 'react';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, sidebarCollapsed, toggleSidebar, closeMobileSidebar } = useBudgetStore();

  const tabs: Array<{ id: ViewTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'deficits', label: 'Deficits' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'history', label: 'History' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'storage', label: 'Storage' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'rates', label: 'Rates' },
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
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">BC</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>Budget Control</h1>
            <p>Cash, jobs, storage</p>
          </div>
          <button
            className="sidebar-toggle-btn"
            id="sidebarCollapseBtn"
            type="button"
            title="Collapse sidebar (Ctrl+B)"
            aria-label="Collapse sidebar"
            onClick={handleCollapseClick}
          >
            ◀
          </button>
        </div>

        <nav className="nav" aria-label="Main views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              data-view={tab.id}
              type="button"
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.label}
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
