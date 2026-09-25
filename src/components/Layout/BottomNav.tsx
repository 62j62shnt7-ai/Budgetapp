import React from 'react';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
import { LayoutDashboard, TrendingUp, AlertTriangle, History, Menu } from 'lucide-react';

interface BottomNavProps {
  onOpenMobileMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenMobileMenu }) => {
  const { activeTab, setActiveTab } = useBudgetStore();

  const primaryTabs: Array<{ id: ViewTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'cashflow', label: 'Cash Flow', icon: <TrendingUp size={20} /> },
    { id: 'deficits', label: 'Deficits', icon: <AlertTriangle size={20} /> },
    { id: 'history', label: 'History', icon: <History size={20} /> },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      {primaryTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="bottom-nav-icon">{tab.icon}</div>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        className={`bottom-nav-item ${['accounts', 'storage', 'jobs', 'rates'].includes(activeTab) ? 'active' : ''}`}
        onClick={onOpenMobileMenu}
        aria-label="More views"
      >
        <div className="bottom-nav-icon">
          <Menu size={20} />
        </div>
        <span className="bottom-nav-label">More</span>
      </button>
    </nav>
  );
};
