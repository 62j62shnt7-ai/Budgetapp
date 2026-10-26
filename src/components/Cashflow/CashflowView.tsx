import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  buildSalaryEntries,
  buildInstallmentEntries,
  calculateInstallmentProgress,
  summarizeActiveInstallments,
} from '../../engine/salaryAndInstallments';
import {
  buildCreditDueEntries,
  calculateCreditSettlementDate,
  isCreditCardExpense,
  isCreditDueLumpSum,
} from '../../engine/creditCards';
import {
  getEntryActualAmount,
  getEntryActualDate,
  getActiveForecastEntries,
  getForecastCandidateEntries,
  getRemainingForecastAmount,
  isPartialTracked,
  isOngoingEntry,
  isLoanInflow,
  findLinkedLoanRepayment,
  calculateLoanRepaymentScale,
  getDeficitPeriods,
  calculateForecastRunningBalances,
  getEntryId,
} from '../../engine/forecast';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency, getCurrencyRateOr } from '../../engine/currency';
import { getEntryTags } from '../../engine/tags';
import {
  Plus,
  Calendar,
  Layers,
  Banknote,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Check,
} from 'lucide-react';
import { loadStorageSync, saveStorage } from '../../utils/storageAdapter';
import { LedgerFilterBar } from '../Common/LedgerFilterBar';
import { showAppNotice, requestAppConfirm } from '../Common/UndoToast';

import type { CashEntry, Installment } from '../../types';
import { ExactAmountDecisionModal } from '../Modals/ExactAmountDecisionModal';
import { AdjustLoanRepaymentModal, type LinkedRepaymentInfo } from '../Modals/AdjustLoanRepaymentModal';
import { AffectedRecordsModal } from '../Modals/AffectedRecordsModal';
import {
  buildEntryDeleteOptions,
  buildInstallmentDeleteOptions,
  hasEntryAffectedParties,
} from '../../utils/affectedRecords';
import { SalaryStructureSection } from './SalaryStructureSection';
import { InstallmentsSection } from './InstallmentsSection';
import { ExpenseMixSection } from './ExpenseMixSection';
import { getCreditDueFundingAlerts } from '../../engine/creditDueAlerts';
import type { CreditDueFundingAlert } from '../../types';

interface CashflowViewProps {
  onOpenEntryModal: (type: 'expense' | 'income') => void;
  onEditEntry?: (entry: CashEntry) => void;
  onDeductPrompt?: (entry: CashEntry, actualAmount: number) => void;
  onOpenTransferModal?: (from?: string, to?: string, amount?: number, reason?: string) => void;
  onOpenInstallmentModal: (inst?: Installment) => void;
}

export const CashflowView: React.FC<CashflowViewProps> = ({
  onOpenEntryModal,
  onEditEntry,
  onDeductPrompt,
  onOpenTransferModal,
  onOpenInstallmentModal,
}) => {
  const {
    accounts,
    entries,
    updateEntry,
    deleteEntry,
    salaryPattern,
    salaryAnchorMonth,
    updateSalaryPattern,
    populateSalaryForecast,
    clearSalaryForecast,
    installments,
    updateInstallment,
    deleteInstallment,
    creditDues,
    creditSettlementOverrides,
    archivedEntries,
    entryActuals,
    entryActualDates,
    deletedForecasts,
    recordActual,
    settleJobForecastPayment,
    runTransaction,
    rates,
    storageAssets,
    partTimeJobs,
    setActiveTab,
    pendingNavigation,
    clearPendingNavigation,
    salaryCollapsed,
    installmentsCollapsed,
    expenseMixCollapsed,
    setSalaryCollapsed,
    setInstallmentsCollapsed,
    setExpenseMixCollapsed,
  } = useBudgetStore(
    useShallow((state) => ({
      accounts: state.accounts,
      entries: state.entries,
      updateEntry: state.updateEntry,
      deleteEntry: state.deleteEntry,
      salaryPattern: state.salaryPattern,
      salaryAnchorMonth: state.salaryAnchorMonth,
      updateSalaryPattern: state.updateSalaryPattern,
      populateSalaryForecast: state.populateSalaryForecast,
      clearSalaryForecast: state.clearSalaryForecast,
      installments: state.installments,
      updateInstallment: state.updateInstallment,
      deleteInstallment: state.deleteInstallment,
      creditDues: state.creditDues,
      creditSettlementOverrides: state.creditSettlementOverrides,
      archivedEntries: state.archivedEntries,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
      recordActual: state.recordActual,
      settleJobForecastPayment: state.settleJobForecastPayment,
      runTransaction: state.runTransaction,
      rates: state.rates,
      storageAssets: state.storageAssets,
      partTimeJobs: state.partTimeJobs,
      setActiveTab: state.setActiveTab,
      pendingNavigation: state.pendingNavigation,
      clearPendingNavigation: state.clearPendingNavigation,
      salaryCollapsed: state.salaryCollapsed,
      installmentsCollapsed: state.installmentsCollapsed,
      expenseMixCollapsed: state.expenseMixCollapsed,
      setSalaryCollapsed: state.setSalaryCollapsed,
      setInstallmentsCollapsed: state.setInstallmentsCollapsed,
      setExpenseMixCollapsed: state.setExpenseMixCollapsed,
    }))
  );

  const initialMonth = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.month
    ? pendingNavigation.filters.month
    : 'all';
  const initialType = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.type
    ? pendingNavigation.filters.type
    : 'all';
  const initialCategory = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.category
    ? pendingNavigation.filters.category
    : 'all';
  const initialAccount = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.account
    ? pendingNavigation.filters.account
    : 'all';
  const initialTag = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.tag
    ? pendingNavigation.filters.tag
    : 'all';
  const initialSearch = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.search
    ? pendingNavigation.filters.search
    : '';
  const initialHighlightId = pendingNavigation?.tab === 'cashflow' && pendingNavigation.filters?.highlightId
    ? pendingNavigation.filters.highlightId
    : null;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>(initialType);
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [selectedAccount, setSelectedAccount] = useState<string>(initialAccount);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(initialHighlightId);
  const [highlightTrigger, setHighlightTrigger] = useState(0);
  const [activeCashflowSubTab, setActiveCashflowSubTab] = useState<'forecast' | 'setup'>('forecast');
  const [showDateRangeFilter, setShowDateRangeFilter] = useState(false);

  // Respond to programmatic navigation intents
  const [prevNav, setPrevNav] = useState(pendingNavigation);
  if (pendingNavigation && pendingNavigation.tab === 'cashflow' && pendingNavigation !== prevNav) {
    setPrevNav(pendingNavigation);
    const f = pendingNavigation.filters;
    if (f) {
      setSelectedMonth(f.month !== undefined ? f.month : 'all');
      setCategoryFilter(f.category !== undefined ? f.category : 'all');
      setTypeFilter(f.type !== undefined ? f.type : 'all');
      setSelectedAccount(f.account !== undefined ? f.account : 'all');
      setSelectedTag(f.tag !== undefined ? f.tag : 'all');
      setSearchTerm(f.search !== undefined ? f.search : '');
      setDateFrom('');
      setDateTo('');
      if (f.highlightId) {
        setHighlightedEntryId(f.highlightId);
        setHighlightTrigger((c) => c + 1);
      }
    }
  }

  useEffect(() => {
    if (pendingNavigation && pendingNavigation.tab === 'cashflow') {
      clearPendingNavigation();
    }
  }, [pendingNavigation, clearPendingNavigation]);

  useEffect(() => {
    if (!highlightedEntryId) return;

    const scrollToTarget = () => {
      const row =
        document.getElementById(`cashflow-row-${highlightedEntryId}`) ||
        (typeof CSS !== 'undefined' && CSS?.escape
          ? document.querySelector(`[data-entry-id="${CSS.escape(highlightedEntryId)}"]`) ||
            document.querySelector(`[data-legacy-id="${CSS.escape(highlightedEntryId)}"]`)
          : null);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    };

    const timer = setTimeout(() => {
      if (!scrollToTarget()) {
        setTimeout(scrollToTarget, 180);
      }
    }, 100);

    const clearGlowTimer = setTimeout(() => {
      setHighlightedEntryId(null);
    }, 3500);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearGlowTimer);
    };
  }, [highlightedEntryId, highlightTrigger]);

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setTypeFilter('all');
    setCategoryFilter('all');
    setSelectedAccount('all');
    setSelectedTag('all');
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTag((current) => (current.toLowerCase() === tag.toLowerCase() ? 'all' : tag));
  };

  const handleCategoryFilter = (cat: string) => {
    setCategoryFilter((current) => (current === cat ? 'all' : cat));
  };

  const handleAccountFilter = (acc: string) => {
    setSelectedAccount((current) => (current.toLowerCase() === acc.toLowerCase() ? 'all' : acc.toLowerCase()));
  };

  // Delete targets for AffectedRecordsModal
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<CashEntry | null>(null);
  const [deleteInstallmentTarget, setDeleteInstallmentTarget] = useState<Installment | null>(null);

  // Decision Modals state
  const [loanAdjustmentData, setLoanAdjustmentData] = useState<{
    inflowEntry: CashEntry;
    linkedInfo: LinkedRepaymentInfo;
    totalDrawn: number;
    plannedLoan: number;
  } | null>(null);

  const [exactDecisionData, setExactDecisionData] = useState<{
    entry: CashEntry;
    actualAmount: number;
    plannedAmount: number;
    linkedRepayment?: {
      name: string;
      currentAmount: number;
      scaledAmount: number;
      isInstallment: boolean;
      months?: number;
    } | null;
  } | null>(null);

  const pendingDeductRef = React.useRef<{ entry: CashEntry; amount: number } | null>(null);
  const flushPendingDeduct = () => {
    const pending = pendingDeductRef.current;
    pendingDeductRef.current = null;
    if (pending && onDeductPrompt) onDeductPrompt(pending.entry, pending.amount);
  };

  const getLinkedRepaymentOption = (entry: CashEntry, drawnAmount: number) => {
    if (!isLoanInflow(entry)) return null;
    const linked = findLinkedLoanRepayment(entry, entries, installments);
    if (!linked) return null;
    const scaleCalc = calculateLoanRepaymentScale(entry, linked, drawnAmount);
    if (!scaleCalc) return null;
    return {
      name: linked.type === 'single' ? linked.target.category : linked.target.name,
      currentAmount: scaleCalc.currentAmount,
      scaledAmount: scaleCalc.scaledAmount,
      isInstallment: linked.type === 'installment',
      months: scaleCalc.months,
    };
  };

  const handleActualSpend = (entry: CashEntry, addedAmount: number, currentActual: number) => {
    const newActual = currentActual + addedAmount;
    recordActual(entry.id, newActual, DateUtils.todayString());
    // Decision modals are top-layer and would hide the deduct dialog, so the
    // deduct prompt is queued and flushed once those modals are resolved.
    // Credit card spending settles on the credit due date and must not deduct from liquid accounts immediately.
    if (!isCreditCardExpense(entry)) {
      pendingDeductRef.current = { entry, amount: addedAmount };
    }
    if (isLoanInflow(entry)) {
      const linked = findLinkedLoanRepayment(entry, entries, installments);
      if (linked) {
        const scaleCalc = calculateLoanRepaymentScale(entry, linked, newActual);
        if (scaleCalc) {
          const plannedLoan = scaleCalc.baseDisbursement;
          setLoanAdjustmentData({
            inflowEntry: entry,
            linkedInfo:
              linked.type === 'single'
                ? {
                    type: 'single',
                    target: linked.target,
                    scaledAmount: scaleCalc.scaledAmount,
                    currentAmount: scaleCalc.currentAmount,
                    isScaleUp: scaleCalc.isScaleUp,
                  }
                : {
                    type: 'installment',
                    target: linked.target,
                    scaledAmount: scaleCalc.scaledAmount,
                    currentAmount: scaleCalc.currentAmount,
                    months: scaleCalc.months || 1,
                    isScaleUp: scaleCalc.isScaleUp,
                  },
            totalDrawn: newActual,
            plannedLoan,
          });
          return;
        }
      }
    }

    const isForeign = Boolean(entry.currency && entry.currency.toUpperCase() !== 'EGP');
    const fxRate = entry.fxRateAtEntry || getCurrencyRateOr(rates, entry.currency, 48.5);
    const effectivePlannedAmount = isForeign && entry.originalAmount
      ? Math.round(entry.originalAmount * fxRate)
      : Number(entry.amount || 0);

    if (newActual >= effectivePlannedAmount && effectivePlannedAmount > 0 && !entry.isClosed) {
      setExactDecisionData({
        entry,
        actualAmount: newActual,
        plannedAmount: effectivePlannedAmount,
        linkedRepayment: getLinkedRepaymentOption(entry, newActual),
      });
      return;
    }
    flushPendingDeduct();
  };

  const handleScaleLoanRepayment = (scaledAmount: number) => {
    if (!loanAdjustmentData) return;
    const { inflowEntry, linkedInfo, totalDrawn, plannedLoan } = loanAdjustmentData;
    runTransaction(`Scale Loan Repayment: ${inflowEntry.category}`, () => {
      // Ensure initialAmount is preserved on both disbursement and repayment
      if (!inflowEntry.initialAmount && plannedLoan > 0) {
        updateEntry(inflowEntry.id, { initialAmount: plannedLoan }, 'single', { skipLoanScaling: true });
      }
      if (linkedInfo.type === 'single') {
        const baseRep = Number(linkedInfo.target.initialAmount || linkedInfo.target.amount || 0);
        updateEntry(linkedInfo.target.id, { amount: scaledAmount, initialAmount: baseRep });
      } else {
        const baseRep = Number(linkedInfo.target.initialAmount || linkedInfo.target.amount || 0);
        updateInstallment(linkedInfo.target.id, { amount: scaledAmount, initialAmount: baseRep });
      }
    });
    setLoanAdjustmentData(null);

    if (totalDrawn >= plannedLoan && plannedLoan > 0 && !inflowEntry.isClosed) {
      setExactDecisionData({
        entry: inflowEntry,
        actualAmount: totalDrawn,
        plannedAmount: plannedLoan,
        linkedRepayment: getLinkedRepaymentOption(inflowEntry, totalDrawn),
      });
      return;
    }
    flushPendingDeduct();
  };

  const handleKeepLoanRepayment = () => {
    if (!loanAdjustmentData) return;
    const { inflowEntry, totalDrawn, plannedLoan } = loanAdjustmentData;
    setLoanAdjustmentData(null);

    if (totalDrawn >= plannedLoan && plannedLoan > 0 && !inflowEntry.isClosed) {
      setExactDecisionData({
        entry: inflowEntry,
        actualAmount: totalDrawn,
        plannedAmount: plannedLoan,
        linkedRepayment: getLinkedRepaymentOption(inflowEntry, totalDrawn),
      });
      return;
    }
    flushPendingDeduct();
  };

  const handleFinishEntry = (options?: { scaleLinkedLoan?: boolean }) => {
    if (!exactDecisionData) return;
    const { entry, actualAmount } = exactDecisionData;
    const shouldScale = options?.scaleLinkedLoan !== false;
    const baseDisbursement = Number(entry.initialAmount || entry.amount || 0);

    runTransaction(`Finish Entry: ${entry.category}`, () => {
      // 1. Close entry with finalized amount, safely preserving initialAmount and skipping raw store scaling
      updateEntry(
        entry.id,
        {
          isClosed: true,
          keepOngoing: false,
          amount: actualAmount,
          initialAmount: baseDisbursement,
        },
        'single',
        { skipLoanScaling: true }
      );
      settleJobForecastPayment(entry.id, actualAmount, true);

      // 2. Scale linked loan repayment cleanly if user elected to scale
      if (shouldScale && isLoanInflow(entry)) {
        const linked = findLinkedLoanRepayment(entry, entries, installments);
        if (linked) {
          const scaleCalc = calculateLoanRepaymentScale(entry, linked, actualAmount);
          if (scaleCalc) {
            if (linked.type === 'single') {
              const baseRep = Number(linked.target.initialAmount || linked.target.amount || 0);
              updateEntry(linked.target.id, { amount: scaleCalc.scaledAmount, initialAmount: baseRep });
            } else {
              const baseRep = Number(linked.target.initialAmount || linked.target.amount || 0);
              updateInstallment(linked.target.id, { amount: scaleCalc.scaledAmount, initialAmount: baseRep });
            }
          }
        }
      }
    });

    setExactDecisionData(null);
    flushPendingDeduct();
  };

  const handleKeepEntry = () => {
    if (!exactDecisionData) return;
    const { entry } = exactDecisionData;
    updateEntry(entry.id, { keepOngoing: true, isClosed: false });
    setExactDecisionData(null);
    flushPendingDeduct();
  };

  // Collapsible sections connected to Zustand UI slice
  const salaryOpen = !salaryCollapsed;
  const setSalaryOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(salaryOpen) : open;
    setSalaryCollapsed(!next);
  };

  const installmentsOpen = !installmentsCollapsed;
  const setInstallmentsOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(installmentsOpen) : open;
    setInstallmentsCollapsed(!next);
  };

  const expenseMixOpen = !expenseMixCollapsed;
  const setExpenseMixOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(expenseMixOpen) : open;
    setExpenseMixCollapsed(!next);
  };

  // Salary matrix inputs
  const currentYm = DateUtils.currentYearMonth();
  const [startMonth, setStartMonth] = useState(() =>
    loadStorageSync<string>('budget-control-forecast-start-month', '') || currentYm
  );
  const [quarters, setQuarters] = useState(() => {
    const stored = Number(loadStorageSync<string | number>('budget-control-forecast-quarters', 12));
    return Number.isFinite(stored) && stored > 0 ? Math.min(24, Math.max(1, stored)) : 12;
  });

  useEffect(() => {
    saveStorage('budget-control-forecast-start-month', startMonth || currentYm);
  }, [startMonth, currentYm]);

  useEffect(() => {
    saveStorage('budget-control-forecast-quarters', String(quarters));
  }, [quarters]);

  const {
    creditEntries,
    allCandidate,
    forecastRows,
  } = React.useMemo(() => {
    const hasMaterialized = entries.some((e) => e.source === 'salary');
    const salary = hasMaterialized ? [] : buildSalaryEntries(salaryPattern, startMonth, quarters, salaryAnchorMonth);
    const installment = buildInstallmentEntries(installments);
    const credit = buildCreditDueEntries({
      accounts,
      creditDues,
      cashEntries: entries,
      archivedEntries,
      entryActuals,
      entryActualDates,
      creditSettlementOverrides,
    });
    const candidates = getForecastCandidateEntries(
      [...entries, ...salary],
      installment,
      credit,
      deletedForecasts,
    );
    const candidateList = candidates
      .filter((entry) => !entry.isClosed)
      .filter((entry) => {
        const actual = getEntryActualAmount(entry, entryActuals);
        if (actual <= 0) return true;
        if ((entry as CashEntry & { keepOngoing?: boolean }).keepOngoing) return true;
        if ((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1)) return true;
        return isPartialTracked(entry) && getRemainingForecastAmount(entry, entryActuals) > 0;
      });
    const rows = getActiveForecastEntries(
      [...entries, ...salary],
      installment,
      credit,
      deletedForecasts,
      entryActuals,
    );
    // Expand candidateList for table view so split ghost rows show on their respective dates
    const expandedCandidateList = candidateList.flatMap((entry) => {
      const isStrict =
        entry.id.startsWith('credit-settlement-') ||
        entry.id.startsWith('installment-') ||
        isCreditDueLumpSum(entry) ||
        entry.tag === 'Loan Repayment' ||
        entry.subcategory === 'Loan Repayment' ||
        Boolean(entry.loanId && entry.type === 'expense');

      const isOverdueInc = entry.type === 'income' && !isOngoingEntry(entry, entryActuals);
      const hasSplits =
        !isStrict &&
        !isOverdueInc &&
        ((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1));

      if (hasSplits) {
        const remaining = isPartialTracked(entry) && getEntryActualAmount(entry, entryActuals) > 0
          ? getRemainingForecastAmount(entry, entryActuals)
          : Number(entry.amount || 0);
        let effDate = entry.date;
        const today = DateUtils.todayString();
        if (isPartialTracked(entry) && effDate && effDate < today && remaining > 0) {
          effDate = today;
        }
        const matchingRows = rows.filter((r) => r.id === entry.id || r.parentEntryId === entry.id);
        if (matchingRows.length > 0) {
          return matchingRows;
        }
        if (entry.keepOngoing && !entry.isClosed) {
          return [{
            ...entry,
            date: effDate < today ? today : effDate,
            amount: 0,
          }];
        }
        return [];
      }
      return [entry];
    });

    return {
      salaryEntries: salary,
      installmentEntries: installment,
      creditEntries: credit,
      forecastCandidates: candidates,
      allCandidate: expandedCandidateList,
      forecastRows: rows,
    };
  }, [
    entries,
    salaryPattern,
    startMonth,
    quarters,
    salaryAnchorMonth,
    installments,
    accounts,
    creditDues,
    archivedEntries,
    entryActuals,
    entryActualDates,
    creditSettlementOverrides,
    deletedForecasts,
  ]);

  const creditFundingAlertsMap = React.useMemo(() => {
    const alerts = getCreditDueFundingAlerts({
      creditDueEntries: creditEntries,
      accounts,
      entryActuals,
      candidateEntries: forecastRows,
    });
    const map = new Map<string, CreditDueFundingAlert>();
    alerts.forEach((a) => map.set(a.entryId, a));
    return map;
  }, [creditEntries, accounts, entryActuals, forecastRows]);


  // Opening balance rows (matching legacy openingBalanceEntries)
  const openingRows: CashEntry[] = Object.entries(accounts || {}).map(([id, acc]) => ({
    id: `opening-${id}`,
    date: DateUtils.todayString(),
    category: `${acc.name} Opening Balance`,
    account: id,
    type: 'income',
    amount: Number(acc.balance) || 0,
    source: 'starting balance',
    locked: true,
  }));

  // Months list for dropdown
  const monthSet = new Set<string>();
  allCandidate.forEach((e) => {
    if (e.date) {
      const ym = DateUtils.getMonthKey(e.date);
      if (ym) monthSet.add(ym);
    }
  });
  const orderedMonths = Array.from(monthSet).sort();

  // Accounts list for dropdown
  const accountSet = new Set<string>();
  Object.keys(accounts || {}).forEach((acc) => accountSet.add(acc.toLowerCase()));
  allCandidate.forEach((e) => {
    if (e.account) accountSet.add(e.account.toLowerCase());
  });
  const allAccounts = Array.from(accountSet).sort();

  // Tags list for dropdown
  const tagSet = new Set<string>();
  let hasUntagged = false;
  allCandidate.forEach((e) => {
    const entryTags = getEntryTags(e);
    if (entryTags.length > 0) {
      entryTags.forEach((t) => tagSet.add(t));
    } else {
      hasUntagged = true;
    }
  });
  const allTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  // Categories list for dropdown
  const categorySet = new Set<string>();
  Object.values(accounts || {}).forEach((acc) => {
    if (acc.name) categorySet.add(`${acc.name} Opening Balance`);
  });
  allCandidate.forEach((e) => {
    if (e.category) categorySet.add(e.category);
  });
  const allCategories = Array.from(categorySet).sort();

  // Filter entries
  const filteredForecastRows = allCandidate.filter((e) => {
    if (selectedMonth !== 'all' && DateUtils.getMonthKey(e.date) !== selectedMonth) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (selectedAccount !== 'all' && (e.account || '').toLowerCase() !== selectedAccount.toLowerCase()) return false;

    if (selectedTag !== 'all') {
      const eTags = getEntryTags(e).map((t) => t.toLowerCase());
      if (selectedTag === '__untagged__') {
        if (eTags.length > 0) return false;
      } else if (!eTags.includes(selectedTag.toLowerCase())) {
        return false;
      }
    }

    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        e.category.toLowerCase().includes(term) ||
        (e.subcategory && e.subcategory.toLowerCase().includes(term)) ||
        (e.tag && e.tag.toLowerCase().includes(term)) ||
        e.account.toLowerCase().includes(term) ||
        (e.source && e.source.toLowerCase().includes(term))
      );
    }
    return true;
  }).sort((a, b) => {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
    return 0;
  });

  const filteredOpeningRows = openingRows.filter((e) => {
    if (selectedMonth !== 'all' && DateUtils.getMonthKey(e.date) !== selectedMonth) return false;
    if (typeFilter === 'expense') return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (selectedAccount !== 'all' && (e.account || '').toLowerCase() !== selectedAccount.toLowerCase()) return false;
    if (selectedTag !== 'all' && selectedTag !== '__untagged__') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return e.category.toLowerCase().includes(term) || e.account.toLowerCase().includes(term);
    }
    return true;
  });

  const allDisplayRows = [...filteredOpeningRows, ...filteredForecastRows];

  // Helper to determine the remaining forecast amount for candidate entries
  const getCandidateForecastAmount = (e: CashEntry): number => {
    // If entry is an expanded split slice, its amount is already the remaining slice amount
    if (e.parentEntryId || Boolean(e.splitTotalCount && e.splitTotalCount > 1)) {
      return Number(e.amount || 0);
    }
    if (isPartialTracked(e)) {
      return getRemainingForecastAmount(e, entryActuals);
    }
    return Number(e.amount || 0);
  };

  // Only real forecast rows (not synthetic bank balance rows) count towards period income
  const filteredIncome = filteredForecastRows
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + getCandidateForecastAmount(e), 0);

  // Credit card purchases are already rolled up in credit-settlement-* rows; exclude them to avoid double-counting
  const filteredExpenses = filteredForecastRows
    .filter((e) => e.type === 'expense' && !isCreditCardExpense(e))
    .reduce((sum, e) => sum + getCandidateForecastAmount(e), 0);

  const filteredNet = filteredIncome - filteredExpenses;

  const isAnyFilterActive =
    selectedMonth !== 'all' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all' ||
    selectedAccount !== 'all' ||
    selectedTag !== 'all' ||
    Boolean(searchTerm) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const totalCash = Object.values(accounts || {}).reduce(
    (sum, acc) => sum + (Number(acc.balance) || 0),
    0
  );

  // Authoritative running balance map computed over the complete forecast sequence (immune to active UI filters)
  const entryRunningBalanceMap = React.useMemo(() => {
    return calculateForecastRunningBalances(forecastRows, totalCash);
  }, [forecastRows, totalCash]);
  // Pass forecastRows (active forecast) rather than allCandidate to avoid double-counting card swipes + settlements
  const deficitPeriods = getDeficitPeriods(forecastRows, totalCash);
  const entryStatusMap = new Map<string, { type: 'deficit' | 'recovery'; balance: number }>();
  deficitPeriods.forEach((period) => {
    (period.steps || []).forEach((step) => {
      if (step.entryId) {
        if (step.isRecoveryStep) {
          entryStatusMap.set(step.entryId, { type: 'recovery', balance: step.balance });
        } else {
          entryStatusMap.set(step.entryId, { type: 'deficit', balance: step.balance });
        }
      }
    });
  });

  // Count and date span describe the forecast rows themselves, not the synthetic
  // opening-balance rows (which are always dated today and would skew the range).
  const summaryRows = filteredForecastRows;
  const summaryDates = summaryRows.map((e) => e.date).filter(Boolean).sort();
  const summaryRange = summaryDates.length
    ? `${summaryDates[0]} to ${summaryDates[summaryDates.length - 1]}`
    : 'No entries';

  // Expense Mix grouping — same row set the table renders, grouped by category so
  // it reconciles with the Dashboard's category breakdown (excluding duplicate card swipes).
  const expensesByCategory: Record<string, number> = {};
  filteredForecastRows
    .filter((e) => e.type === 'expense' && !isCreditCardExpense(e))
    .forEach((e) => {
      const cat = e.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + getCandidateForecastAmount(e);
    });

  // Progressive rendering. A year of forecast rows is ~120 rows, and on mobile the
  // responsive "cards" layout makes each row ~112px tall, so rendering every row put
  // the page at ~30,000px (about 37 phone screens). Render a window and let the user
  // extend it, keeping the initial page shallow.
  const CASHFLOW_PAGE_SIZE = 50;
  // Keyed by the active filter set so that changing a filter (or navigating in with a
  // new intent) starts from a short page again instead of carrying an expanded count.
  const rowWindowKey = `${selectedMonth}|${typeFilter}|${categoryFilter}|${selectedAccount}|${selectedTag}|${searchTerm}|${dateFrom}|${dateTo}`;
  const [rowWindow, setRowWindow] = useState({ key: '', count: CASHFLOW_PAGE_SIZE });
  const visibleRowCount = rowWindow.key === rowWindowKey ? rowWindow.count : CASHFLOW_PAGE_SIZE;
  const renderedRows = allDisplayRows.slice(0, visibleRowCount);
  const hasMoreRows = allDisplayRows.length > renderedRows.length;

  const salaryQuarterTotal = salaryPattern.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleUpdateSalaryPayment = (index: number, updates: Partial<typeof salaryPattern[number]>) => {
    const copy = [...salaryPattern];
    copy[index] = { ...copy[index], ...updates };
    updateSalaryPattern(copy);
  };

  const handleAddSalaryPayment = () => {
    updateSalaryPattern([
      ...salaryPattern,
      { monthOffset: 0, day: 1, amount: 0 },
    ]);
  };

  const handleDeleteSalaryPayment = (index: number) => {
    updateSalaryPattern(salaryPattern.filter((_, paymentIndex) => paymentIndex !== index));
  };

  const installmentProgressMap = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateInstallmentProgress>>();
    installments.forEach((inst) => {
      map.set(inst.id, calculateInstallmentProgress(inst, entryActuals, deletedForecasts));
    });
    return map;
  }, [installments, entryActuals, deletedForecasts]);

  const getInstallmentProgress = (installment: (typeof installments)[number]) => {
    return installmentProgressMap.get(installment.id) || calculateInstallmentProgress(installment, entryActuals, deletedForecasts);
  };

  const installmentMonthlyTotal = installments.reduce((sum, installment) => {
    const progress = getInstallmentProgress(installment);
    return sum + progress.monthlyAmount;
  }, 0);

  const installmentOutstandingTotal = installments.reduce((sum, installment) => {
    const progress = getInstallmentProgress(installment);
    return sum + progress.outstandingAmount;
  }, 0);

  const activeInstallmentSummary = React.useMemo(() => {
    return summarizeActiveInstallments(installments, (inst) => installmentProgressMap.get(inst.id) || calculateInstallmentProgress(inst, entryActuals, deletedForecasts));
  }, [installments, installmentProgressMap, entryActuals, deletedForecasts]);

  const installmentProgressSummary = installments.reduce(
    (summary, installment) => {
      const progress = getInstallmentProgress(installment);
      return {
        paid: summary.paid + progress.paid,
        dismissed: summary.dismissed + (progress.dismissed || 0),
        total: summary.total + progress.total,
        remaining: summary.remaining + progress.remaining,
      };
    },
    { paid: 0, dismissed: 0, total: 0, remaining: 0 },
  );

  const handlePopulateSalaryForecast = () => {
    const added = populateSalaryForecast(startMonth, quarters, salaryAnchorMonth);
    showAppNotice(
      added > 0
        ? `Salary forecast populated with ${added} new entr${added === 1 ? 'y' : 'ies'}.`
        : 'Salary forecast refreshed for the selected period.',
      'success',
    );
  };

  const handleClearSalaryForecast = async (full: boolean) => {
    const scope = full
      ? 'all unactualized salary forecast entries'
      : `salary forecast entries from ${startMonth} for ${quarters} quarter${quarters === 1 ? '' : 's'}`;
    const confirmed = await requestAppConfirm({
      title: 'Clear Salary Forecast',
      message: `Clear ${scope}? Actualized salary history will be preserved.`,
      confirmLabel: 'Clear Forecast',
      tone: 'warning',
    });
    if (!confirmed) return;
    const removed = full
      ? clearSalaryForecast()
      : clearSalaryForecast(startMonth, quarters);
    showAppNotice(
      removed > 0
        ? `Cleared ${removed} salary forecast entr${removed === 1 ? 'y' : 'ies'}.`
        : 'No unactualized salary forecast entries matched this scope.',
      removed > 0 ? 'info' : 'warning',
    );
  };

  return (
    <section className="view cashflow-view" id="cashflow" style={{ display: 'block' }}>
      {/* Subnav Tabs: Forecast Ledger vs Plan Setup */}
      <div className="subnav-tabs cashflow-view-subnav" role="tablist" aria-label="Cashflow navigation tabs">
        <button
          className={`subnav-tab ${activeCashflowSubTab === 'forecast' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCashflowSubTab === 'forecast'}
          onClick={() => setActiveCashflowSubTab('forecast')}
        >
          Forecast Ledger
        </button>
        <button
          className={`subnav-tab ${activeCashflowSubTab === 'setup' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCashflowSubTab === 'setup'}
          onClick={() => setActiveCashflowSubTab('setup')}
        >
          Plan Setup (Salary &amp; Installments)
        </button>
      </div>

      {activeCashflowSubTab === 'setup' ? (
        <div className="cashflow-setup-pane">
          {/* Salary Structure Collapsible */}
          <SalaryStructureSection
            salaryOpen={salaryOpen}
            setSalaryOpen={setSalaryOpen}
            salaryQuarterTotal={salaryQuarterTotal}
            salaryAnchorMonth={salaryAnchorMonth}
            startMonth={startMonth}
            setStartMonth={setStartMonth}
            quarters={quarters}
            setQuarters={setQuarters}
            salaryPattern={salaryPattern}
            onAddPayment={handleAddSalaryPayment}
            onPopulate={handlePopulateSalaryForecast}
            onClearPeriod={() => handleClearSalaryForecast(false)}
            onClearAll={() => handleClearSalaryForecast(true)}
            onUpdatePayment={(idx, field, value) => handleUpdateSalaryPayment(idx, { [field]: value })}
            onRemovePayment={handleDeleteSalaryPayment}
          />

          {/* Installments & Expense Mix */}
          <div className="content-grid salary-layout cashflow-card-grid" style={{ marginTop: '18px' }}>
            <InstallmentsSection
              installmentsOpen={installmentsOpen}
              setInstallmentsOpen={setInstallmentsOpen}
              installments={installments}
              installmentMonthlyTotal={installmentMonthlyTotal}
              installmentOutstandingTotal={installmentOutstandingTotal}
              installmentProgressSummary={installmentProgressSummary}
              activeCommitmentSummary={activeInstallmentSummary}
              onOpenInstallmentModal={onOpenInstallmentModal}
              getInstallmentProgress={getInstallmentProgress}
              onDeleteInstallment={(inst) => setDeleteInstallmentTarget(inst)}
            />

            <ExpenseMixSection
              expenseMixOpen={expenseMixOpen}
              setExpenseMixOpen={setExpenseMixOpen}
              expensesByCategory={expensesByCategory}
              totalExpenses={filteredExpenses}
              selectedCategory={categoryFilter}
              onSelectCategory={(cat) => {
                handleCategoryFilter(cat);
                setActiveCashflowSubTab('forecast');
                requestAnimationFrame(() => {
                  const panel = document.getElementById('forecastEntriesPanel');
                  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }}
            />
          </div>
        </div>
      ) : (
        <div className="cashflow-forecast-pane">
          {/* Single Authoritative Metrics Row */}
          <div className="metrics-grid cashflow-summary-grid" id="cashflowSummary">
            <article className="metric cashflow-metric">
              <span>{isAnyFilterActive ? 'Filtered Inflow' : 'Forecast Income'}</span>
              <strong style={{ color: 'var(--green)' }}>+{formatMoney(filteredIncome)}</strong>
              <small>{isAnyFilterActive ? 'Planned for active criteria' : summaryRange}</small>
            </article>
            <article className="metric cashflow-metric">
              <span>{isAnyFilterActive ? 'Filtered Outflow' : 'Forecast Expenses'}</span>
              <strong style={{ color: 'var(--red)' }}>-{formatMoney(filteredExpenses)}</strong>
              <small>Includes installments &amp; credit dues</small>
            </article>
            <article className="metric cashflow-metric">
              <span>Net</span>
              <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {filteredNet >= 0 ? '+' : ''}{formatMoney(filteredNet)}
              </strong>
              <small>Income minus expenses</small>
            </article>
            <article
              className="metric cashflow-metric cashflow-installments-kpi"
              style={{ cursor: 'pointer', position: 'relative' }}
              onClick={() => setActiveCashflowSubTab('setup')}
              title="Click to view and manage installment plans"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveCashflowSubTab('setup')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Installments</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))',
                    color: 'var(--text-muted)',
                  }}
                >
                  {installments.length} {installments.length === 1 ? 'plan' : 'plans'}
                </span>
              </div>
              <strong
                className="installment-kpi-amount"
                style={{
                  color: '#f59e0b',
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <span style={{ color: '#f59e0b', fontSize: '1.75rem', fontWeight: 800 }}>
                  {formatMoney(activeInstallmentSummary.primaryAmount)}
                </span>
                {activeInstallmentSummary.primaryUnitSuffix && (
                  <span
                    className="installment-kpi-cadence"
                    style={{ color: '#fbbf24', fontSize: '0.95rem', fontWeight: 600, opacity: 0.95 }}
                  >
                    {activeInstallmentSummary.primaryUnitSuffix}
                  </span>
                )}
                {activeInstallmentSummary.secondaryLabel && (
                  <span
                    className="installment-kpi-secondary"
                    style={{ color: '#fde68a', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {activeInstallmentSummary.secondaryLabel}
                  </span>
                )}
              </strong>
              <small style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Due: {formatMoney(installmentOutstandingTotal)}</span>
                <span style={{ color: 'var(--brand-primary, #6366f1)', fontWeight: 600 }}>Manage ↗</span>
              </small>
            </article>
          </div>

          {/* Forecast Filter Box */}
          <section className="panel cashflow-filter-panel" style={{ marginTop: '18px' }}>
            <div className="panel-heading cashflow-filter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ margin: 0 }}>Filter Entries</h3>
                <span id="cashflowFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  {allDisplayRows.length} {allDisplayRows.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="ghost-button"
                  type="button"
                  style={{ fontSize: '12px', padding: '6px 10px' }}
                  onClick={() => setShowDateRangeFilter(!showDateRangeFilter)}
                  title="Toggle custom date range"
                >
                  <Calendar size={14} style={{ marginRight: '4px' }} />
                  {dateFrom || dateTo ? `${dateFrom || 'start'} to ${dateTo || 'end'}` : 'Date range'}
                </button>
                <button
                  className="primary-button cashflow-add-btn"
                  type="button"
                  onClick={() => onOpenEntryModal('expense')}
                >
                  <Plus size={14} style={{ marginRight: '4px' }} />
                  <span>Add entry</span>
                </button>
              </div>
            </div>

            {/* Custom Date Range Collapsible */}
            {showDateRangeFilter && (
              <div className="cashflow-date-range-panel" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-surface-elevated)', borderRadius: '6px', margin: '10px 0', border: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span>From:</span>
                  <input
                    type="date"
                    className="form-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span>To:</span>
                  <input
                    type="date"
                    className="form-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </label>
                {(dateFrom || dateTo) && (
                  <button
                    className="ghost-button"
                    type="button"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    Clear range
                  </button>
                )}
              </div>
            )}

            {/* Unified LedgerFilterBar */}
            <LedgerFilterBar
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              orderedMonths={orderedMonths}
              typeFilter={typeFilter}
              onTypeChange={(t) => setTypeFilter(t as 'all' | 'income' | 'expense')}
              categoryFilter={categoryFilter}
              onCategoryChange={setCategoryFilter}
              allCategories={allCategories}
              selectedAccount={selectedAccount}
              onAccountChange={setSelectedAccount}
              allAccounts={allAccounts}
              selectedTag={selectedTag}
              onTagChange={setSelectedTag}
              allTags={allTags}
              hasUntagged={hasUntagged}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onResetFilters={handleResetFilters}
              isAnyFilterActive={isAnyFilterActive}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onClearDateRange={() => {
                setDateFrom('');
                setDateTo('');
              }}
            />
          </section>

          {/* Forecast Entries Table Panel */}
          <section className="panel cashflow-table-panel" id="forecastEntriesPanel" style={{ marginTop: '18px' }}>
            <div className="table-wrap responsive-cards">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Account</th>
                <th className="cell-type">Type</th>
                <th className="cell-source">Source</th>
                <th className="number">Amount</th>
                <th className="number" style={{ minWidth: '190px' }}>Actual</th>
                <th className="number" style={{ minWidth: '110px' }}>Balance After</th>
                <th style={{ width: '120px', minWidth: '120px' }}></th>
              </tr>
            </thead>
            <tbody>
              {renderedRows.map((e) => {
                const parentEntry = (e.parentEntryId ? entries.find((item) => item.id === e.parentEntryId) : null) || entries.find((item) => item.id === e.id) || e;
                const isOpening = e.source === 'starting balance';
                const isLoan = (e.source || '').toLowerCase().includes('loan') || (e.category || '').toLowerCase().includes('loan');
                const isCreditSettlement = (e.source || '').toLowerCase().includes('credit') || (e.id && e.id.startsWith('credit-settlement-'));
                const isCardPurchase = isCreditCardExpense(e);
                const isForeign = Boolean(e.currency && e.currency !== 'EGP');
                const nativeQty = isForeign
                  ? (e.originalAmount !== undefined && e.originalAmount !== null
                      ? e.originalAmount
                      : (e.fxRateAtEntry ? Math.round((e.amount / e.fxRateAtEntry) * 100) / 100 : e.amount))
                  : e.amount;
                const placeholder = isLoan
                  ? 'Add draw'
                  : isCreditSettlement
                  ? 'Add payment'
                  : isForeign
                  ? `Add ${e.type === 'income' ? 'actual' : 'spend'} (${e.currency})`
                  : e.type === 'income'
                  ? 'Add actual'
                  : 'Add spend';
                const actualValue = getEntryActualAmount(parentEntry, entryActuals);
                const plannedAmt = Number(
                  parentEntry.amount ??
                  (parentEntry as CashEntry & { plannedAmount?: number }).plannedAmount ??
                  0
                );
                const isSplitSlice = Boolean(e.parentEntryId || (e.splitTotalCount && e.splitTotalCount > 1));
                const remainingAmt = isSplitSlice ? Number(e.amount || 0) : Math.max(0, plannedAmt - actualValue);
                const isFull = plannedAmt > 0 && actualValue >= plannedAmt;
                const isPartial = isPartialTracked(parentEntry);
                const isPastDate = Boolean(e.date && e.date < DateUtils.todayString());
                // Credit settlements are single-dated due rows (overdue or upcoming):
                // they never represent an ongoing budget, so never badge them ongoing
                // even when the due date has passed or a payment was recorded.
                const isOverdueIncome = e.type === 'income' && !isOngoingEntry(e, entryActuals);
                const isCompletedSplitContainer = isSplitSlice && actualValue >= plannedAmt && remainingAmt <= 0 && Boolean(parentEntry.keepOngoing);
                // An active split slice is currently underway when actual drawing has started on the entry
                // and this slice is the active head tranche (or if its scheduled date has passed and it carried forward)
                const isActiveDrawingSlice = isSplitSlice && actualValue > 0 && actualValue < plannedAmt && (e.date <= DateUtils.todayString() || e.id === parentEntry.id);
                const displayPlannedAmt = isCompletedSplitContainer
                  ? Number(parentEntry.amount || plannedAmt)
                  : (isSplitSlice ? Number(e.amount || 0) : plannedAmt);
                const ongoing = (!isSplitSlice || isCompletedSplitContainer || isActiveDrawingSlice)
                  && !(isCreditSettlement || isCreditDueLumpSum(e))
                  && !isOverdueIncome
                  && (isOngoingEntry(parentEntry, entryActuals) || (isPartial && !parentEntry.isClosed && (actualValue > 0 || isPastDate)));
                const canFinish = !parentEntry.isClosed && !isOpening && (actualValue > 0 || isPastDate || isLoan || ongoing || (isPartial && remainingAmt > 0));
                const actualDate = actualValue > 0 ? getEntryActualDate(parentEntry, entryActualDates) : '';
                const origStartDate = parentEntry.date || e.date;
                const dateLabel = ongoing
                  ? (isSplitSlice && !isCompletedSplitContainer)
                    ? (isActiveDrawingSlice && isPastDate
                      ? `${DateUtils.formatDisplayDate(e.date)} → ${actualDate && actualDate !== DateUtils.todayString() ? DateUtils.formatDisplayDate(actualDate) : 'Today'}`
                      : DateUtils.formatDisplayDate(e.date))
                    : `${DateUtils.formatDisplayDate(origStartDate)} → ${actualDate && actualDate !== DateUtils.todayString()
                      ? DateUtils.formatDisplayDate(actualDate)
                      : 'Today'}`
                  : DateUtils.formatDisplayDate(e.date);

                const statusInfo = !isOpening ? (entryStatusMap.get(e.id) || entryStatusMap.get(getEntryId(e))) : null;
                const isDeficit = statusInfo?.type === 'deficit';
                const isRecovery = statusInfo?.type === 'recovery';

                const legacyId = getEntryId(e);
                const isTargeted =
                  highlightedEntryId === e.id ||
                  (Boolean(highlightedEntryId) && (legacyId === highlightedEntryId || e.parentEntryId === highlightedEntryId));
                const rowClass = `entry-row ${isOpening ? 'opening-balance-row' : isLoan ? 'loan-entry-row' : ''} ${
                  isDeficit ? 'deficit-entry-row danger-row' : isRecovery ? 'recovery-entry-row success-row' : ''
                } ${isTargeted ? 'entry-row-targeted' : ''} ${isSplitSlice ? 'split-ghost-row' : ''}`.trim();

                const rowTitle = isOpening
                  ? 'Edit on the Accounts page'
                  : isDeficit
                  ? `Deficit spell: Projected cash balance ${formatMoney(statusInfo.balance)}`
                  : isRecovery
                  ? `Recovery: Projected cash balance recovered to ${formatMoney(statusInfo.balance)}`
                  : '';

                return (
                  <tr
                    key={e.id}
                    id={`cashflow-row-${e.id}`}
                    data-entry-id={e.id}
                    data-legacy-id={legacyId}
                    className={rowClass}
                    title={rowTitle}
                    style={{ cursor: 'pointer' }}
                    onClick={(ev) => {
                      if ((ev.target as HTMLElement).closest('input, button, select, a')) return;
                      if (isOpening) {
                        setActiveTab('accounts');
                      } else if (onEditEntry) {
                        onEditEntry(parentEntry);
                      }
                    }}
                  >
                    <td className="cell-date">
                      <strong>{dateLabel}</strong>
                      {isSplitSlice && (
                        <span
                          className="source-pill"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '10px',
                            marginLeft: '4px',
                            padding: '1px 6px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: 'var(--brand-primary, #6366f1)',
                            border: '1px dashed rgba(99, 102, 241, 0.4)',
                            fontWeight: 700,
                          }}
                          title={`Scheduled tranche ${e.splitIndex} of ${e.splitTotalCount} (${formatMoney(e.amount)} of ${formatMoney(parentEntry.amount)})`}
                        >
                          <Layers size={11} />
                          <span>Split {e.splitIndex}/{e.splitTotalCount}</span>
                        </span>
                      )}
                      {ongoing && (
                        <span
                          className={isLoan ? 'source-pill loan' : 'source-pill'}
                          style={{ fontSize: '10px', marginLeft: '4px', padding: '1px 6px' }}
                          title="Active ongoing budget"
                        >
                          Ongoing
                        </span>
                      )}
                    </td>
                    <td className="cell-category">
                      <strong
                        className="history-summary-clickable-row"
                        style={{
                          cursor: 'pointer',
                          padding: '1px 5px',
                          margin: '-1px -5px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          color: categoryFilter === e.category ? 'var(--brand-primary, #6366f1)' : undefined,
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleCategoryFilter(e.category);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            ev.stopPropagation();
                            handleCategoryFilter(e.category);
                          }
                        }}
                        title={`Click to filter entries by category: ${e.category}`}
                      >
                        {e.category}
                      </strong>
                      {isDeficit && (
                        <span
                          className="deficit-badge active"
                          style={{ marginLeft: '6px', fontSize: '10px', verticalAlign: 'middle' }}
                          title={`Projected cash balance: ${formatMoney(statusInfo.balance)}`}
                        >
                          Deficit
                        </span>
                      )}
                      {isRecovery && (
                        <span
                          className="deficit-badge resolved"
                          style={{ marginLeft: '6px', fontSize: '10px', verticalAlign: 'middle' }}
                          title={`Projected cash balance recovered to: ${formatMoney(statusInfo.balance)}`}
                        >
                          Recovery
                        </span>
                      )}
                      {getEntryTags(e).map((tag) => (
                        <button
                          key={`${e.id}-${tag}`}
                          type="button"
                          className={`history-tag-filter ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleTagFilter(tag);
                          }}
                          aria-pressed={selectedTag.toLowerCase() === tag.toLowerCase()}
                          title={`Click to filter entries by tag: #${tag}`}
                        >
                          <span aria-hidden="true">#</span>{tag}
                        </button>
                      ))}
                      {isForeign && (
                        <span className="source-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--kpi-indigo, #818cf8)', fontWeight: 700, fontSize: '10px', marginLeft: '4px' }}>
                          <Banknote size={11} /> {e.currency}
                        </span>
                      )}
                      {e.creditType && (
                        <span className="source-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--kpi-indigo, #818cf8)', fontWeight: 600, fontSize: '10px', marginLeft: '4px' }}>
                          <CreditCard size={11} /> {e.creditType.toUpperCase()}
                        </span>
                      )}
                      {isCreditSettlement && (
                        <div className="credit-due-summary">
                          <small>Settlement due</small>
                          <small>
                            Calculated: <strong>{formatMoney(Number(e.calculatedAmount ?? e.amount) || 0)}</strong>
                          </small>
                          {(() => {
                            const alert = creditFundingAlertsMap.get(e.id);
                            if (!alert) return null;
                            if (alert.isAlert || alert.shortfall > 0) {
                              const canTransfer = Boolean(
                                alert.canBeCoveredByTransfer ||
                                (alert.maxTransferableAmount && alert.maxTransferableAmount > 0)
                              );
                              const isPartial =
                                !alert.canBeCoveredByTransfer &&
                                Boolean(alert.maxTransferableAmount && alert.maxTransferableAmount > 0);
                              const remainingShortfall =
                                alert.remainingUncoveredShortfall ??
                                alert.shortfall - (alert.maxTransferableAmount || 0);
                              const transferAmt = alert.maxTransferableAmount || alert.shortfall;
                              const labelText = isPartial
                                ? `Remaining Shortfall: ${formatMoney(remainingShortfall)}`
                                : `Shortfall: ${formatMoney(alert.shortfall)}`;

                              return (
                                <div
                                  className="credit-funding-shortfall-tag"
                                  style={{
                                    marginTop: '4px',
                                    display: 'inline-flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '11px',
                                    background: 'rgba(244, 63, 94, 0.22)',
                                    border: '1px solid rgba(251, 113, 133, 0.4)',
                                    color: '#fb7185',
                                    borderRadius: '4px',
                                    padding: '3px 7px',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                    cursor: canTransfer ? 'pointer' : 'default',
                                  }}
                                  onClick={(ev) => {
                                    if (canTransfer && onOpenTransferModal) {
                                      ev.stopPropagation();
                                      onOpenTransferModal(
                                        alert.suggestedSourceAccount?.accountKey,
                                        alert.accountKey,
                                        transferAmt,
                                        alert.canBeCoveredByTransfer
                                          ? `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Shortfall: ${formatMoney(alert.shortfall)})`
                                          : `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Partial transfer: ${formatMoney(transferAmt)} · Remaining shortfall: ${formatMoney(remainingShortfall)})`
                                      );
                                    }
                                  }}
                                  title={
                                    canTransfer
                                      ? isPartial
                                        ? `${formatMoney(transferAmt)} available from ${alert.suggestedSourceAccount?.accountName}. Click to transfer funds (Remaining shortfall: ${formatMoney(remainingShortfall)}).`
                                        : `Account ${alert.accountName} has only ${formatMoney(alert.accountBalance)}. Click to transfer funds from ${alert.suggestedSourceAccount?.accountName}.`
                                      : `Account ${alert.accountName} has ${formatMoney(alert.accountBalance)}. Shortfall: ${formatMoney(alert.shortfall)} (no account can cover).`
                                  }
                                >
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', wordBreak: 'break-word' }}>
                                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                                    <span><strong>{labelText}</strong> ({alert.accountName})</span>
                                  </span>
                                  {canTransfer && onOpenTransferModal && (
                                    <span style={{ textDecoration: 'underline', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                      Transfer →
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (alert.status === 'funded') {
                              return (
                                <div
                                  className="credit-funding-funded-tag"
                                  style={{
                                    marginTop: '4px',
                                    fontSize: '11px',
                                    color: 'var(--green, #10b981)',
                                    display: 'inline-flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '4px',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', wordBreak: 'break-word' }}>
                                    <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                                    <span>{alert.accountName} funded ({formatMoney(alert.accountBalance)} avail)</span>
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="cell-account">
                      <span
                        className="account-pill history-summary-clickable-row"
                        style={{
                          cursor: 'pointer',
                          border: selectedAccount.toLowerCase() === (e.account || 'cash').toLowerCase() ? '1px solid var(--brand-primary, #6366f1)' : undefined,
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleAccountFilter(e.account || 'cash');
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            ev.stopPropagation();
                            handleAccountFilter(e.account || 'cash');
                          }
                        }}
                        title={`Click to filter entries by account: ${(e.account || 'cash').toUpperCase()}`}
                      >
                        {(e.account || '').toUpperCase() || '—'}
                      </span>
                    </td>
                    <td className="cell-type">
                      <span
                        className={`pill ${e.type} history-summary-clickable-row`}
                        style={{
                          cursor: 'pointer',
                          outline: typeFilter === e.type ? '2px solid var(--brand-primary, #6366f1)' : undefined,
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setTypeFilter((current) => (current === e.type ? 'all' : e.type));
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            ev.stopPropagation();
                            setTypeFilter((current) => (current === e.type ? 'all' : e.type));
                          }
                        }}
                        title={`Click to filter entries by type: ${e.type}`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="cell-source">
                      {isCardPurchase ? (
                        <span className="source-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--kpi-indigo, #818cf8)', fontWeight: 600 }}>
                          <CreditCard size={11} /> Settles {DateUtils.formatDisplayDate(calculateCreditSettlementDate(e.date, e.creditType || e.account || ''))}
                        </span>
                      ) : isCreditSettlement || isCreditDueLumpSum(e) ? (
                        <span className="source-pill credit-due-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Landmark size={11} /> Credit Settlement
                        </span>
                      ) : e.source && !['manual', 'expense', 'income', 'direct', 'starting balance', 'cash', 'default'].includes(e.source.toLowerCase()) ? (
                        <span className={`source-pill ${e.source === 'loan' ? 'loan' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {e.source === 'recurring credit' ? (
                            <><Landmark size={11} /> Credit Settlement</>
                          ) : e.source === 'credit card' ? (
                            <><CreditCard size={11} /> Credit Card</>
                          ) : (
                            e.source
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td className="cell-amount number" style={{ color: e.type === 'income' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {isForeign ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span>
                            {e.type === 'income' ? '+' : '-'}{formatNativeCurrency(nativeQty, e.currency)}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                            ≈ {formatMoney(displayPlannedAmt)}
                          </span>
                          {actualValue > 0 && remainingAmt > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                              ({formatMoney(remainingAmt)} rem)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span>{e.type === 'income' ? '+' : '-'}{formatMoney(displayPlannedAmt)}</span>
                          {actualValue > 0 && remainingAmt > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                              ({formatMoney(remainingAmt)} rem)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="cell-actual number">
                      {isOpening ? (
                        <span>—</span>
                      ) : (
                        <div className="actual-cell-wrapper">
                          <input
                            className="inline-actual-input form-input"
                            placeholder={placeholder}
                            type="number"
                            min="0"
                            step="0.01"
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') {
                                ev.preventDefault();
                                const input = ev.currentTarget;
                                const rawVal = Number(input.value) || 0;
                                input.value = '';
                                if (rawVal > 0) {
                                  const effectiveRate = e.fxRateAtEntry || getCurrencyRateOr(rates, e.currency, 1);
                                  const egpVal = isForeign ? Math.round(rawVal * effectiveRate * 100) / 100 : Math.round(rawVal * 100) / 100;
                                  handleActualSpend(parentEntry, egpVal, actualValue);
                                }
                              }
                            }}
                            onBlur={(ev) => {
                              const input = ev.currentTarget;
                              const rawVal = Number(input.value) || 0;
                              input.value = '';
                              if (rawVal > 0) {
                                const effectiveRate = e.fxRateAtEntry || getCurrencyRateOr(rates, e.currency, 1);
                                const egpVal = isForeign ? Math.round(rawVal * effectiveRate * 100) / 100 : Math.round(rawVal * 100) / 100;
                                handleActualSpend(parentEntry, egpVal, actualValue);
                              }
                            }}
                          />
                          {actualValue > 0 && (
                            <small className="actual-spend-note">
                              {isLoan
                                ? `Drawn so far: ${formatMoney(actualValue)} ${isFull ? '(Full amount reached · Ongoing)' : `(Remaining: ${formatMoney(remainingAmt)})`}`
                                : isCreditSettlement
                                ? `Paid so far: ${formatMoney(actualValue)} ${isFull ? '(Settled in full)' : `(Remaining due: ${formatMoney(remainingAmt)})`}`
                                : isForeign
                                ? `Spent so far: ${formatNativeCurrency(Math.round((actualValue / (e.fxRateAtEntry || getCurrencyRateOr(rates, e.currency, 1))) * 100) / 100, e.currency)} (≈ ${formatMoney(actualValue)}) ${isFull ? '(Full budget reached · Ongoing)' : `(Remaining: ≈ ${formatMoney(remainingAmt)})`}`
                                : `Spent so far: ${formatMoney(actualValue)} ${isFull ? '(Full budget reached · Ongoing)' : `(Remaining: ${formatMoney(remainingAmt)})`}`}
                            </small>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="number cashflow-table-running-balance" data-label="Balance After">
                      {(() => {
                        const bal = entryRunningBalanceMap.get(e.id);
                        if (bal === undefined) return '—';
                        return (
                          <span style={{ color: bal < 0 ? 'var(--color-danger, #f43f5e)' : 'inherit' }}>
                            {formatMoney(bal)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="cell-actions">
                      {isOpening ? null : (
                        <div className="cell-actions-wrapper">
                          {canFinish && (
                            <button
                              className="ghost-button finish-loan-btn"
                              type="button"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Finish and close entry at current actual amount"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setExactDecisionData({
                                  entry: parentEntry,
                                  actualAmount: actualValue,
                                  plannedAmount: Number(parentEntry.amount || 0),
                                  linkedRepayment: getLinkedRepaymentOption(parentEntry, actualValue),
                                });
                              }}
                            >
                              <Check size={12} /> Finish
                            </button>
                          )}
                          {(() => {
                            const hasAffected = hasEntryAffectedParties(parentEntry, {
                              installments,
                              storageAssets,
                              partTimeJobs,
                              accounts,
                              entryActuals,
                              entries,
                            });
                            return (
                              <button
                                className="delete-button"
                                style={{ position: 'relative' }}
                                title={hasAffected ? 'Delete entry (has affected linked records)' : 'Delete entry'}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setDeleteEntryTarget(parentEntry);
                                }}
                              >
                                Delete
                                {hasAffected && (
                                  <span
                                    className="affected-parties-dot"
                                    title="Has affected linked records"
                                  />
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMoreRows && (
            <div className="table-load-more">
              <button
                type="button"
                className="ghost-button table-load-more-btn"
                onClick={() => setRowWindow({ key: rowWindowKey, count: visibleRowCount + CASHFLOW_PAGE_SIZE })}
              >
                Show {Math.min(CASHFLOW_PAGE_SIZE, allDisplayRows.length - renderedRows.length)} more
              </button>
              <small>
                Showing {renderedRows.length} of {allDisplayRows.length} entries
              </small>
            </div>
          )}
        </div>
      </section>
        </div>
      )}

      {/* Decision & Repayment Modals */}
      <AdjustLoanRepaymentModal
        isOpen={Boolean(loanAdjustmentData)}
        inflowEntry={loanAdjustmentData?.inflowEntry || null}
        linkedInfo={loanAdjustmentData?.linkedInfo || null}
        totalDrawn={loanAdjustmentData?.totalDrawn || 0}
        plannedLoan={loanAdjustmentData?.plannedLoan || 0}
        onKeep={handleKeepLoanRepayment}
        onScale={handleScaleLoanRepayment}
      />

      <ExactAmountDecisionModal
        isOpen={Boolean(exactDecisionData)}
        entry={exactDecisionData?.entry || null}
        actualAmount={exactDecisionData?.actualAmount || 0}
        plannedAmount={exactDecisionData?.plannedAmount || 0}
        linkedRepayment={exactDecisionData?.linkedRepayment || null}
        onKeep={handleKeepEntry}
        onFinish={handleFinishEntry}
      />

      {/* Affected Records Modal for Entry Deletion */}
      {deleteEntryTarget && (() => {
        const affectedData = buildEntryDeleteOptions(deleteEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          accounts,
          entryActuals,
          entries,
          creditSettlementOverrides,
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(deleteEntryTarget)}
            mode="delete"
            title="Delete Forecast Entry"
            subtitle="Choose which linked records and recurring occurrences should be affected."
            itemDescription={affectedData.itemDescription}
            amountFormatted={affectedData.amountFormatted}
            options={affectedData.options}
            onConfirm={(selectedIds) => {
              const seriesMode = selectedIds.includes('series') ? 'future' : 'single';
              // Route through the same deleteEntry(...) call as EntriesView/HistoryView,
              // so "delete this occurrence + wipe the whole installment plan" behaves
              // identically regardless of which screen triggered it: deleteInstallmentPlan
              // only removes the installment tracker/future occurrences and preserves
              // actualized/archived history, while every other checked option (loan, job,
              // storage, series) is still honored instead of being silently dropped.
              deleteEntry(deleteEntryTarget.id, seriesMode, {
                deleteLinkedLoan: selectedIds.includes('loan'),
                deleteInstallmentPlan: selectedIds.includes('installment_plan'),
                syncJob: selectedIds.includes('job'),
                revertStorage: selectedIds.includes('storage'),
                restoreForeignAsset: selectedIds.includes('restore_fx_asset'),
                adjustCreditOverride: selectedIds.includes('credit_statement'),
              });
              setDeleteEntryTarget(null);
            }}
            onClose={() => setDeleteEntryTarget(null)}
          />
        );
      })()}

      {/* Affected Records Modal for Installment Deletion */}
      {deleteInstallmentTarget && (() => {
        const affectedData = buildInstallmentDeleteOptions(deleteInstallmentTarget, {
          entries,
          archivedEntries,
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(deleteInstallmentTarget)}
            mode="delete"
            title="Delete Installment"
            subtitle="Choose what records should be affected when deleting this installment."
            itemDescription={affectedData.itemDescription}
            amountFormatted={affectedData.amountFormatted}
            options={affectedData.options}
            onConfirm={(selectedIds) => {
              deleteInstallment(deleteInstallmentTarget.id, {
                deleteCashEntries: selectedIds.includes('cashflow'),
              });
              setDeleteInstallmentTarget(null);
            }}
            onClose={() => setDeleteInstallmentTarget(null)}
          />
        );
      })()}
    </section>
  );
};
