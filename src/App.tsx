import React, { useState, useEffect } from 'react';
import { useBudgetStore } from './store/useBudgetStore';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { DashboardView } from './components/Dashboard/DashboardView';
import { ForecastView } from './components/Forecast/ForecastView';
import { CreditDuesView } from './components/CreditDues/CreditDuesView';
import { EntriesView } from './components/Entries/EntriesView';
import { RatesView } from './components/Rates/RatesView';
import { StorageView } from './components/Storage/StorageView';
import { SettingsView } from './components/Settings/SettingsView';
import { EntryDialog } from './components/Entries/EntryDialog';

export const App: React.FC = () => {
  const { activeTab, theme } = useBudgetStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'forecast':
        return <ForecastView />;
      case 'credit':
        return <CreditDuesView />;
      case 'entries':
        return <EntriesView onOpenAddModal={() => setIsAddModalOpen(true)} />;
      case 'rates':
        return <RatesView />;
      case 'storage':
        return <StorageView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Header onOpenAddModal={() => setIsAddModalOpen(true)} />
        <main className="page-body">
          {renderActiveView()}
        </main>
      </div>

      <EntryDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
};

export default App;
