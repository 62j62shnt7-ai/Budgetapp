import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  buildSalaryEntries,
  buildInstallmentEntries,
  groupPhaseForMonthIndex,
  monthIndexFromYearMonth,
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
} from '../../engine/forecast';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

import type { CashEntry } from '../../types';
import { ExactAmountDecisionModal } from '../Modals/ExactAmountDecisionModal';
import { AdjustLoanRepaymentModal, type LinkedRepaymentInfo } from '../Modals/AdjustLoanRepaymentModal';

interface CashflowViewProps {
  onOpenEntryModal: (type: 'expense' | 'income') => void;
  onEditEntry?: (entry: CashEntry) => void;
  onDeductPrompt?: (entry: CashEntry, actualAmount: number) => void;
  onOpenInstallmentModal: () => void;
}

export const CashflowView: React.FC<CashflowViewProps> = ({
  onOpenEntryModal,
  onEditEntry,
  onDeductPrompt,
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
    entryActuals,
    entryActualDates,
    deletedForecasts,
    recordActual,
    setActiveTab,
  } = useBudgetStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleActualSpend = (entry: CashEntry, addedAmount: number, currentActual: number) => {
    const newActual = currentActual + addedAmount;
    recordActual(entry.id, newActual, DateUtils.todayString());
    if (onDeductPrompt) onDeductPrompt(entry, addedAmount);

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

    if (newActual >= plannedAmount && plannedAmount > 0 && !entry.isClosed) {
      setExactDecisionData({
        entry,
        actualAmount: newActual,
        plannedAmount,
      });
    }
  };

  const handleScaleLoanRepayment = (scaledAmount: number) => {
    if (!loanAdjustmentData) return;
    const { inflowEntry, linkedInfo, totalDrawn, plannedLoan } = loanAdjustmentData;
    if (linkedInfo.type === 'single') {
      updateEntry(linkedInfo.target.id, { amount: scaledAmount });
    } else {
      updateInstallment(linkedInfo.target.id, { amount: scaledAmount });
    }
    setLoanAdjustmentData(null);

    if (totalDrawn >= plannedLoan && plannedLoan > 0 && !inflowEntry.isClosed) {
      setExactDecisionData({
        entry: inflowEntry,
        actualAmount: totalDrawn,
        plannedAmount: plannedLoan,
      });
    }
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
    }
  };

  const handleFinishEntry = () => {
    if (!exactDecisionData) return;
    const { entry, actualAmount } = exactDecisionData;
    updateEntry(entry.id, { isClosed: true, keepOngoing: false, amount: actualAmount });

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

    setExactDecisionData(null);
  };

  const handleKeepEntry = () => {
    if (!exactDecisionData) return;
    const { entry } = exactDecisionData;
    updateEntry(entry.id, { keepOngoing: true, isClosed: false });
    setExactDecisionData(null);
  };

  // Collapsible sections
  const [salaryOpen, setSalaryOpen] = useState<boolean>(() =>
    localStorage.getItem('budget-control-salary-collapsed') !== 'true'
  );
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

  const hasMaterializedSalary = entries.some((e) => e.source === 'salary');
  const salaryEntries = hasMaterializedSalary ? [] : buildSalaryEntries(salaryPattern, startMonth, quarters, salaryAnchorMonth);
  const installmentEntries = buildInstallmentEntries(installments);
  const creditEntries = buildCreditDueEntries({
    accounts,
    creditDues,
    cashEntries: entries,
    archivedEntries: [],
    entryActuals,
    creditSettlementOverrides,
  });
  const forecastCandidates = getForecastCandidateEntries(
    [...entries, ...salaryEntries],
    installmentEntries,
    creditEntries,
    deletedForecasts,
  );
  const allCandidate = forecastCandidates
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
  const forecastRows = getActiveForecastEntries(
    [...entries, ...salaryEntries],
    installmentEntries,
    creditEntries,
    deletedForecasts,
    entryActuals,
  );

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

  // Categories list for dropdown
  const allCategories = React.useMemo(() => {
    const set = new Set<string>();
    [...openingRows, ...allCandidate].forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set).sort();
  }, [openingRows, allCandidate]);

  // Filter entries
  const filteredForecastRows = allCandidate.filter((e) => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
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
    if (typeFilter === 'expense') return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return e.category.toLowerCase().includes(term) || e.account.toLowerCase().includes(term);
    }
    return true;
  });

  const allDisplayRows = [...filteredOpeningRows, ...filteredForecastRows];

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
  const salaryGroupMonths = (offset: number) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const anchorIndex = monthIndexFromYearMonth(salaryAnchorMonth || currentYm);
    let firstMatch = anchorIndex;
    while (groupPhaseForMonthIndex(firstMatch, salaryAnchorMonth) !== offset) firstMatch += 1;
    return [0, 1, 2, 3]
      .map((quarter) => monthNames[((firstMatch + quarter * 3) % 12 + 12) % 12])
      .join(', ');
  };

  const handleUpdateSalaryAmount = (index: number, newAmount: number) => {
    const copy = [...salaryPattern];
    copy[index] = { ...copy[index], amount: Math.max(0, newAmount) };
    updateSalaryPattern(copy);
  };

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

  const getInstallmentProgress = (installment: (typeof installments)[number]) => {
    const total = Math.max(0, Number(installment.remainingMonths) || Number(installment.totalMonths) || 0);
    const paid = Array.from({ length: total }, (_, index) => {
      const actual = Number(entryActuals[`installment-${installment.id}-${index}`]) || 0;
      return actual >= (Number(installment.amount) || 0) && actual > 0;
    }).filter(Boolean).length;
    return { total, paid, remaining: Math.max(0, total - paid) };
  };

  const installmentMonthlyTotal = installments.reduce((sum, installment) => sum + (Number(installment.amount) || 0), 0);
  const installmentOutstandingTotal = installments.reduce((sum, installment) => {
    const progress = getInstallmentProgress(installment);
    return sum + (Number(installment.amount) || 0) * progress.remaining;
  }, 0);
  const installmentProgressSummary = installments.reduce(
    (summary, installment) => {
      const progress = getInstallmentProgress(installment);
      return {
        paid: summary.paid + progress.paid,
        total: summary.total + progress.total,
        remaining: summary.remaining + progress.remaining,
      };
    },
    { paid: 0, total: 0, remaining: 0 },
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
        <div className="salary-controls cashflow-filters" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            From:
            <input
              type="date"
              className="form-input"
              style={{ width: '150px', padding: '4px 8px' }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            To:
            <input
              type="date"
              className="form-input"
              style={{ width: '150px', padding: '4px 8px' }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            Use full list
          </button>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
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
      <section className="panel collapsible-panel cashflow-collapsible-panel" style={{ marginTop: '18px' }}>
        <div
          className="panel-heading"
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => setSalaryOpen(!salaryOpen)}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Salary structure</h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Quarter total: <strong style={{ color: 'var(--green)' }}>{formatMoney(salaryQuarterTotal)}</strong>
            </span>
          </div>
          <button className="ghost-button" type="button">
            {salaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {salaryOpen && (
          <div className="collapsible-content" style={{ marginTop: '12px' }}>
            <div className="salary-structure-controls" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              <label>
                Start month:
                <input
                  type="month"
                  className="form-input salary-start-month"
                  style={{ marginLeft: '6px', padding: '4px 8px' }}
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </label>
              <label>
                Quarters:
                <input
                  type="number"
                  min="1"
                  max="24"
                  className="form-input"
                  style={{ width: '70px', marginLeft: '6px', padding: '4px 8px' }}
                  value={quarters}
                  onChange={(e) => setQuarters(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
              <button className="ghost-button" type="button" onClick={handleAddSalaryPayment}>
                <Plus size={15} /> Add payment
              </button>
              <button className="primary-button salary-populate-button" type="button" onClick={handlePopulateSalaryForecast}>
                Populate forecast
              </button>
              <button className="ghost-button salary-clear-button" type="button" onClick={() => handleClearSalaryForecast(false)}>
                Clear period
              </button>
              <button className="ghost-button salary-clear-all-button" type="button" onClick={() => handleClearSalaryForecast(true)}>
                Clear all
              </button>
            </div>

            <div className="salary-structure-grid">
              {salaryPattern.map((p, idx) => (
                <div
                  key={idx}
                  className="salary-structure-card"
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'var(--surface-soft)',
                  }}
                >
                  <div className="salary-structure-card-label">
                    <strong>
                      Payment {idx + 1} · {salaryGroupMonths(Number(p.monthOffset) || 0)}
                    </strong>
                    <span>Repeats every three months in the selected group</span>
                  </div>
                  <div className="salary-structure-card-fields">
                    <label>
                      <span>Group</span>
                      <select
                        className="form-input"
                        aria-label={`Salary payment group for payment ${idx + 1}`}
                        value={Number(p.monthOffset) || 0}
                        onChange={(e) => handleUpdateSalaryPayment(idx, { monthOffset: Number(e.target.value) })}
                      >
                        <option value={0}>Group 1</option>
                        <option value={1}>Group 2</option>
                        <option value={2}>Group 3</option>
                      </select>
                    </label>
                    <label>
                      <span>Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="form-input"
                        aria-label={`Salary payment day for payment ${idx + 1}`}
                        value={p.day || ''}
                        onChange={(e) => handleUpdateSalaryPayment(idx, { day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                      />
                    </label>
                    <label>
                      <span>Amount</span>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        aria-label={`Salary amount for payment ${idx + 1}`}
                        value={p.amount || ''}
                        onChange={(e) => handleUpdateSalaryAmount(idx, Number(e.target.value))}
                      />
                    </label>
                    <button
                      className="icon-button salary-delete-button"
                      type="button"
                      aria-label={`Delete salary payment ${idx + 1}`}
                      onClick={() => handleDeleteSalaryPayment(idx)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Installments & Expense Mix */}
      <div className="content-grid salary-layout cashflow-card-grid" style={{ marginTop: '18px' }}>
        <section className="panel collapsible-panel cashflow-collapsible-panel">
          <div
            className="panel-heading"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setInstallmentsOpen(!installmentsOpen)}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Installments</h3>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>({installments.length})</span>
              {!installmentsOpen && installments.length > 0 && (
                <span className="collapsed-installment-summary">
                  <strong>{formatMoney(installmentMonthlyTotal)}/mo</strong>
                  <span className="collapsed-installment-total">
                    Total: {formatMoney(installmentOutstandingTotal)}
                  </span>
                  <span>
                    {installmentProgressSummary.paid > 0
                      ? `${installmentProgressSummary.paid} of ${installmentProgressSummary.total} paid`
                      : `${installmentProgressSummary.total} scheduled`}
                  </span>
                  <span className="collapsed-installment-remaining">
                    {installmentProgressSummary.remaining} remaining
                  </span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="ghost-button"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInstallmentModal();
                }}
              >
                <Plus size={14} />
                <span>Installment</span>
              </button>
              {installmentsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {installmentsOpen && (
            <div className="collapsible-content" style={{ marginTop: '12px' }}>
              {installments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                  No installments recorded.
                </div>
              ) : (
                installments.map((inst) => (
                  (() => {
                    const progress = getInstallmentProgress(inst);
                    return (
                  <div
                    key={inst.id}
                    className="installment-summary-card"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'var(--surface-soft)',
                      marginBottom: '6px',
                    }}
                  >
                    <div>
                      <strong>{inst.name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>
                        {formatMoney(inst.amount)}/mo · Total: {formatMoney((Number(inst.amount) || 0) * progress.total)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>
                        {progress.paid > 0 ? `Paid ${progress.paid} of ${progress.total}` : `${progress.total} scheduled`}
                      </span>
                      <span className={`installment-progress-label ${progress.remaining === 0 ? 'complete' : ''}`}>
                        {progress.remaining === 0
                          ? 'Completed · Remaining: 0'
                          : `${progress.remaining} remaining · ${formatMoney((Number(inst.amount) || 0) * progress.remaining)} outstanding`}
                      </span>
                    </div>
                    <button
                      className="ghost-button"
                      style={{ padding: '4px' }}
                      onClick={() => deleteInstallment(inst.id)}
                    >
                      <Trash2 size={13} color="var(--red)" />
                    </button>
                  </div>
                    );
                  })()
                ))
              )}
            </div>
          )}
        </section>

        <section className="panel collapsible-panel cashflow-collapsible-panel">
          <div
            className="panel-heading"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setExpenseMixOpen(!expenseMixOpen)}
          >
            <h3 style={{ margin: 0 }}>Expense mix</h3>
            {expenseMixOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>

          {expenseMixOpen && (
            <div className="collapsible-content" style={{ marginTop: '12px' }}>
              {Object.entries(expensesByCategory)
                .sort(([, amountA], [, amountB]) => amountB - amountA)
                .map(([cat, amt]) => {
                  const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                  return (
                    <div key={cat} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                        <span>{cat}</span>
                        <strong>{formatMoney(amt)} ({pct}%)</strong>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(0,0,0,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--red)' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      </div>

      {/* Forecast Entries Table */}
      <section className="panel cashflow-table-panel" style={{ marginTop: '18px' }}>
        <div className="panel-heading cashflow-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Forecast entries</h3>
            <button
              className="ghost-button"
              type="button"
              style={{ fontSize: '12px', padding: '3px 8px' }}
              onClick={() => onOpenEntryModal('expense')}
            >
              <Plus size={14} style={{ marginRight: '4px' }} />
              <span>Add entry</span>
            </button>
          </div>
          <div className="filters cashflow-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              id="typeFilter"
              className="form-select"
              style={{ width: '110px', padding: '4px 8px', fontSize: '12px' }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
            >
              <option value="all">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select
              id="categoryFilter"
              className="form-select"
              style={{ width: '140px', padding: '4px 8px', fontSize: '12px' }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              id="searchEntries"
              type="search"
              placeholder="Search category, tag, account..."
              className="form-input"
              style={{ width: '180px', padding: '4px 8px', fontSize: '12px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
                <th className="number" style={{ minWidth: '170px' }}>Actual</th>
                <th style={{ width: '100px' }}></th>
              </tr>
            </thead>
            <tbody>
              {allDisplayRows.map((e) => {
                const isOpening = e.source === 'starting balance';
                const isLoan = (e.source || '').toLowerCase().includes('loan') || (e.category || '').toLowerCase().includes('loan');
                const isCreditSettlement = (e.source || '').toLowerCase().includes('credit') || (e.id && e.id.startsWith('credit-settlement-'));
                const isCardPurchase = isCreditCardExpense(e);
                const placeholder = isLoan ? 'Add draw' : isCreditSettlement ? 'Add payment' : e.type === 'income' ? 'Add actual' : 'Add spend';
                const actualValue = getEntryActualAmount(e, entryActuals);
                const originalEntry = entries.find((entry) => entry.id === e.id) || e;
                const plannedAmt = Number(originalEntry.amount || e.amount || 0);
                const remainingAmt = Math.max(0, plannedAmt - actualValue);
                const isFull = plannedAmt > 0 && actualValue >= plannedAmt;
                const isPartial = e.type === 'expense' || isLoan;
                const isPastDate = Boolean(e.date && e.date < DateUtils.todayString());
                const ongoing = isOngoingEntry(e, entryActuals) || (isPartial && !e.isClosed && remainingAmt > 0 && (actualValue > 0 || isPastDate));
                const canFinish = isPartial && !e.isClosed && (remainingAmt > 0 || ongoing) && (actualValue > 0 || isPastDate || isLoan) && !isOpening;
                const actualDate = actualValue > 0 ? getEntryActualDate(e, entryActualDates) : '';
                const dateLabel = ongoing
                  ? `${DateUtils.formatDisplayDate(e.date)} → ${actualDate && actualDate !== DateUtils.todayString()
                    ? DateUtils.formatDisplayDate(actualDate)
                    : 'Today'}`
                  : DateUtils.formatDisplayDate(e.date);

                return (
                  <tr
                    key={e.id}
                    className={`entry-row ${isOpening ? 'opening-balance-row' : isLoan ? 'loan-entry-row' : ''}`}
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
                      <strong>{e.category}</strong>
                      {[e.tag, ...(e.draws || []).map((draw) => draw.tag)]
                        .filter((tag, index, tags): tag is string => Boolean(tag) && tags.indexOf(tag) === index)
                        .map((tag) => (
                        <span key={`${e.id}-${tag}`} className="cashflow-tag-pill">
                          <span aria-hidden="true">#</span>{tag}
                        </span>
                        ))}
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
                        </div>
                      )}
                    </td>
                    <td className="cell-account">{e.account.toUpperCase()}</td>
                    <td className="cell-type">
                      <span className={`pill ${e.type}`}>{e.type}</span>
                    </td>
                    <td className="cell-source">
                      {isCardPurchase ? (
                        <span className="source-pill" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                          💳 Settles {DateUtils.formatDisplayDate(calculateCreditSettlementDate(e.date, e.creditType || e.account || ''))}
                        </span>
                      ) : isCreditSettlement || isCreditDueLumpSum(e) ? (
                        <span className="source-pill credit-due-pill">🏛️ Credit Due</span>
                      ) : (
                        <span className={`source-pill ${e.source === 'loan' ? 'loan' : ''}`}>
                          {e.source || 'manual'}
                        </span>
                      )}
                    </td>
                    <td className="cell-amount number" style={{ color: e.type === 'income' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {e.type === 'income' ? '+' : '-'}{formatMoney(e.amount)}
                    </td>
                    <td className="cell-actual number">
                      {isOpening ? (
                        <span>—</span>
                      ) : (
                        <div>
                          <input
                            className="inline-actual-input form-input"
                            style={{ width: '110px', padding: '3px 6px', fontSize: '12px' }}
                            placeholder={placeholder}
                            type="number"
                            min="0"
                            step="0.01"
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') {
                                ev.preventDefault();
                                const input = ev.currentTarget;
                                const val = Math.round(Number(input.value) || 0);
                                if (val > 0) {
                                  handleActualSpend(e, val, actualValue);
                                }
                                input.value = '';
                              }
                            }}
                            onBlur={(ev) => {
                              const input = ev.currentTarget;
                              const val = Math.round(Number(input.value) || 0);
                              if (val > 0) {
                                handleActualSpend(e, val, actualValue);
                              }
                              input.value = '';
                            }}
                          />
                          {actualValue > 0 && (
                            <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                              {isLoan
                                ? `Drawn so far: ${formatMoney(actualValue)} ${isFull ? '(Full amount reached · Ongoing)' : `(Remaining: ${formatMoney(remainingAmt)})`}`
                                : isCreditSettlement
                                ? `Paid so far: ${formatMoney(actualValue)} ${isFull ? '(Settled in full)' : `(Remaining: ${formatMoney(remainingAmt)})`}`
                                : `Spent so far: ${formatMoney(actualValue)} ${isFull ? '(Full budget reached · Ongoing)' : `(Remaining: ${formatMoney(remainingAmt)})`}`}
                            </small>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="cell-actions number">
                      {isOpening ? null : (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {canFinish && (
                            <button
                              className="ghost-button finish-loan-btn"
                              type="button"
                              style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--green)', borderColor: 'var(--green)' }}
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
                          <button
                            className="delete-button"
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            title="Delete entry"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (window.confirm(`Delete entry "${e.category}" (${formatMoney(e.amount)})?`)) {
                                deleteEntry(e.id);
                              }
                            }}
                          >
                            Delete
                          </button>
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
    </section>
  );
};
