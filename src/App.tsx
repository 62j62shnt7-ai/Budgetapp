import React, { useState, useEffect } from 'react';
import { useBudgetStore } from './store/useBudgetStore';
import { Topbar } from './components/Layout/Topbar';
import { Sidebar } from './components/Layout/Sidebar';
import { BottomNav } from './components/Layout/BottomNav';

// 8 Views
import { DashboardView } from './components/Dashboard/DashboardView';
import { DeficitsView } from './components/Deficits/DeficitsView';
import { CashflowView } from './components/Cashflow/CashflowView';
import { HistoryView } from './components/History/HistoryView';
import { AccountsView } from './components/Accounts/AccountsView';
import { StorageView } from './components/Storage/StorageView';
import { JobsView } from './components/Jobs/JobsView';
import { RatesView } from './components/Rates/RatesView';

// Modals
import { EntryModal } from './components/Modals/EntryModal';
import { LoanBridgeModal } from './components/Modals/LoanBridgeModal';
import { StorageModal } from './components/Modals/StorageModal';
import { InstallmentModal } from './components/Modals/InstallmentModal';
import {
  JobFormModal,
  JobLogDayModal,
  JobExpenseModal,
  JobPaymentModal,
} from './components/Modals/JobModals';
import { RateModal } from './components/Modals/RateModal';
import { GistSyncModal } from './components/Modals/GistSyncModal';
import { DataToolsModal } from './components/Modals/DataToolsModal';
import { DeductAccountModal } from './components/Modals/DeductAccountModal';
import { MobileActionSheet } from './components/Layout/MobileActionSheet';
import { autoFetchLatestRates } from './engine/currency';
import type { CashEntry, JobItem } from './types';

export const App: React.FC = () => {
  const { 
    activeTab, 
    theme, 
    sidebarCollapsed, 
    toggleSidebar, 
    closeMobileSidebar, 
    gistToken, 
    gistId, 
    gistAutoSync, 
    setGistConfig, 
    syncFromGist,
    updateRates
  } = useBudgetStore();

  // Modals state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('Latest');
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalType, setEntryModalType] = useState<'expense' | 'income'>('expense');
  const [entryToEdit, setEntryToEdit] = useState<CashEntry | null>(null);

  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);

  // Job Modals
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [jobToEdit, setJobToEdit] = useState<JobItem | null>(null);
  const [logDayModalOpen, setLogDayModalOpen] = useState(false);
  const [selectedJobIdForDay, setSelectedJobIdForDay] = useState<string | null>(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedJobIdForExpense, setSelectedJobIdForExpense] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedJobIdForPayment, setSelectedJobIdForPayment] = useState<string | null>(null);

  // Rate Modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateModalType, setRateModalType] = useState<'currency' | 'gold'>('currency');

  // Sync & Tools
  const [gistSyncOpen, setGistSyncOpen] = useState(false);
  const [dataToolsOpen, setDataToolsOpen] = useState(false);

  // Deduct prompt modal
  const [deductModalOpen, setDeductModalOpen] = useState(false);
  const [deductEntry, setDeductEntry] = useState<CashEntry | null>(null);
  const [deductActualAmount, setDeductActualAmount] = useState<number>(0);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setUpdateStatus('Offline');
        return;
      }
      if (!('serviceWorker' in navigator)) {
        setUpdateStatus('Latest');
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      setUpdateStatus(registration?.waiting ? 'Update ready' : 'Latest');
    };
    void checkStatus();
    window.addEventListener('online', checkStatus);
    window.addEventListener('offline', checkStatus);
    return () => {
      window.removeEventListener('online', checkStatus);
      window.removeEventListener('offline', checkStatus);
    };
  }, []);

  useEffect(() => {
    const dismissModalOnOutsideClick = (event: PointerEvent) => {
      const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog.native-dialog[open]'));
      const dialog = openDialogs.at(-1);
      if (!dialog) return;

      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
      }
    };

    document.addEventListener('pointerdown', dismissModalOnOutsideClick);
    return () => document.removeEventListener('pointerdown', dismissModalOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Failed to register service worker:', error);
    });
  }, []);

  useEffect(() => {
    if (!gistToken || !gistId || sessionStorage.getItem('gist_auto_pulled') === 'true') return;
    sessionStorage.setItem('gist_auto_pulled', 'true');
    void syncFromGist(gistToken, gistId);
  }, [gistId, gistToken, syncFromGist]);

  useEffect(() => {
    const gistId = new URLSearchParams(window.location.hash.slice(1)).get('gist')?.trim();
    if (!gistId) return;
    setGistConfig(gistToken, gistId, gistAutoSync);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [gistAutoSync, gistToken, setGistConfig]);

  // Auto-fetch live currency and gold rates on launch / online
  useEffect(() => {
    let isMounted = true;
    const fetchRates = async () => {
      if (!navigator.onLine) return;
      try {
        const currentRates = useBudgetStore.getState().rates;
        const updated = await autoFetchLatestRates(currentRates);
        if (updated && isMounted) {
          updateRates(updated);
        }
      } catch (err) {
        console.warn('Auto fetch rates skipped:', err);
      }
    };

    void fetchRates();

    const handleOnline = () => {
      void fetchRates();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
    };
  }, [updateRates]);

  // Synchronize sidebar collapsed state to body class
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', Boolean(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileSidebar();
      }

      // Don't trigger if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setEntryModalType('expense');
        setEntryToEdit(null);
        setEntryModalOpen(true);
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setEntryModalType('income');
        setEntryToEdit(null);
        setEntryModalOpen(true);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setLoanModalOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        if (activeTab === 'history') {
          const s = document.getElementById('historySearch') as HTMLInputElement | null;
          if (s) {
            s.focus();
            s.select?.();
          }
        } else {
          const s = (document.getElementById('searchEntries') || document.getElementById('cfSearch')) as HTMLInputElement | null;
          if (s) {
            s.focus();
            s.select?.();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, closeMobileSidebar, activeTab]);

  const handleOpenEntryModal = (type: 'expense' | 'income') => {
    setEntryModalType(type);
    setEntryToEdit(null);
    setEntryModalOpen(true);
  };

  const handleOpenJobModal = (job?: JobItem) => {
    setJobToEdit(job || null);
    setJobModalOpen(true);
  };

  const handleOpenLogDay = (jobId: string) => {
    setSelectedJobIdForDay(jobId);
    setLogDayModalOpen(true);
  };

  const handleOpenJobExpense = (jobId: string) => {
    setSelectedJobIdForExpense(jobId);
    setExpenseModalOpen(true);
  };

  const handleOpenJobPayment = (jobId: string) => {
    setSelectedJobIdForPayment(jobId);
    setPaymentModalOpen(true);
  };

  const handleOpenRateModal = (type: 'currency' | 'gold') => {
    setRateModalType(type);
    setRateModalOpen(true);
  };

  const handleDeductPrompt = (entry: CashEntry, actualAmount: number) => {
    setDeductEntry(entry);
    setDeductActualAmount(actualAmount);
    setDeductModalOpen(true);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'deficits':
        return <DeficitsView onBridgeDeficit={() => setLoanModalOpen(true)} />;
      case 'cashflow':
        return (
          <CashflowView
            onOpenEntryModal={handleOpenEntryModal}
            onEditEntry={(entry) => {
              setEntryToEdit(entry);
              setEntryModalType(entry.type);
              setEntryModalOpen(true);
            }}
            onDeductPrompt={handleDeductPrompt}
            onOpenInstallmentModal={() => setInstallmentModalOpen(true)}
          />
        );
      case 'history':
        return (
          <HistoryView
            onEditEntry={(entry) => {
              setEntryToEdit(entry);
              setEntryModalType(entry.type);
              setEntryModalOpen(true);
            }}
          />
        );
      case 'accounts':
        return <AccountsView />;
      case 'storage':
        return <StorageView onOpenStorageModal={() => setStorageModalOpen(true)} />;
      case 'jobs':
        return (
          <JobsView
            onOpenJobModal={handleOpenJobModal}
            onOpenLogDayModal={handleOpenLogDay}
            onOpenExpenseModal={handleOpenJobExpense}
            onOpenPaymentModal={handleOpenJobPayment}
          />
        );
      case 'rates':
        return <RatesView onOpenRateModal={handleOpenRateModal} />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <>
      <Sidebar />
      <main className="app-shell has-bottom-nav">
        <Topbar
          onOpenEntryModal={handleOpenEntryModal}
          onOpenLoanModal={() => setLoanModalOpen(true)}
          onOpenDataTools={() => setDataToolsOpen(true)}
          onOpenGistSync={() => setGistSyncOpen(true)}
        />
        {renderActiveView()}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav onOpenMobileMenu={() => setActionSheetOpen(true)} />

      {/* Global Modals */}
      <MobileActionSheet
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onOpenEntryModal={handleOpenEntryModal}
        onOpenLoanModal={() => setLoanModalOpen(true)}
        onOpenDataTools={() => setDataToolsOpen(true)}
        onOpenGistSync={() => setGistSyncOpen(true)}
        updateStatus={updateStatus}
      />

      <EntryModal
        isOpen={entryModalOpen}
        initialType={entryModalType}
        entryToEdit={entryToEdit}
        onClose={() => setEntryModalOpen(false)}
        onDeductPrompt={handleDeductPrompt}
      />

      <LoanBridgeModal
        isOpen={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
      />

      <StorageModal
        isOpen={storageModalOpen}
        onClose={() => setStorageModalOpen(false)}
      />

      <InstallmentModal
        isOpen={installmentModalOpen}
        onClose={() => setInstallmentModalOpen(false)}
      />

      <JobFormModal
        isOpen={jobModalOpen}
        jobToEdit={jobToEdit}
        onClose={() => setJobModalOpen(false)}
      />

      <JobLogDayModal
        isOpen={logDayModalOpen}
        jobId={selectedJobIdForDay}
        onClose={() => setLogDayModalOpen(false)}
      />

      <JobExpenseModal
        isOpen={expenseModalOpen}
        jobId={selectedJobIdForExpense}
        onClose={() => setExpenseModalOpen(false)}
      />

      <JobPaymentModal
        isOpen={paymentModalOpen}
        jobId={selectedJobIdForPayment}
        onClose={() => setPaymentModalOpen(false)}
      />

      <RateModal
        isOpen={rateModalOpen}
        rateType={rateModalType}
        onClose={() => setRateModalOpen(false)}
      />

      <GistSyncModal
        isOpen={gistSyncOpen}
        onClose={() => setGistSyncOpen(false)}
      />

      <DataToolsModal
        isOpen={dataToolsOpen}
        onClose={() => setDataToolsOpen(false)}
      />

      <DeductAccountModal
        isOpen={deductModalOpen}
        entry={deductEntry}
        actualAmount={deductActualAmount}
        onClose={() => setDeductModalOpen(false)}
      />
    </>
  );
};

export default App;
