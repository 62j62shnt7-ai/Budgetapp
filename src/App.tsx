import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STORAGE_KEYS, useBudgetStore } from './store/useBudgetStore';
import { useAppUpdateStatus } from './hooks/useAppUpdateStatus';
import { useHashRouting } from './hooks/useHashRouting';
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
import { DriveSyncModal } from './components/Modals/DriveSyncModal';
import { DataToolsModal } from './components/Modals/DataToolsModal';
import { DeductAccountModal } from './components/Modals/DeductAccountModal';
import { AccountTransferModal } from './components/Modals/AccountTransferModal';
import { QuickAddModal } from './components/Modals/QuickAddModal';
import { MobileActionSheet } from './components/Layout/MobileActionSheet';
import { UndoToast } from './components/Common/UndoToast';
import { autoFetchLatestRates } from './engine/currency';
import {
  getStoredDriveToken,
  getStoredDriveAutoSync,
  downloadBudgetFromDrive,
} from './services/googleDriveClient';
import { loadStorageAsync, saveStorage, onStorageChange } from './utils/storageAdapter';
import type { CashEntry, JobItem, Installment } from './types';

export const App: React.FC = () => {
  const { 
    activeTab, 
    theme, 
    sidebarCollapsed, 
    toggleSidebar, 
    closeMobileSidebar, 
    updateRates,
  } = useBudgetStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      theme: state.theme,
      sidebarCollapsed: state.sidebarCollapsed,
      toggleSidebar: state.toggleSidebar,
      closeMobileSidebar: state.closeMobileSidebar,
      updateRates: state.updateRates,
    }))
  );

  const [tabConflictDetected, setTabConflictDetected] = useState(false);
  useHashRouting();

  // Modals state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const updateStatus = useAppUpdateStatus();
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalType, setEntryModalType] = useState<'expense' | 'income'>('expense');
  const [entryToEdit, setEntryToEdit] = useState<CashEntry | null>(null);

  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
  const [driveSyncOpen, setDriveSyncOpen] = useState(false);
  const [dataToolsOpen, setDataToolsOpen] = useState(false);

  // Deduct prompt modal
  const [deductModalOpen, setDeductModalOpen] = useState(false);
  const [deductEntry, setDeductEntry] = useState<CashEntry | null>(null);
  const [deductActualAmount, setDeductActualAmount] = useState<number>(0);

  // Account Transfer modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromAccount, setTransferFromAccount] = useState<string | undefined>(undefined);
  const [transferToAccount, setTransferToAccount] = useState<string | undefined>(undefined);
  const [transferAmount, setTransferAmount] = useState<number | undefined>(undefined);
  const [transferReason, setTransferReason] = useState<string | undefined>(undefined);

  const handleOpenTransferModal = (from?: string, to?: string, amount?: number, reason?: string) => {
    setTransferFromAccount(from);
    setTransferToAccount(to);
    setTransferAmount(amount);
    setTransferReason(reason);
    setTransferModalOpen(true);
  };

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Initialize high-capacity IndexedDB storage and persistent undo history
  useEffect(() => {
    void useBudgetStore.getState().initStorage();
  }, []);

  // Multi-tab sync coordination using BroadcastChannel via storageAdapter.
  // Only real user data counts as a conflict — timestamp/bookkeeping keys are ignored.
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
    const unsubscribe = onStorageChange((key: string) => {
      if (key && dataKeys.has(key)) {
        setTabConflictDetected(true);
      }
    });
    return unsubscribe;
  }, []);



  useEffect(() => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(swUrl).catch((error) => {
      console.error('Failed to register service worker:', error);
    });
  }, []);



  // Auto-fetch live currency & gold rates and continuous multi-device sync
  useEffect(() => {
    let isMounted = true;
    const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    const RATES_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
    let lastBackgroundCheckTime = 0;
    let lastRatesFetchTime = 0;

    const fetchRates = async (force = false) => {
      if (!navigator.onLine) return;
      if (!force && Date.now() - lastRatesFetchTime < RATES_INTERVAL_MS) return;
      try {
        const currentRates = useBudgetStore.getState().rates;
        const updated = await autoFetchLatestRates(currentRates);
        if (updated && isMounted) {
          lastRatesFetchTime = Date.now();
          updateRates(updated);
        }
      } catch (err) {
        console.warn('Auto fetch rates skipped:', err);
      }
    };

    const handleSyncAndRates = async (options?: { isBackgroundPoll?: boolean; forceRates?: boolean }) => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        lastBackgroundCheckTime = Date.now();
        const state = useBudgetStore.getState();
        if (!state.isStorageReady) {
          await state.initStorage();
        }
        // Autonomous Google Drive Sync (Option B: My Drive / Budget Control / budget-data.json)
        const driveToken = getStoredDriveToken();
        const driveAutoSync = getStoredDriveAutoSync();
        if (driveToken && driveAutoSync) {
          try {
            // Keep idle background checks silent — do not flash 'syncing' unless actually downloading newer changes
            if (!options?.isBackgroundPoll && state.driveSyncStatus !== 'synced') {
              state.setDriveSyncStatus('syncing');
            }
            const res = await downloadBudgetFromDrive();
            if (res.success && res.payload) {
              const lastSyncTime = state.lastDriveSyncTime;
              // If remote modifiedTime matches what this device already uploaded, local state is 100% identical
              if (res.modifiedTime && lastSyncTime && res.modifiedTime === lastSyncTime) {
                state.setDriveSyncStatus('synced');
                await fetchRates(options?.forceRates);
                return;
              }

              const remoteTime = res.modifiedTime ? new Date(res.modifiedTime).getTime() : 0;
              const lastLocal = state.lastLocalModified || Number(await loadStorageAsync(STORAGE_KEYS.lastLocalModified, '0')) || 0;
              if (remoteTime > 0 && remoteTime > lastLocal + 2000) {
                state.setDriveSyncStatus('syncing');
                state.importJSON(res.payload as string, { isRemoteSync: true });
                if (res.modifiedTime) {
                  useBudgetStore.setState({ lastDriveSyncTime: res.modifiedTime });
                  saveStorage(STORAGE_KEYS.lastDriveSync, res.modifiedTime);
                }
              }
              state.setDriveSyncStatus('synced');
            } else if (!res.success && res.error && !res.error.includes("No 'budget-data.json' found")) {
              state.setDriveSyncStatus('error');
            } else {
              state.setDriveSyncStatus('synced');
            }
          } catch (err) {
            console.warn('[Google Drive auto-sync pull]:', err);
            state.setDriveSyncStatus('error');
          }
        }
        await fetchRates(options?.forceRates);
      }
    };

    void handleSyncAndRates({ isBackgroundPoll: false, forceRates: true });

    const pollInterval = setInterval(() => {
      void handleSyncAndRates({ isBackgroundPoll: true });
    }, SYNC_INTERVAL_MS);

    const onTabReactivated = () => {
      // Throttle: only check on tab return if at least 5 minutes have elapsed since the last check
      if (Date.now() - lastBackgroundCheckTime >= SYNC_INTERVAL_MS) {
        void handleSyncAndRates({ isBackgroundPoll: true });
      }
    };

    const onOnline = () => {
      void handleSyncAndRates({ isBackgroundPoll: true });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onTabReactivated);
    document.addEventListener('visibilitychange', onTabReactivated);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onTabReactivated);
      document.removeEventListener('visibilitychange', onTabReactivated);
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
        return <DashboardView onOpenTransferModal={handleOpenTransferModal} />;
      case 'deficits':
        return (
          <DeficitsView
            onBridgeDeficit={() => setLoanModalOpen(true)}
            onDeductPrompt={handleDeductPrompt}
            onOpenTransferModal={handleOpenTransferModal}
          />
        );
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
            onOpenTransferModal={handleOpenTransferModal}
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

      <Sidebar />
      <main className="app-shell has-bottom-nav">
        <Topbar
          onOpenEntryModal={handleOpenEntryModal}
          onOpenLoanModal={() => setLoanModalOpen(true)}
          onOpenDataTools={() => setDataToolsOpen(true)}
          onOpenDriveSync={() => setDriveSyncOpen(true)}
        />
        {renderActiveView()}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        onOpenMobileMenu={() => setActionSheetOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
      />

      {/* Quick Add Bottom Sheet */}
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onOpenExpense={() => handleOpenEntryModal('expense')}
        onOpenIncome={() => handleOpenEntryModal('income')}
        onOpenTransfer={() => handleOpenTransferModal()}
        onOpenLoan={() => setLoanModalOpen(true)}
      />

      {/* Global Modals */}
      <MobileActionSheet
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onOpenEntryModal={handleOpenEntryModal}
        onOpenLoanModal={() => setLoanModalOpen(true)}
        onOpenDataTools={() => setDataToolsOpen(true)}
        onOpenDriveSync={() => setDriveSyncOpen(true)}
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

      <DriveSyncModal
        isOpen={driveSyncOpen}
        onClose={() => setDriveSyncOpen(false)}
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

      <AccountTransferModal
        isOpen={transferModalOpen}
        initialFromAccount={transferFromAccount}
        initialToAccount={transferToAccount}
        initialAmount={transferAmount}
        reason={transferReason}
        onClose={() => setTransferModalOpen(false)}
      />

      <UndoToast />
    </>
  );
};

export default App;
