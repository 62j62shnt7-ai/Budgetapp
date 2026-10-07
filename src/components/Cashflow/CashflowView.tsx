import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  buildSalaryEntries,
  buildInstallmentEntries,
  calculateInstallmentProgress,
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
  getEntryId,
} from '../../engine/forecast';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency, getCurrencyRate } from '../../engine/currency';
import { Plus } from 'lucide-react';

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
    asfJobs,
    irqJobs,
    setActiveTab,
    pendingNavigation,
    clearPendingNavigation,
  } = useBudgetStore();

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
  } | null>(null);

  const pendingDeductRef = React.useRef<{ entry: CashEntry; amount: number } | null>(null);
  const flushPendingDeduct = () => {
    const pending = pendingDeductRef.current;
    pendingDeductRef.current = null;
    if (pending && onDeductPrompt) onDeductPrompt(pending.entry, pending.amount);
  };

  const handleActualSpend = (entry: CashEntry, addedAmount: number, currentActual: number) => {
    const newActual = currentActual + addedAmount;
    recordActual(entry.id, newActual, DateUtils.todayString());
    // Decision modals are top-layer and would hide the deduct dialog, so the
    // deduct prompt is queued and flushed once those modals are resolved.
    pendingDeductRef.current = { entry, amount: addedAmount };

    const plannedAmount = Number(entry.amount || 0);

    if (isLoanInflow(entry)) {
      const linked = findLinkedLoanRepayment(entry, entries, installments);
      if (linked) {
        const scaleCalc = calculateLoanRepaymentScale(entry, linked, newActual);
        if (scaleCalc) {
          setLoanAdjustmentData({
            inflowEntry: entry,
            linkedInfo:
              linked.type === 'single'
                ? {
                    type: 'single',
                    target: linked.target,
                    scaledAmount: scaleCalc.scaledAmount,
                    currentAmount: scaleCalc.currentAmount,
                  }
                : {
                    type: 'installment',
                    target: linked.target,
                    scaledAmount: scaleCalc.scaledAmount,
                    currentAmount: scaleCalc.currentAmount,
                    months: scaleCalc.months || 1,
                  },
            totalDrawn: newActual,
            plannedLoan: plannedAmount,
          });
          return;
        }
      }
    }

    const isForeign = Boolean(entry.currency && entry.currency.toUpperCase() !== 'EGP');
    const fxRate = entry.fxRateAtEntry || (entry.currency ? getCurrencyRate(rates, entry.currency) : 1) || 48.5;
    const effectivePlannedAmount = isForeign && entry.originalAmount
      ? Math.round(entry.originalAmount * fxRate)
      : Number(entry.amount || 0);

    if (newActual >= effectivePlannedAmount && effectivePlannedAmount > 0 && !entry.isClosed) {
      setExactDecisionData({
        entry,
        actualAmount: newActual,
        plannedAmount: effectivePlannedAmount,
      });
      return;
    }
    flushPendingDeduct();
  };

  const handleScaleLoanRepayment = (scaledAmount: number) => {
    if (!loanAdjustmentData) return;
    const { inflowEntry, linkedInfo, totalDrawn, plannedLoan } = loanAdjustmentData;
    runTransaction(`Scale Loan Repayment: ${inflowEntry.category}`, () => {
      if (linkedInfo.type === 'single') {
        updateEntry(linkedInfo.target.id, { amount: scaledAmount });
      } else {
        updateInstallment(linkedInfo.target.id, { amount: scaledAmount });
      }
    });
    setLoanAdjustmentData(null);

    if (totalDrawn >= plannedLoan && plannedLoan > 0 && !inflowEntry.isClosed) {
      setExactDecisionData({
        entry: inflowEntry,
        actualAmount: totalDrawn,
        plannedAmount: plannedLoan,
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
      });
      return;
    }
    flushPendingDeduct();
  };

  const handleFinishEntry = () => {
    if (!exactDecisionData) return;
    const { entry, actualAmount } = exactDecisionData;
    runTransaction(`Finish Entry: ${entry.category}`, () => {
      updateEntry(entry.id, { isClosed: true, keepOngoing: false, amount: actualAmount });
      settleJobForecastPayment(entry.id, actualAmount, true);

      if (isLoanInflow(entry)) {
        const linked = findLinkedLoanRepayment(entry, entries, installments);
        if (linked) {
          const scaleCalc = calculateLoanRepaymentScale(entry, linked, actualAmount);
          if (scaleCalc) {
            if (linked.type === 'single') {
              updateEntry(linked.target.id, { amount: scaleCalc.scaledAmount });
            } else {
              updateInstallment(linked.target.id, { amount: scaleCalc.scaledAmount });
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

  // Collapsible sections
  const [salaryOpen, setSalaryOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('budget-control-salary-collapsed');
    if (saved !== null) return saved !== 'true';
    return typeof window !== 'undefined' ? window.innerWidth > 768 : true;
  });
  const [installmentsOpen, setInstallmentsOpen] = useState<boolean>(() =>
    localStorage.getItem('budget-control-installments-collapsed') !== 'true'
  );
  const [expenseMixOpen, setExpenseMixOpen] = useState<boolean>(() =>
    localStorage.getItem('budget-control-expense-mix-collapsed') !== 'true'
  );

  useEffect(() => {
    localStorage.setItem('budget-control-salary-collapsed', String(!salaryOpen));
  }, [salaryOpen]);
  useEffect(() => {
    localStorage.setItem('budget-control-installments-collapsed', String(!installmentsOpen));
  }, [installmentsOpen]);
  useEffect(() => {
    localStorage.setItem('budget-control-expense-mix-collapsed', String(!expenseMixOpen));
  }, [expenseMixOpen]);

  // Salary matrix inputs
  const currentYm = DateUtils.currentYearMonth();
  const [startMonth, setStartMonth] = useState(() =>
    localStorage.getItem('budget-control-forecast-start-month') || currentYm
  );
  const [quarters, setQuarters] = useState(() => {
    const stored = Number(localStorage.getItem('budget-control-forecast-quarters'));
    return Number.isFinite(stored) && stored > 0 ? Math.min(24, Math.max(1, stored)) : 12;
  });

  useEffect(() => {
    localStorage.setItem('budget-control-forecast-start-month', startMonth || currentYm);
  }, [startMonth, currentYm]);

  useEffect(() => {
    localStorage.setItem('budget-control-forecast-quarters', String(quarters));
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
        return isPartialTracked(entry) && getRemainingForecastAmount(entry, entryActuals) > 0;
      })
      .map((entry) => {
        const actual = getEntryActualAmount(entry, entryActuals);
        const remaining = isPartialTracked(entry) && actual > 0
          ? getRemainingForecastAmount(entry, entryActuals)
          : Number(entry.amount || 0);
        return actual > 0 && isPartialTracked(entry)
          ? { ...entry, amount: remaining }
          : entry;
      });
    const rows = getActiveForecastEntries(
      [...entries, ...salary],
      installment,
      credit,
      deletedForecasts,
      entryActuals,
    );
    return {
      salaryEntries: salary,
      installmentEntries: installment,
      creditEntries: credit,
      forecastCandidates: candidates,
      allCandidate: candidateList,
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
    const t = (e.tag || '').trim();
    if (t) tagSet.add(t);
    else hasUntagged = true;
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
      const eTag = (e.tag || '').trim();
      if (selectedTag === '__untagged__') {
        if (eTag) return false;
      } else if (eTag.toLowerCase() !== selectedTag.toLowerCase()) {
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

  const filteredIncome = allDisplayRows
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const filteredExpenses = allDisplayRows
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const filteredNet = filteredIncome - filteredExpenses;

  const isAnyFilterActive =
    selectedMonth !== 'all' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all' ||
    selectedAccount !== 'all' ||
    selectedTag !== 'all' ||
    Boolean(searchTerm);

  const totalCash = Object.values(accounts || {}).reduce(
    (sum, acc) => sum + (Number(acc.balance) || 0),
    0
  );
  const deficitPeriods = getDeficitPeriods(allCandidate, totalCash);
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

  const totalIncome = forecastRows
    .filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo))
    .filter((e) => e.type === 'income')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalExpenses = forecastRows
    .filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo))
    .filter((e) => e.type === 'expense')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const netPeriod = totalIncome - totalExpenses;
  const summaryRows = forecastRows.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo));
  const summaryDates = summaryRows.map((e) => e.date).filter(Boolean).sort();
  const summaryRange = summaryDates.length
    ? `${summaryDates[0]} to ${summaryDates[summaryDates.length - 1]}`
    : 'No entries';

  // Expense Mix grouping
  const expensesByCategory: Record<string, number> = {};
  forecastRows
    .filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo))
    .filter((e) => e.type === 'expense')
    .forEach((e) => {
      const cat = e.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (Number(e.amount) || 0);
    });

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
    if (typeof window !== 'undefined') {
      window.alert(
        added > 0
          ? `Salary forecast populated with ${added} new entr${added === 1 ? 'y' : 'ies'}.`
          : 'Salary forecast refreshed for the selected period.',
      );
    }
  };

  const handleClearSalaryForecast = (full: boolean) => {
    const scope = full
      ? 'all unactualized salary forecast entries'
      : `salary forecast entries from ${startMonth} for ${quarters} quarter${quarters === 1 ? '' : 's'}`;
    if (typeof window !== 'undefined' && !window.confirm(`Clear ${scope}? Actualized salary history will be preserved.`)) return;
    const removed = full
      ? clearSalaryForecast()
      : clearSalaryForecast(startMonth, quarters);
    if (typeof window !== 'undefined') {
      window.alert(removed > 0 ? `Cleared ${removed} salary forecast entr${removed === 1 ? 'y' : 'ies'}.` : 'No unactualized salary forecast entries matched this scope.');
    }
  };

  return (
    <section className="view cashflow-view" id="cashflow" style={{ display: 'block' }}>
      {/* Summary Period Filter Bar */}
      <div className="panel cashflow-top-panel" style={{ marginBottom: '18px' }}>
        <div className="panel-heading">
          <h3 style={{ margin: 0 }}>Summary period</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Forecast candidate entries list</span>
        </div>
        <div className="salary-controls cashflow-period-controls">
          <label className="period-filter-label">
            From:
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="period-filter-label">
            To:
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            className="ghost-button full-list-btn"
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            Use full list
          </button>
          <span className="period-filter-status" style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {dateFrom || dateTo ? `${dateFrom || 'start'} to ${dateTo || 'end'}` : 'Full forecast list'}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid cashflow-summary-grid" id="cashflowSummary">
        <article className="metric cashflow-metric">
          <span>Forecast income</span>
          <strong style={{ color: 'var(--green)' }}>{formatMoney(totalIncome)}</strong>
          <small>Total across the selected period</small>
        </article>
        <article className="metric cashflow-metric">
          <span>Forecast expenses</span>
          <strong style={{ color: 'var(--red)' }}>{formatMoney(totalExpenses)}</strong>
          <small>Includes installments &amp; credit dues</small>
        </article>
        <article className="metric cashflow-metric">
          <span>Net</span>
          <strong style={{ color: netPeriod >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {netPeriod >= 0 ? '+' : ''}{formatMoney(netPeriod)}
          </strong>
          <small>Income minus expenses</small>
        </article>
        <article className="metric cashflow-metric">
          <span>Entries</span>
          <strong>{summaryRows.length}</strong>
          <small>{summaryRange}</small>
        </article>
      </div>

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
          onOpenInstallmentModal={onOpenInstallmentModal}
          getInstallmentProgress={getInstallmentProgress}
          onDeleteInstallment={(inst) => setDeleteInstallmentTarget(inst)}
        />

        <ExpenseMixSection
          expenseMixOpen={expenseMixOpen}
          setExpenseMixOpen={setExpenseMixOpen}
          expensesByCategory={expensesByCategory}
          totalExpenses={totalExpenses}
          selectedCategory={categoryFilter}
          onSelectCategory={(cat) => {
            handleCategoryFilter(cat);
            requestAnimationFrame(() => {
              const panel = document.getElementById('forecastEntriesPanel');
              if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }}
        />
      </div>

      {/* Forecast Entries Table */}
      <section className="panel cashflow-table-panel" id="forecastEntriesPanel" style={{ marginTop: '18px' }}>
        <div className="panel-heading cashflow-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0 }}>Forecast entries</h3>
            <span id="cashflowFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {allDisplayRows.length} {allDisplayRows.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <button
            className="ghost-button cashflow-add-btn"
            type="button"
            onClick={() => onOpenEntryModal('expense')}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            <span>Add entry</span>
          </button>
        </div>

        <div className="history-filters-bar" style={{ marginTop: '10px' }}>
          <label className="history-filter-field">
            <span className="field-label-text">Month</span>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              <option value="all">All months</option>
              {orderedMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="history-filter-field">
            <span className="field-label-text">Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'income' | 'expense')}
            >
              <option value="all">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="history-filter-field">
            <span className="field-label-text">Category</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label className="history-filter-field">
            <span className="field-label-text">Account</span>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {allAccounts.map((acc) => (
                <option key={acc} value={acc}>{acc.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="history-filter-field">
            <span className="field-label-text">Tag / Subcategory</span>
            <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
              <option value="all">All tags</option>
              {hasUntagged && <option value="__untagged__">📁 Untagged</option>}
              {allTags.map((tag) => (
                <option key={tag} value={tag}>🏷️ {tag}</option>
              ))}
            </select>
          </label>
          <label className="history-filter-field history-search-field">
            <span className="field-label-text">Search</span>
            <input
              id="searchEntries"
              type="search"
              placeholder="Search category, tag, account..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <button
            className="ghost-button history-reset-btn"
            type="button"
            onClick={handleResetFilters}
          >
            Reset filters
          </button>
        </div>

        {isAnyFilterActive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '10px',
              padding: '6px 12px',
              background: 'rgba(99, 102, 241, 0.08)',
              borderRadius: '6px',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              fontSize: '12px',
              color: 'var(--text-main, var(--ink))',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--muted)' }}>Active filters:</span>
            {selectedMonth !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                📅 Month: <strong>{selectedMonth}</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setSelectedMonth('all')}
                  title="Clear month filter"
                >
                  ✕
                </button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                Type: <strong>{typeFilter}</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setTypeFilter('all')}
                  title="Clear type filter"
                >
                  ✕
                </button>
              </span>
            )}
            {categoryFilter !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                📁 Category: <strong>{categoryFilter}</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setCategoryFilter('all')}
                  title="Clear category filter"
                >
                  ✕
                </button>
              </span>
            )}
            {selectedAccount !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                Account: <strong>{selectedAccount.toUpperCase()}</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setSelectedAccount('all')}
                  title="Clear account filter"
                >
                  ✕
                </button>
              </span>
            )}
            {selectedTag !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                🏷️ Tag: <strong>{selectedTag === '__untagged__' ? 'Untagged' : selectedTag}</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setSelectedTag('all')}
                  title="Clear tag filter"
                >
                  ✕
                </button>
              </span>
            )}
            {searchTerm && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                Search: <strong>&quot;{searchTerm}&quot;</strong>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                  onClick={() => setSearchTerm('')}
                  title="Clear search filter"
                >
                  ✕
                </button>
              </span>
            )}
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--brand-primary, #6366f1)',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontWeight: 600,
                padding: 0,
                marginLeft: 'auto',
              }}
              onClick={handleResetFilters}
            >
              Clear all
            </button>
          </div>
        )}

        <div className="metrics-grid" id="cashflowFilteredSummary" style={{ margin: '14px 0 16px' }}>
          <article className="metric">
            <span>{isAnyFilterActive ? 'Filtered Inflow' : 'Forecast Inflow'}</span>
            <strong style={{ color: 'var(--green)' }}>+{formatMoney(filteredIncome)}</strong>
            <small>{isAnyFilterActive ? 'Planned for active criteria' : 'Total candidate inflows'}</small>
          </article>
          <article className="metric">
            <span>{isAnyFilterActive ? 'Filtered Outflow' : 'Forecast Outflow'}</span>
            <strong style={{ color: 'var(--red)' }}>-{formatMoney(filteredExpenses)}</strong>
            <small>{isAnyFilterActive ? 'Planned for active criteria' : 'Total candidate outflows'}</small>
          </article>
          <article className="metric">
            <span>{isAnyFilterActive ? 'Filtered Net' : 'Forecast Net'}</span>
            <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {filteredNet >= 0 ? '+' : ''}{formatMoney(filteredNet)}
            </strong>
            <small>Inflows minus outflows</small>
          </article>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '-4px 0 12px' }}>
          Every planned income and expense, including starting balances, salary, installments, and credit dues. Type an <strong>Actual</strong> amount once something really happens.
        </p>

        <div className="table-wrap responsive-cards" style={{ marginTop: '12px' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Account</th>
                <th>Type</th>
                <th>Source</th>
                <th className="number">Amount</th>
                <th className="number" style={{ minWidth: '190px' }}>Actual</th>
                <th style={{ width: '120px', minWidth: '120px' }}></th>
              </tr>
            </thead>
            <tbody>
              {allDisplayRows.map((e) => {
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
                const actualValue = getEntryActualAmount(e, entryActuals);
                const originalEntry = entries.find((entry) => entry.id === e.id) || e;
                const plannedAmt = Number(originalEntry.amount || e.amount || 0);
                const remainingAmt = Math.max(0, plannedAmt - actualValue);
                const isFull = plannedAmt > 0 && actualValue >= plannedAmt;
                const isPartial = isPartialTracked(e);
                const isPastDate = Boolean(e.date && e.date < DateUtils.todayString());
                // Credit settlements are single-dated due rows (overdue or upcoming):
                // they never represent an ongoing budget, so never badge them ongoing
                // even when the due date has passed or a payment was recorded.
                const ongoing = !(isCreditSettlement || isCreditDueLumpSum(e))
                  && (isOngoingEntry(e, entryActuals) || (isPartial && !e.isClosed && remainingAmt > 0 && (actualValue > 0 || isPastDate)));
                const canFinish = !e.isClosed && !isOpening && (actualValue > 0 || isPastDate || isLoan || ongoing || (isPartial && remainingAmt > 0));
                const actualDate = actualValue > 0 ? getEntryActualDate(e, entryActualDates) : '';
                const dateLabel = ongoing
                  ? `${DateUtils.formatDisplayDate(e.date)} → ${actualDate && actualDate !== DateUtils.todayString()
                    ? DateUtils.formatDisplayDate(actualDate)
                    : 'Today'}`
                  : DateUtils.formatDisplayDate(e.date);

                const statusInfo = !isOpening ? (entryStatusMap.get(e.id) || entryStatusMap.get(getEntryId(e))) : null;
                const isDeficit = statusInfo?.type === 'deficit';
                const isRecovery = statusInfo?.type === 'recovery';

                const legacyId = getEntryId(e);
                const isTargeted =
                  highlightedEntryId === e.id ||
                  (Boolean(highlightedEntryId) && legacyId === highlightedEntryId);
                const rowClass = `entry-row ${isOpening ? 'opening-balance-row' : isLoan ? 'loan-entry-row' : ''} ${
                  isDeficit ? 'deficit-entry-row danger-row' : isRecovery ? 'recovery-entry-row success-row' : ''
                } ${isTargeted ? 'entry-row-targeted' : ''}`.trim();

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
                        onEditEntry(e);
                      }
                    }}
                  >
                    <td className="cell-date">
                      <strong>{dateLabel}</strong>
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
                      {[e.tag, ...(e.draws || []).map((draw) => draw.tag)]
                        .filter((tag, index, tags): tag is string => Boolean(tag) && tags.indexOf(tag) === index)
                        .map((tag) => (
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
                        <span className="source-pill" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', fontWeight: 700, fontSize: '10px', marginLeft: '4px' }}>
                          💵 {e.currency}
                        </span>
                      )}
                      {e.creditType && (
                        <span className="source-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--blue)', fontWeight: 600, fontSize: '10px', marginLeft: '4px' }}>
                          💳 {e.creditType.toUpperCase()}
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
                                ? `⚠️ Remaining Shortfall: ${formatMoney(remainingShortfall)}`
                                : `⚠️ Shortfall: ${formatMoney(alert.shortfall)}`;

                              return (
                                <div
                                  className="credit-funding-shortfall-tag"
                                  style={{
                                    marginTop: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '11px',
                                    background: 'rgba(244, 63, 94, 0.15)',
                                    border: '1px solid var(--red, #f43f5e)',
                                    color: 'var(--red, #f43f5e)',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
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
                                  <span><strong>{labelText}</strong> ({alert.accountName})</span>
                                  {canTransfer && onOpenTransferModal && <span style={{ textDecoration: 'underline', fontWeight: 700 }}>Transfer →</span>}
                                </div>
                              );
                            } else if (alert.status === 'funded') {
                              return (
                                <div
                                  style={{
                                    marginTop: '4px',
                                    fontSize: '11px',
                                    color: 'var(--green, #10b981)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <span>🟢 {alert.accountName} funded ({formatMoney(alert.accountBalance)} avail)</span>
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
                        <span className="source-pill" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                          💳 Settles {DateUtils.formatDisplayDate(calculateCreditSettlementDate(e.date, e.creditType || e.account || ''))}
                        </span>
                      ) : isCreditSettlement || isCreditDueLumpSum(e) ? (
                        <span className="source-pill credit-due-pill">🏛️ Credit Settlement</span>
                      ) : e.source && !['manual', 'expense', 'income', 'direct', 'starting balance', 'cash', 'default'].includes(e.source.toLowerCase()) ? (
                        <span className={`source-pill ${e.source === 'loan' ? 'loan' : ''}`}>
                          {e.source === 'recurring credit' ? '🏛️ Credit Settlement' : e.source === 'credit card' ? '💳 Credit Card' : e.source}
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
                            ≈ {formatMoney(e.amount)}
                          </span>
                        </div>
                      ) : (
                        <span>{e.type === 'income' ? '+' : '-'}{formatMoney(e.amount)}</span>
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
                                  const effectiveRate = e.fxRateAtEntry || (e.currency ? getCurrencyRate(rates, e.currency) : 1);
                                  const egpVal = isForeign ? Math.round(rawVal * effectiveRate) : Math.round(rawVal);
                                  handleActualSpend(e, egpVal, actualValue);
                                }
                              }
                            }}
                            onBlur={(ev) => {
                              const input = ev.currentTarget;
                              const rawVal = Number(input.value) || 0;
                              input.value = '';
                              if (rawVal > 0) {
                                const effectiveRate = e.fxRateAtEntry || (e.currency ? getCurrencyRate(rates, e.currency) : 1);
                                const egpVal = isForeign ? Math.round(rawVal * effectiveRate) : Math.round(rawVal);
                                handleActualSpend(e, egpVal, actualValue);
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
                                ? `Spent so far: ${formatNativeCurrency(Math.round((actualValue / (e.fxRateAtEntry || getCurrencyRate(rates, e.currency))) * 100) / 100, e.currency)} (≈ ${formatMoney(actualValue)}) ${isFull ? '(Full budget reached · Ongoing)' : `(Remaining: ≈ ${formatMoney(remainingAmt)})`}`
                                : `Spent so far: ${formatMoney(actualValue)} ${isFull ? '(Full budget reached · Ongoing)' : `(Remaining: ${formatMoney(remainingAmt)})`}`}
                            </small>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="cell-actions">
                      {isOpening ? null : (
                        <div className="cell-actions-wrapper">
                          {canFinish && (
                            <button
                              className="ghost-button finish-loan-btn"
                              type="button"
                              title="Finish and close entry at current actual amount"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setExactDecisionData({
                                  entry: e,
                                  actualAmount: actualValue,
                                  plannedAmount: Number(e.amount || 0),
                                });
                              }}
                            >
                              ✓ Finish
                            </button>
                          )}
                          {(() => {
                            const hasAffected = hasEntryAffectedParties(e, {
                              installments,
                              storageAssets,
                              partTimeJobs,
                              asfJobs,
                              irqJobs,
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
                                  setDeleteEntryTarget(e);
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
        </div>
      </section>

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
        onKeep={handleKeepEntry}
        onFinish={handleFinishEntry}
      />

      {/* Affected Records Modal for Entry Deletion */}
      {deleteEntryTarget && (() => {
        const affectedData = buildEntryDeleteOptions(deleteEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          asfJobs,
          irqJobs,
          accounts,
          entryActuals,
          entries,
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
