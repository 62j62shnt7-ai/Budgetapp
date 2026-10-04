import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, useBudgetStore } from './store/useBudgetStore';
import { useAppUpdateStatus } from './hooks/useAppUpdateStatus';
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
  JobForecastModal,
} from './components/Modals/JobModals';
import { RateModal } from './components/Modals/RateModal';
import { GistSyncModal } from './components/Modals/GistSyncModal';
import { DataToolsModal } from './components/Modals/DataToolsModal';
import { DeductAccountModal } from './components/Modals/DeductAccountModal';
import { MobileActionSheet } from './components/Layout/MobileActionSheet';
import { UndoToast } from './components/Common/UndoToast';
import { autoFetchLatestRates } from './engine/currency';
import type { CashEntry, JobItem, Installment } from './types';

export const App: React.FC = () => {
  const { 
    activeTab, 
    theme, 
    sidebarCollapsed, 
    toggleSidebar, 
    closeMobileSidebar, 
    gistToken, 
    gistAutoSync, 
    setGistConfig, 
    updateRates,
    gistConflict,
    resolveGistConflict
  } = useBudgetStore();

  const [tabConflictDetected, setTabConflictDetected] = useState(false);

  // Modals state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const updateStatus = useAppUpdateStatus();
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalType, setEntryModalType] = useState<'expense' | 'income'>('expense');
  const [entryToEdit, setEntryToEdit] = useState<CashEntry | null>(null);

  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  const [installmentToEdit, setInstallmentToEdit] = useState<Installment | null>(null);

  // Job Modals
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [jobToEdit, setJobToEdit] = useState<JobItem | null>(null);
  const [logDayModalOpen, setLogDayModalOpen] = useState(false);
  const [selectedJobIdForDay, setSelectedJobIdForDay] = useState<string | null>(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedJobIdForExpense, setSelectedJobIdForExpense] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedJobIdForPayment, setSelectedJobIdForPayment] = useState<string | null>(null);
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [selectedJobIdForForecast, setSelectedJobIdForForecast] = useState<string | null>(null);

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

  // Multi-tab sync coordination. Only real user data counts as a conflict —
  // timestamp/bookkeeping keys (rate fetches, sync stamps, UI prefs) are ignored.
  useEffect(() => {
    const dataKeys = new Set<string>([
      STORAGE_KEYS.entries,
      STORAGE_KEYS.archivedEntries,
      STORAGE_KEYS.installments,
      STORAGE_KEYS.storage,
      STORAGE_KEYS.accounts,
      STORAGE_KEYS.asf,
      STORAGE_KEYS.irq,
      STORAGE_KEYS.partTimeJobs,
      STORAGE_KEYS.creditDues,
      STORAGE_KEYS.creditDueMonths,
      STORAGE_KEYS.creditSettlementOverrides,
      STORAGE_KEYS.entryActuals,
      STORAGE_KEYS.entryActualDates,
      STORAGE_KEYS.deletedForecasts,
      STORAGE_KEYS.salary,
      STORAGE_KEYS.salaryAnchor,
    ]);
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && dataKeys.has(e.key)) {
        setTabConflictDetected(true);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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
        dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"], button[aria-label="Close dialog"], button.close-dialog-btn')?.click();
      }
    };

    document.addEventListener('pointerdown', dismissModalOnOutsideClick);
    return () => document.removeEventListener('pointerdown', dismissModalOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(swUrl).catch((error) => {
      console.error('Failed to register service worker:', error);
    });
  }, []);

  useEffect(() => {
    const gistId = new URLSearchParams(window.location.hash.slice(1)).get('gist')?.trim();
    if (!gistId) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const currentGistId = useBudgetStore.getState().gistId;
    if (gistId === currentGistId) return;
    const shouldSwitch = window.confirm(
      `Switch GitHub Gist synchronization to this ID?\n\n${gistId}\n\nThis will synchronize and link your app to this remote Gist.`
    );
    if (shouldSwitch) {
      setGistConfig(gistToken, gistId, gistAutoSync);
    }
  }, [gistAutoSync, gistToken, setGistConfig]);

  // Auto-fetch live currency & gold rates and continuous multi-device sync
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

    const handleSyncAndRates = async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const state = useBudgetStore.getState();
        if (state.gistAutoSync && state.gistToken && state.gistId) {
          if (state.gistSyncStatus !== 'scheduled' && state.gistSyncStatus !== 'syncing') {
            await state.syncFromGist(state.gistToken, state.gistId);
          }
        }
        await fetchRates();
      }
    };

    void handleSyncAndRates();

    const pollInterval = setInterval(() => {
      void handleSyncAndRates();
    }, 60000);

    window.addEventListener('online', handleSyncAndRates);
    window.addEventListener('focus', handleSyncAndRates);
    document.addEventListener('visibilitychange', handleSyncAndRates);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('online', handleSyncAndRates);
      window.removeEventListener('focus', handleSyncAndRates);
      document.removeEventListener('visibilitychange', handleSyncAndRates);
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
        const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog.native-dialog[open]'));
        const dialog = openDialogs.at(-1);
        if (dialog) {
          e.preventDefault();
          const closeBtn = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"], button[aria-label="Close dialog"], button.close-dialog-btn');
          if (closeBtn) {
            closeBtn.click();
            return;
          }
        }
        closeMobileSidebar();
        return;
      }

      // Don't trigger if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Ignore auto-repeat and never fire app shortcuts while a modal is open.
      if (e.repeat) return;
      if (document.querySelector('dialog.native-dialog[open]')) return;

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

  const handleOpenJobForecast = (jobId: string) => {
    setSelectedJobIdForForecast(jobId);
    setForecastModalOpen(true);
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
        return <DeficitsView onBridgeDeficit={() => setLoanModalOpen(true)} onDeductPrompt={handleDeductPrompt} />;
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
            onOpenInstallmentModal={(inst) => {
              setInstallmentToEdit(inst || null);
              setInstallmentModalOpen(true);
            }}
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
            onOpenForecastModal={handleOpenJobForecast}
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
      {tabConflictDetected && (
        <div style={{
          background: 'var(--amber, #f59e0b)',
          color: '#000',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          zIndex: 9999,
          position: 'sticky',
          top: 0,
        }}>
          <span>⚠️ Data was updated in another browser tab.</span>
          <button
            type="button"
            style={{
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={() => window.location.reload()}
          >
            Reload to Sync
          </button>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
            onClick={() => setTabConflictDetected(false)}
          >
            ✕
          </button>
        </div>
      )}

      {gistConflict && (
        <div style={{
          background: 'var(--red, #ef4444)',
          color: '#fff',
          padding: '10px 16px',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          zIndex: 9999,
          position: 'sticky',
          top: tabConflictDetected ? '38px' : 0,
        }}>
          <span>⚠️ Cloud Conflict: Cloud backup has newer changes from another device ({gistConflict.remoteTime?.slice(0, 16).replace('T', ' ')}).</span>
          <button
            type="button"
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={() => void resolveGistConflict('local')}
          >
            Keep This Device (Overwrite Cloud)
          </button>
          <button
            type="button"
            style={{
              background: '#000',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={() => void resolveGistConflict('remote')}
          >
            Restore Cloud Copy
          </button>
        </div>
      )}

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
        installmentToEdit={installmentToEdit}
        onClose={() => {
          setInstallmentModalOpen(false);
          setInstallmentToEdit(null);
        }}
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

      <JobForecastModal
        isOpen={forecastModalOpen}
        jobId={selectedJobIdForForecast}
        onClose={() => setForecastModalOpen(false)}
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

      <UndoToast />
    </>
  );
};

export default App;
