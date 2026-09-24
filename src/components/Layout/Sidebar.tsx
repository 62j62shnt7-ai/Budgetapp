import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import type { BudgetStoreState } from '../../store/useBudgetStore';
import { 
  LayoutDashboard, 
  TrendingUp, 
  CreditCard, 
  ReceiptText, 
  Coins, 
  Boxes, 
  Settings 
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useBudgetStore();

  const navItems: Array<{ id: BudgetStoreState['activeTab']; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'forecast', label: 'Cashflow Forecast', icon: <TrendingUp size={18} /> },
    { id: 'credit', label: 'Credit Card Cycles', icon: <CreditCard size={18} /> },
    { id: 'entries', label: 'Entries & History', icon: <ReceiptText size={18} /> },
    { id: 'rates', label: 'Rates & Gold', icon: <Coins size={18} /> },
    { id: 'storage', label: 'Storage Assets', icon: <Boxes size={18} /> },
    { id: 'settings', label: 'Settings & Cloud', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
            role="button"
            tabIndex={0}
          >
            {item.icon}
            <span className="nav-text">{item.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
};
