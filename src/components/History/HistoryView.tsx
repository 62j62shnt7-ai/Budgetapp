import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { isCreditCardExpense, calculateCreditSettlementDate, buildCreditDueEntries, isLumpCreditDueForAccount } from '../../engine/creditCards';
import { buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import type { CashEntry } from '../../types';
import { Lock, Unlock, Trash2, RotateCcw } from 'lucide-react';
import { HistorySummaryTab } from './HistorySummaryTab';
import { HistoryAnalyticsSection } from './HistoryAnalyticsSection';

interface HistoryViewProps {
  onEditEntry?: (entry: CashEntry) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onEditEntry }) => {
  const {
    entries,
    archivedEntries,
    installments,
    accounts,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    entryActualDates,
    recordActual,
    clearActual,
    deleteEntry,
  } = useBudgetStore();

  const [activeHistoryTab, setActiveHistoryTab] = useState<'summary' | 'transactions'>('summary');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() =>
    localStorage.getItem('budget-control-history-admin-unlocked') === 'true'
  );

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedDraws, setExpandedDraws] = useState<Set<string>>(new Set());

  // Analytics UI state
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState<boolean>(() =>
    localStorage.getItem('budget-control-history-analytics-collapsed') === 'true'
  );
  const [groupBy, setGroupBy] = useState<'category' | 'tag'>(() =>
    localStorage.getItem('budget-control-history-analytics-grouping') === 'tag' ? 'tag' : 'category'
  );
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'both'>(() => {
    const saved = localStorage.getItem('budget-control-history-analytics-view');
    return saved === 'table' || saved === 'both' ? saved : 'chart';
  });

  useEffect(() => {
    localStorage.setItem('budget-control-history-admin-unlocked', String(isAdminUnlocked));
  }, [isAdminUnlocked]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-collapsed', String(analyticsCollapsed));
  }, [analyticsCollapsed]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-grouping', groupBy);
  }, [groupBy]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-view', viewMode);
  }, [viewMode]);

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedType('all');
    setSelectedAccount('all');
    setSelectedTag('all');
    setSearchTerm('');
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTag((current) => current.toLowerCase() === tag.toLowerCase() ? 'all' : tag);
  };

  const handleClearActual = (id: string) => {
    if (window.confirm('Clear recorded actual for this entry? It will revert back to its planned forecast.')) {
      clearActual(id);
    }
  };

  const getEntryActualAmount = (entry: CashEntry): number => {
    if (!entry) return 0;
    if (entryActuals[entry.id] !== undefined) return Math.round(Number(entryActuals[entry.id]) || 0);
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
    if (entryActuals[legacyId] !== undefined) return Math.round(Number(entryActuals[legacyId]) || 0);
    if (entry.actualAmount !== undefined && entry.actualAmount !== null) return Math.round(Number(entry.actualAmount) || 0);
    return 0;
  };

  const getEntryActualDate = (entry: CashEntry): string => {
    if (!entry) return DateUtils.todayString();
    return entryActualDates[entry.id] || (entry as any).actualDate || entry.date || DateUtils.todayString();
  };

  // Actualized entries: matching legacy actualizedEntries() 1:1
  const actualEntries = React.useMemo(() => {
    const installmentEntries = buildInstallmentEntries(installments || []);
    const creditEntries = buildCreditDueEntries({
      accounts: accounts || {},
      creditDues: creditDues || {},
      cashEntries: entries || [],
      archivedEntries: archivedEntries || [],
      entryActuals: entryActuals || {},
      creditSettlementOverrides: creditSettlementOverrides || {},
    });

    // Track accounts and months already covered by manual credit due payments in entries
    const coveredSettlementKeys = new Set<string>();
    (entries || []).forEach((entry) => {
      if (getEntryActualAmount(entry) > 0) {
        ['cib', 'hsbc'].forEach((accKey) => {
          if (isLumpCreditDueForAccount(entry, accKey)) {
            const actDate = getEntryActualDate(entry);
            const mKey = DateUtils.getMonthKey(actDate);
            if (mKey) coveredSettlementKeys.add(`${accKey}-${mKey}`);
          }
        });
      }
    });

    const validCreditDues = creditEntries.filter((entry) => {
      if (getEntryActualAmount(entry) <= 0) return false;
      const parts = (entry.id || '').split('-');
      if (parts[0] === 'credit' && parts[1] === 'settlement') {
        const accKey = parts[2];
        const mKey = `${parts[3]}-${parts[4]}`;
        if (coveredSettlementKeys.has(`${accKey}-${mKey}`)) return false;
      }
      return true;
    });

    const activeCandidates = [
      ...(entries || []),
      ...installmentEntries,
      ...validCreditDues,
    ].filter((entry) => getEntryActualAmount(entry) > 0);

    const seenIds = new Set<string>();
    const dedupedActive: CashEntry[] = [];
    activeCandidates.forEach((entry) => {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        dedupedActive.push(entry);
      }
    });

    const archivedWithActuals = (archivedEntries || []).filter(
      (entry) => getEntryActualAmount(entry) > 0 && !seenIds.has(entry.id)
    );

    return [...dedupedActive, ...archivedWithActuals];
  }, [entries, archivedEntries, installments, accounts, creditDues, creditSettlementOverrides, entryActuals, entryActualDates]);

  // 1. Monthly Summary Calculation
  const monthsSet = new Set<string>();
  actualEntries.forEach((entry) => {
    if (entry.draws && entry.draws.length > 0) {
      entry.draws.forEach((d) => {
        const k = DateUtils.getMonthKey(d.date);
        if (k) monthsSet.add(k);
      });
    } else {
      const actDate = getEntryActualDate(entry);
      const k = DateUtils.getMonthKey(actDate);
      if (k) monthsSet.add(k);
    }
  });
  const orderedMonths = Array.from(monthsSet).sort();

  let totalLifetimeIncome = 0;
  let totalLifetimeExpenses = 0;

  const monthlySummaryRows = orderedMonths.map((month) => {
    let income = 0;
    let expenses = 0;

    // Track credit card actuals maturing in this settlement month to prevent double counting
    let cibOffset = actualEntries
      .filter((e) => isCreditCardExpense(e) && (e.account || e.creditType || '').toLowerCase().includes('cib') && DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'cib')) === month)
      .reduce((sum, e) => sum + getEntryActualAmount(e), 0);

    let hsbcOffset = actualEntries
      .filter((e) => isCreditCardExpense(e) && (e.account || e.creditType || '').toLowerCase().includes('hsbc') && DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'hsbc')) === month)
      .reduce((sum, e) => sum + getEntryActualAmount(e), 0);

    actualEntries.forEach((entry) => {
      if (entry.draws && entry.draws.length > 0) {
        const monthDraws = entry.draws.filter((d) => DateUtils.getMonthKey(d.date) === month);
        const monthTotal = monthDraws.reduce((sum, d) => sum + Number(d.amount || 0), 0);
        if (entry.type === 'income') income += monthTotal;
        else expenses += monthTotal;
      } else {
        const actDate = getEntryActualDate(entry);
        if (DateUtils.getMonthKey(actDate) === month) {
          const amt = getEntryActualAmount(entry);
          if (entry.type === 'income') {
            income += amt;
          } else {
            if (entry.source === 'recurring credit' || (entry.category || '').toLowerCase().includes('credit due')) {
              const acc = (entry.account || entry.creditType || '').toLowerCase();
              if (acc.includes('cib')) {
                const ded = Math.min(amt, cibOffset);
                cibOffset = Math.max(0, cibOffset - ded);
                expenses += (amt - ded);
              } else if (acc.includes('hsbc')) {
                const ded = Math.min(amt, hsbcOffset);
                hsbcOffset = Math.max(0, hsbcOffset - ded);
                expenses += (amt - ded);
              } else {
                expenses += amt;
              }
            } else {
              expenses += amt;
            }
          }
        }
      }
    });

    const net = income - expenses;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

    totalLifetimeIncome += income;
    totalLifetimeExpenses += expenses;

    return {
      month,
      income,
      expenses,
      net,
      savingsRate,
    };
  });

  const lifetimeNet = totalLifetimeIncome - totalLifetimeExpenses;
  const lifetimeSavingsRate = totalLifetimeIncome > 0 ? Math.round((lifetimeNet / totalLifetimeIncome) * 100) : 0;

  // Filter options for Individual Validations
  const getEntryTags = (entry: CashEntry): string[] => {
    const tags = [entry.tag].filter((tag): tag is string => Boolean(tag && tag.trim()));
    (entry.draws || []).forEach((draw) => {
      if (draw.tag && draw.tag.trim()) tags.push(draw.tag.trim());
    });
    return Array.from(new Set(tags));
  };

  const allAccounts = Array.from(new Set(actualEntries.map((e) => e.account || 'cash'))).sort();
  const allTags = Array.from(new Set(actualEntries.flatMap(getEntryTags))).sort((a, b) => a.localeCompare(b));
  const hasUntagged = actualEntries.some((entry) =>
    getEntryTags(entry).length === 0 || (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim())
  );

  // Helper for filtered entry amount
  const getFilteredEntryAmount = (entry: CashEntry): number => {
    const totalActual = getEntryActualAmount(entry);
    if (entry.draws && entry.draws.length > 0) {
      let trancheSum = 0;
      let matchedAny = false;
      entry.draws.forEach((d) => {
        const dAmt = Number(d.amount) || 0;
        const dMonth = DateUtils.getMonthKey(d.date);
        const dTag = (d.tag || entry.tag || '').trim();

        if (selectedMonth !== 'all' && dMonth !== selectedMonth) return;
        if (selectedTag !== 'all' && dTag.toLowerCase() !== selectedTag.toLowerCase()) return;

        trancheSum += dAmt;
        matchedAny = true;
      });
      if (matchedAny) return trancheSum;
      if (selectedMonth !== 'all' || selectedTag !== 'all') return 0;
    }

    const actDate = getEntryActualDate(entry);
    if (selectedMonth !== 'all' && DateUtils.getMonthKey(actDate) !== selectedMonth) return 0;

    const eTag = (entry.tag || '').trim();
    if (selectedTag === '__untagged__') return eTag ? 0 : totalActual;
    if (selectedTag !== 'all' && eTag.toLowerCase() !== selectedTag.toLowerCase()) return 0;

    return totalActual;
  };

  const filteredEntries = actualEntries.filter((entry) => {
    if (selectedMonth !== 'all') {
      if (entry.draws && entry.draws.length > 0) {
        const hasDraw = entry.draws.some((d) => DateUtils.getMonthKey(d.date) === selectedMonth);
        if (!hasDraw) return false;
      } else {
        const actDate = getEntryActualDate(entry);
        if (DateUtils.getMonthKey(actDate) !== selectedMonth) return false;
      }
    }

    if (selectedType !== 'all' && entry.type !== selectedType) return false;
    if (selectedAccount !== 'all' && (entry.account || 'cash').toLowerCase() !== selectedAccount.toLowerCase()) return false;

    if (selectedTag !== 'all') {
      const eTag = (entry.tag || '').toLowerCase();
      const hasUntaggedDraw = (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim());
      const hasDrawTag = (entry.draws || []).some((draw) => (draw.tag || '').toLowerCase() === selectedTag.toLowerCase());
      if (selectedTag === '__untagged__') {
        if (eTag || !hasUntaggedDraw && getEntryTags(entry).length > 0) return false;
      } else if (eTag !== selectedTag.toLowerCase() && !hasDrawTag) {
        return false;
      }
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const cat = (entry.category || '').toLowerCase();
      const sub = (entry.subcategory || '').toLowerCase();
      const tag = getEntryTags(entry).join(' ').toLowerCase();
      const acc = (entry.account || '').toLowerCase();
      const source = (entry.source || '').toLowerCase();
      if (!cat.includes(term) && !sub.includes(term) && !tag.includes(term) && !acc.includes(term) && !source.includes(term)) return false;
    }

    return true;
  });

  // Sort newest first
  filteredEntries.sort((a, b) => (getEntryActualDate(b) || '').localeCompare(getEntryActualDate(a) || ''));

  const filteredIncome = filteredEntries
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredExpenses = filteredEntries
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => {
      const amount = getFilteredEntryAmount(e);
      if (e.source === 'recurring credit' || isLumpCreditDueForAccount(e, 'hsbc') || isLumpCreditDueForAccount(e, 'cib')) {
        const account = (e.account || e.creditType || '').toLowerCase().includes('hsbc') ? 'hsbc' : 'cib';
        const month = DateUtils.getMonthKey(getEntryActualDate(e));
        const covered = actualEntries
          .filter((card) => isCreditCardExpense(card)
            && (card.account || card.creditType || '').toLowerCase().includes(account)
            && DateUtils.getMonthKey(calculateCreditSettlementDate(card.date, account)) === month)
          .reduce((total, card) => total + getEntryActualAmount(card), 0);
        return sum + Math.max(0, amount - covered);
      }
      return sum + amount;
    }, 0);

  const filteredNet = filteredIncome - filteredExpenses;

  // Grouped Analytics breakdown
  const getSmartGroupBucket = (entry: CashEntry): string => {
    const category = (entry.category || '').toLowerCase();
    const source = (entry.source || '').toLowerCase();
    if (entry.type === 'income') {
      if (category.includes('salary')) return 'Salary';
      if (category.includes('loan') || source.includes('loan')) return 'Loans Received';
      return 'Other Income';
    }
    if (/bill|utility|rent|telecom|internet|subscription|mobile|phone|vodafone|orange|etisalat|electricity|water|gas|club/.test(category)) return 'Bills & Utilities';
    if (source.includes('recurring credit') || category.includes('credit') || category.includes('cib') || category.includes('hsbc')) return 'Credit & Cards';
    if (source.includes('installment') || /installment|valyou|sympl|souhoola/.test(category)) return 'Installments';
    if (source.includes('loan') || category.includes('loan') || category.includes('repay')) return 'Loan Repayments';
    if (/food|grocer|market|dining|cafe|coffee|restaurant|fuel|car|transport|uber|health|pharmacy|doctor|personal|shopping/.test(category)) return 'Living & Daily Spend';
    return entry.category || 'General Expenses';
  };

  const groups: Record<string, { count: number; total: number; type: 'income' | 'expense' }> = {};
  filteredEntries.forEach((e) => {
    if (groupBy === 'tag' && e.draws && e.draws.length > 0) {
      e.draws.forEach((draw) => {
        if (selectedMonth !== 'all' && DateUtils.getMonthKey(draw.date) !== selectedMonth) return;
        const tag = draw.tag?.trim() || 'Untagged';
        if (selectedTag === '__untagged__' && tag !== 'Untagged') return;
        if (selectedTag !== 'all' && selectedTag !== '__untagged__'
          && selectedTag.toLowerCase() !== tag.toLowerCase()) return;
        const key = `${tag}|${e.type}`;
        if (!groups[key]) groups[key] = { count: 0, total: 0, type: e.type };
        groups[key].count += 1;
        groups[key].total += Number(draw.amount) || 0;
      });
      return;
    }
    const key = `${groupBy === 'category' ? getSmartGroupBucket(e) : (e.tag || 'Untagged')}|${e.type}`;
    let amt = getFilteredEntryAmount(e);
    if (e.type === 'expense' && (e.source === 'recurring credit'
      || isLumpCreditDueForAccount(e, 'hsbc') || isLumpCreditDueForAccount(e, 'cib'))) {
      const account = (e.account || e.creditType || '').toLowerCase().includes('hsbc') ? 'hsbc' : 'cib';
      const month = DateUtils.getMonthKey(getEntryActualDate(e));
      const covered = actualEntries
        .filter((card) => isCreditCardExpense(card)
          && (card.account || card.creditType || '').toLowerCase().includes(account)
          && DateUtils.getMonthKey(calculateCreditSettlementDate(card.date, account)) === month)
        .reduce((total, card) => total + getEntryActualAmount(card), 0);
      amt = Math.max(0, amt - covered);
    }
    if (!groups[key]) groups[key] = { count: 0, total: 0, type: e.type };
    groups[key].count += 1;
    groups[key].total += amt;
  });

  const sortedGroups = Object.entries(groups)
    .map(([key, value]) => [key.split('|')[0], value] as [string, typeof value])
    .sort((a, b) => b[1].total - a[1].total);
  const totalAnalyticsAmount = sortedGroups.reduce((s, g) => s + g[1].total, 0);

  return (
    <section className="view history-view" id="history" style={{ display: 'block' }}>
      {/* Subnav Tabs */}
      <div className="subnav-tabs history-main-tabs" role="tablist" aria-label="History tabs" style={{ marginBottom: '20px' }}>
        <button
          className={`subnav-tab ${activeHistoryTab === 'summary' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHistoryTab === 'summary'}
          aria-controls="historySummaryPane"
          onClick={() => setActiveHistoryTab('summary')}
        >
          📊 Monthly Summary
        </button>
        <button
          className={`subnav-tab ${activeHistoryTab === 'transactions' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHistoryTab === 'transactions'}
          aria-controls="historyTransactionsPane"
          onClick={() => setActiveHistoryTab('transactions')}
        >
          📋 Individual Validations
        </button>
      </div>

      {/* Tab 1: Monthly Summary */}
      {activeHistoryTab === 'summary' && (
        <HistorySummaryTab
          totalLifetimeIncome={totalLifetimeIncome}
          totalLifetimeExpenses={totalLifetimeExpenses}
          lifetimeNet={lifetimeNet}
          lifetimeSavingsRate={lifetimeSavingsRate}
          monthlySummaryRows={monthlySummaryRows}
        />
      )}

      {/* Tab 2: Individual Validations */}
      {activeHistoryTab === 'transactions' && (
        <div className="history-tab-pane" id="historyTransactionsPane">
          <div className="panel history-filter-panel" style={{ marginBottom: '18px' }}>
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Filter Validated Entries</h3>
              <span id="historyFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="history-filters-bar">
              <label className="history-filter-field">
                <span className="field-label-text">Month</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  <option value="all">All months</option>
                  {orderedMonths.slice().reverse().map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="history-filter-field">
                <span className="field-label-text">Type</span>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="expense">Expenses</option>
                  <option value="income">Income</option>
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
                  id="historySearch"
                  type="search"
                  placeholder="Search category, tag..."
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
          </div>

          <div className="metrics-grid history-summary-grid" id="historyFilteredSummary" style={{ marginBottom: '18px' }}>
            <article className="metric history-metric">
              <span>Filtered Income</span>
              <strong style={{ color: 'var(--green)' }}>{formatMoney(filteredIncome)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Expenses</span>
              <strong style={{ color: 'var(--red)' }}>{formatMoney(filteredExpenses)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Net</span>
              <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {filteredNet >= 0 ? '+' : ''}{formatMoney(filteredNet)}
              </strong>
              <small>Income minus expenses</small>
            </article>
          </div>

          {/* Collapsible Spending Analytics */}
          <HistoryAnalyticsSection
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            viewMode={viewMode}
            setViewMode={setViewMode}
            analyticsCollapsed={analyticsCollapsed}
            setAnalyticsCollapsed={setAnalyticsCollapsed}
            sortedGroups={sortedGroups}
            totalAnalyticsAmount={totalAnalyticsAmount}
          />

          {/* Validated Entries Table */}
          <section className="panel">
            <div className="panel-heading history-entries-heading">
              <h3 style={{ margin: 0 }}>Individual Validated Entries</h3>
              <button
                className="ghost-button history-admin-toggle-btn"
                type="button"
                onClick={() => setIsAdminUnlocked(!isAdminUnlocked)}
              >
                {isAdminUnlocked ? <Unlock size={14} color="var(--amber)" /> : <Lock size={14} />}
                <span>Admin Mode: {isAdminUnlocked ? 'Active' : 'Locked'}</span>
              </button>
            </div>

            {isAdminUnlocked && (
              <div style={{ background: 'rgba(217,142,43,0.12)', border: '1px solid rgba(217,142,43,0.35)', borderRadius: '6px', padding: '8px 12px', fontSize: '12.5px', color: 'var(--ink)', margin: '10px 0' }}>
                🔓 <strong>Admin Mode Active:</strong> Click an entry to edit it, or clear actual amounts and delete entries directly from this table.
              </div>
            )}

            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
              Detailed record of every planned entry that has had an actual amount spent or received.
            </p>

            <div className="table-wrap responsive-cards">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th className="number">Forecast</th>
                    <th className="number">Actual</th>
                    <th className="number">Variance</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        No validated entries match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => {
                      const actual = getEntryActualAmount(entry);
                      const actDate = getEntryActualDate(entry);
                      const plannedVal = Number(entry.amount) || 0;
                      const entryId = entry.id;
                      const hasMultipleDraws = Boolean(entry.draws && entry.draws.length > 1);
                      const isDrawsExpanded = expandedDraws.has(entryId);

                      let varianceText = '—';
                      let varianceClass = 'neutral';
                      if (plannedVal > 0) {
                        const roundedPlanned = Math.round(plannedVal);
                        const roundedActual = Math.round(actual);
                        if (entry.type === 'expense') {
                          const diff = roundedPlanned - roundedActual;
                          if (diff > 0) {
                            varianceText = `+${formatMoney(diff)} under`;
                            varianceClass = 'favorable';
                          } else if (diff < 0) {
                            varianceText = `-${formatMoney(Math.abs(diff))} over`;
                            varianceClass = 'unfavorable';
                          } else {
                            varianceText = 'On budget';
                            varianceClass = 'neutral';
                          }
                        } else {
                          const diff = roundedActual - roundedPlanned;
                          if (diff > 0) {
                            varianceText = `+${formatMoney(diff)} extra`;
                            varianceClass = 'favorable';
                          } else if (diff < 0) {
                            varianceText = `-${formatMoney(Math.abs(diff))} short`;
                            varianceClass = 'unfavorable';
                          } else {
                            varianceText = 'Exact';
                            varianceClass = 'neutral';
                          }
                        }
                      }

                      return (
                        <React.Fragment key={entryId}>
                        <tr
                          className={isAdminUnlocked && onEditEntry ? 'history-entry-editable' : undefined}
                          onClick={(event) => {
                            if (!isAdminUnlocked || !onEditEntry) return;
                            const target = event.target as HTMLElement;
                            if (target.closest('button, input, select, textarea, a')) return;
                            onEditEntry(entry);
                          }}
                          onKeyDown={(event) => {
                            if (!isAdminUnlocked || !onEditEntry || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            onEditEntry(entry);
                          }}
                          tabIndex={isAdminUnlocked && onEditEntry ? 0 : undefined}
                          role={isAdminUnlocked && onEditEntry ? 'button' : undefined}
                          title={isAdminUnlocked && onEditEntry ? 'Click to edit this entry' : undefined}
                        >
                          <td className="cell-date">
                            <strong>{DateUtils.formatDisplayDate(actDate)}</strong>
                            {hasMultipleDraws && (
                              <button
                                type="button"
                                className="ghost-button history-draws-toggle-btn"
                                style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px', padding: '2px 8px', fontSize: '11px', borderRadius: '6px' }}
                                onClick={() => setExpandedDraws((current) => {
                                  const next = new Set(current);
                                  if (next.has(entryId)) next.delete(entryId);
                                  else next.add(entryId);
                                  return next;
                                })}
                              >
                                {isDrawsExpanded ? '▴ Hide subspends' : `▾ ${entry.draws?.length} subspends`}
                              </button>
                            )}
                          </td>
                          <td className="cell-category">
                            <strong>{entry.category}</strong>
                            {getEntryTags(entry).map((tag) => (
                              <button
                                key={`${entry.id}-${tag}`}
                                type="button"
                                className={`history-tag-filter ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`}
                                onClick={() => handleTagFilter(tag)}
                                aria-pressed={selectedTag.toLowerCase() === tag.toLowerCase()}
                              >
                                🏷️ {tag}
                              </button>
                            ))}
                          </td>
                          <td className="cell-account"><span className="account-pill">{entry.account?.toUpperCase() || 'CASH'}</span></td>
                          <td className="cell-type">
                            <span className={`badge ${entry.type === 'income' ? 'badge-income' : 'badge-expense'}`}>
                              {entry.type}
                            </span>
                          </td>
                          <td className="cell-source" style={{ fontSize: '12px', color: 'var(--muted)' }}>{entry.source || 'Manual'}</td>
                          <td className="cell-planned number">{formatMoney(entry.amount)}</td>
                          <td className="cell-actual number" style={{ fontWeight: 700 }}>
                            {isAdminUnlocked ? (
                              <div className="history-admin-input-wrap">
                                <span className="mobile-cell-label">Actual:</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  defaultValue={actual || ''}
                                  className="history-admin-input form-input"
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      const value = Math.round(Number(event.currentTarget.value) || 0);
                                      if (value <= 0) clearActual(entry.id);
                                      else recordActual(entry.id, value, actDate);
                                      event.currentTarget.blur();
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="history-actual-display">
                                <span className="mobile-cell-label">Actual: </span>
                                {formatMoney(actual)}
                              </span>
                            )}
                          </td>
                          <td className="cell-variance number">
                            <span className={`variance-pill ${varianceClass}`}>
                              {varianceText}
                            </span>
                          </td>
                          <td className="cell-actions">
                            {isAdminUnlocked ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  className="ghost-button icon-button"
                                  type="button"
                                  title="Clear actual (revert to forecast)"
                                  onClick={() => handleClearActual(entry.id)}
                                >
                                  <RotateCcw size={13} />
                                </button>
                                <button
                                  className="delete-button icon-button"
                                  type="button"
                                  title="Delete entry"
                                  onClick={() => deleteEntry(entry.id)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="ghost-button icon-button"
                                type="button"
                                title="Reset actual amount to 0"
                                onClick={() => handleClearActual(entry.id)}
                              >
                                <span style={{ fontSize: '11px' }}>Clear</span>
                              </button>
                            )}
                          </td>
                        </tr>
                        {hasMultipleDraws && isDrawsExpanded && (
                          <tr className="history-draws-subrow">
                            <td colSpan={9} className="cell-draws-details" style={{ padding: '0 16px 12px 36px', background: 'var(--surface-subtle, rgba(0,0,0,0.02))' }}>
                              <div style={{ marginTop: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', fontSize: '12px' }}>
                                  <span>Breakdown of {entry.draws?.length} payment tranches for {entry.category || 'Expense'}</span>
                                  <strong>Total spent: {formatMoney(actual)}</strong>
                                </div>
                                <div className="table-wrap compact">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>Payment Date</th>
                                        <th>Subcategory Tag</th>
                                        <th>Account</th>
                                        <th className="number">Tranche Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entry.draws?.map((draw, index) => (
                                        <tr key={`${entryId}-draw-${index}`}>
                                          <td>{DateUtils.formatDisplayDate(draw.date)}</td>
                                          <td>
                                            {draw.tag ? (
                                              <button
                                                type="button"
                                                className={`history-tag-filter ${selectedTag.toLowerCase() === draw.tag.toLowerCase() ? 'active' : ''}`}
                                                onClick={() => handleTagFilter(draw.tag as string)}
                                                aria-pressed={selectedTag.toLowerCase() === draw.tag.toLowerCase()}
                                              >
                                                🏷️ {draw.tag}
                                              </button>
                                            ) : '—'}
                                          </td>
                                          <td>{(draw.account || entry.account || 'cash').toUpperCase()}</td>
                                          <td className="number">{formatMoney(Number(draw.amount) || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};
