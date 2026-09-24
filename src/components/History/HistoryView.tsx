import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { isCreditCardExpense, calculateCreditSettlementDate, buildCreditDueEntries, isLumpCreditDueForAccount } from '../../engine/creditCards';
import { buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import type { CashEntry } from '../../types';
import { Lock, Unlock, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

export const HistoryView: React.FC = () => {
  const {
    entries,
    archivedEntries,
    installments,
    accounts,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    entryActualDates,
    clearActual,
    deleteEntry,
  } = useBudgetStore();

  const [activeHistoryTab, setActiveHistoryTab] = useState<'summary' | 'transactions'>('summary');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Analytics UI state
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState<boolean>(false);
  const [groupBy, setGroupBy] = useState<'category' | 'tag'>('category');
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'both'>('chart');

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedType('all');
    setSelectedAccount('all');
    setSelectedTag('all');
    setSearchTerm('');
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
  const allAccounts = Array.from(new Set(actualEntries.map((e) => e.account || 'cash'))).sort();
  const allTags = Array.from(new Set(actualEntries.map((e) => e.tag || e.subcategory || '').filter(Boolean))).sort();

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

    const eTag = (entry.tag || entry.subcategory || '').trim();
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
      const eTag = (entry.tag || entry.subcategory || '').toLowerCase();
      const hasDrawTag = entry.draws && entry.draws.some((d) => (d.tag || '').toLowerCase() === selectedTag.toLowerCase());
      if (eTag !== selectedTag.toLowerCase() && !hasDrawTag) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const cat = (entry.category || '').toLowerCase();
      const sub = (entry.subcategory || '').toLowerCase();
      const tag = (entry.tag || '').toLowerCase();
      const acc = (entry.account || '').toLowerCase();
      if (!cat.includes(term) && !sub.includes(term) && !tag.includes(term) && !acc.includes(term)) return false;
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
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredNet = filteredIncome - filteredExpenses;

  // Grouped Analytics breakdown
  const groups: Record<string, { count: number; total: number; type: 'income' | 'expense' }> = {};
  filteredEntries.forEach((e) => {
    const key = groupBy === 'category' ? (e.category || 'Uncategorized') : (e.tag || e.subcategory || 'Untagged');
    const amt = getFilteredEntryAmount(e);
    if (!groups[key]) {
      groups[key] = { count: 0, total: 0, type: e.type };
    }
    groups[key].count += 1;
    groups[key].total += amt;
  });

  const sortedGroups = Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  const totalAnalyticsAmount = sortedGroups.reduce((s, g) => s + g[1].total, 0);

  return (
    <section className="view" id="history" style={{ display: 'block' }}>
      {/* Subnav Tabs */}
      <div className="subnav-tabs" role="tablist" aria-label="History tabs" style={{ marginBottom: '20px' }}>
        <button
          className={`subnav-tab ${activeHistoryTab === 'summary' ? 'active' : ''}`}
          type="button"
          role="tab"
          onClick={() => setActiveHistoryTab('summary')}
        >
          📊 Monthly Summary
        </button>
        <button
          className={`subnav-tab ${activeHistoryTab === 'transactions' ? 'active' : ''}`}
          type="button"
          role="tab"
          onClick={() => setActiveHistoryTab('transactions')}
        >
          📋 Individual Validations
        </button>
      </div>

      {/* Tab 1: Monthly Summary */}
      {activeHistoryTab === 'summary' && (
        <div className="history-tab-pane active" id="historySummaryPane">
          <div className="metrics-grid" id="historyLifetimeSummary" style={{ marginBottom: '18px' }}>
            <article className="metric">
              <span>Lifetime Income</span>
              <strong id="historyLifetimeIncome" style={{ color: 'var(--green)' }}>
                {formatMoney(totalLifetimeIncome)}
              </strong>
              <small>Total realized income</small>
            </article>
            <article className="metric">
              <span>Lifetime Expenses</span>
              <strong id="historyLifetimeExpenses" style={{ color: 'var(--red)' }}>
                {formatMoney(totalLifetimeExpenses)}
              </strong>
              <small>Total realized expenses</small>
            </article>
            <article className="metric">
              <span>Lifetime Net</span>
              <strong id="historyLifetimeNet" style={{ color: lifetimeNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {lifetimeNet >= 0 ? '+' : ''}{formatMoney(lifetimeNet)}
              </strong>
              <small>Realized cash surplus</small>
            </article>
            <article className="metric">
              <span>Savings Rate</span>
              <strong id="historySavingsRate">{lifetimeSavingsRate}%</strong>
              <small>Net / Income ratio</small>
            </article>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <h3 style={{ margin: 0 }}>Monthly income and expenses</h3>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
              Monthly aggregated totals of all confirmed income and actual expenses.
            </p>
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="number">Income</th>
                    <th className="number">Expenses</th>
                    <th className="number">Net</th>
                    <th className="number">Savings Rate</th>
                  </tr>
                </thead>
                <tbody id="historyTable">
                  {monthlySummaryRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        No actual activity recorded yet. Actualize entries in Cash Flow to populate history.
                      </td>
                    </tr>
                  ) : (
                    monthlySummaryRows.map((row) => {
                      const rateBadgeClass =
                        row.savingsRate >= 20 ? 'favorable' : row.savingsRate >= 0 ? 'neutral' : 'unfavorable';
                      return (
                        <tr key={row.month}>
                          <td><strong>{row.month}</strong></td>
                          <td className="number" style={{ color: 'var(--green)', fontWeight: 600 }}>
                            +{formatMoney(row.income)}
                          </td>
                          <td className="number" style={{ color: 'var(--red)', fontWeight: 600 }}>
                            -{formatMoney(row.expenses)}
                          </td>
                          <td
                            className="number"
                            style={{
                              fontWeight: 700,
                              color: row.net >= 0 ? 'var(--green)' : 'var(--red)',
                            }}
                          >
                            {row.net >= 0 ? '+' : ''}{formatMoney(row.net)}
                          </td>
                          <td className="number">
                            <span className={`variance-pill ${rateBadgeClass}`}>{row.savingsRate}%</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Individual Validations */}
      {activeHistoryTab === 'transactions' && (
        <div className="history-tab-pane" id="historyTransactionsPane">
          <div className="panel" style={{ marginBottom: '18px' }}>
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Filter Validated Entries</h3>
              <span id="historyFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="salary-controls history-filters-bar" style={{ marginBottom: 0, display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <label>
                Month
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  <option value="all">All months</option>
                  {orderedMonths.slice().reverse().map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="expense">Expenses</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label>
                Account
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  <option value="all">All accounts</option>
                  {allAccounts.map((acc) => (
                    <option key={acc} value={acc}>{acc.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                Tag / Subcategory
                <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                  <option value="all">All tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>🏷️ {tag}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: '1 1 180px' }}>
                Search
                <input
                  type="search"
                  placeholder="Search category, tag..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </label>
              <button
                className="ghost-button"
                type="button"
                style={{ alignSelf: 'flex-end' }}
                onClick={handleResetFilters}
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="metrics-grid" id="historyFilteredSummary" style={{ marginBottom: '18px' }}>
            <article className="metric">
              <span>Filtered Income</span>
              <strong style={{ color: 'var(--green)' }}>{formatMoney(filteredIncome)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric">
              <span>Filtered Expenses</span>
              <strong style={{ color: 'var(--red)' }}>{formatMoney(filteredExpenses)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric">
              <span>Filtered Net</span>
              <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {filteredNet >= 0 ? '+' : ''}{formatMoney(filteredNet)}
              </strong>
              <small>Income minus expenses</small>
            </article>
          </div>

          {/* Collapsible Spending Analytics */}
          <section className="panel collapsible-panel" style={{ marginBottom: '18px' }}>
            <div
              className="panel-heading"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setAnalyticsCollapsed(!analyticsCollapsed)}
            >
              <div>
                <h3 style={{ margin: 0 }}>Spending Analytics &amp; Grouped Sources</h3>
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  Filtered actuals · {sortedGroups.length} groups
                </span>
              </div>
              <div
                className="history-analytics-actions"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="subnav-tabs history-groupby-tabs" style={{ padding: '2px' }}>
                  <button
                    type="button"
                    className={`subnav-tab ${groupBy === 'category' ? 'active' : ''}`}
                    style={{ padding: '4px 9px', fontSize: '11.5px' }}
                    onClick={() => setGroupBy('category')}
                  >
                    📁 Category
                  </button>
                  <button
                    type="button"
                    className={`subnav-tab ${groupBy === 'tag' ? 'active' : ''}`}
                    style={{ padding: '4px 9px', fontSize: '11.5px' }}
                    onClick={() => setGroupBy('tag')}
                  >
                    🏷️ Tag
                  </button>
                </div>
                <div className="subnav-tabs history-view-tabs" style={{ padding: '2px' }}>
                  <button
                    type="button"
                    className={`subnav-tab ${viewMode === 'chart' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setViewMode('chart')}
                  >
                    📊 Breakdown
                  </button>
                  <button
                    type="button"
                    className={`subnav-tab ${viewMode === 'table' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setViewMode('table')}
                  >
                    📋 Table
                  </button>
                  <button
                    type="button"
                    className={`subnav-tab ${viewMode === 'both' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setViewMode('both')}
                  >
                    📑 Both
                  </button>
                </div>
                <button
                  className="ghost-button collapse-toggle-btn"
                  type="button"
                  onClick={() => setAnalyticsCollapsed(!analyticsCollapsed)}
                >
                  {analyticsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            </div>

            {!analyticsCollapsed && (
              <div className="collapsible-content" style={{ marginTop: '12px' }}>
                {(viewMode === 'chart' || viewMode === 'both') && (
                  <div className="history-chart-layout" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <div className="donut-chart-container" style={{ width: '160px', height: '160px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="150" height="150" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--line)" strokeWidth="16" />
                        {sortedGroups.reduce<{ offset: number; elements: React.ReactNode[] }>((acc, [name, data], idx) => {
                          const percent = totalAnalyticsAmount > 0 ? (data.total / totalAnalyticsAmount) * 100 : 0;
                          const circumference = 2 * Math.PI * 38;
                          const strokeDash = (percent / 100) * circumference;
                          const strokeOffset = -acc.offset;
                          const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];
                          const color = colors[idx % colors.length];

                          acc.elements.push(
                            <circle
                              key={name}
                              cx="50"
                              cy="50"
                              r="38"
                              fill="transparent"
                              stroke={color}
                              strokeWidth="16"
                              strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
                              strokeDashoffset={strokeOffset}
                            />
                          );
                          acc.offset += strokeDash;
                          return acc;
                        }, { offset: 0, elements: [] }).elements}
                      </svg>
                      <div className="donut-center-label" style={{ position: 'absolute', textAlign: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Total</span>
                        <strong style={{ fontSize: '13px' }}>{formatMoney(totalAnalyticsAmount)}</strong>
                      </div>
                    </div>
                    <div className="stack-list history-scroll-list" style={{ flex: 1, minWidth: '260px', maxHeight: '200px', overflowY: 'auto' }}>
                      {sortedGroups.map(([name, data], idx) => {
                        const percent = totalAnalyticsAmount > 0 ? Math.round((data.total / totalAnalyticsAmount) * 100) : 0;
                        const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];
                        return (
                          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--surface-soft)', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: colors[idx % colors.length] }} />
                              <span style={{ fontSize: '13px', fontWeight: 600 }}>{name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({data.count})</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: '13px' }}>{formatMoney(data.total)}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>{percent}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(viewMode === 'table' || viewMode === 'both') && (
                  <div className="table-wrap compact history-scroll-table" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <table>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                        <tr>
                          <th>Group / Category</th>
                          <th>Type</th>
                          <th className="number">Entries</th>
                          <th className="number">Total Actual</th>
                          <th className="number">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedGroups.map(([name, data]) => {
                          const percent = totalAnalyticsAmount > 0 ? Math.round((data.total / totalAnalyticsAmount) * 100) : 0;
                          return (
                            <tr key={name}>
                              <td><strong>{name}</strong></td>
                              <td><span className={`badge ${data.type === 'income' ? 'badge-income' : 'badge-expense'}`}>{data.type}</span></td>
                              <td className="number">{data.count}</td>
                              <td className="number"><strong>{formatMoney(data.total)}</strong></td>
                              <td className="number">{percent}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Validated Entries Table */}
          <section className="panel">
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Individual Validated Entries</h3>
              <button
                className="ghost-button"
                type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
                onClick={() => setIsAdminUnlocked(!isAdminUnlocked)}
              >
                {isAdminUnlocked ? <Unlock size={14} color="var(--amber)" /> : <Lock size={14} />}
                <span>Admin Mode: {isAdminUnlocked ? 'Active' : 'Locked'}</span>
              </button>
            </div>

            {isAdminUnlocked && (
              <div style={{ background: 'rgba(217,142,43,0.12)', border: '1px solid rgba(217,142,43,0.35)', borderRadius: '6px', padding: '8px 12px', fontSize: '12.5px', color: 'var(--ink)', margin: '10px 0' }}>
                🔓 <strong>Admin Mode Active:</strong> You can clear actual amounts or delete entries directly from this table.
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
                        <tr key={entry.id}>
                          <td><strong>{DateUtils.formatDisplayDate(actDate)}</strong></td>
                          <td>
                            <strong>{entry.category}</strong>
                            {(entry.tag || entry.subcategory) && (
                              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                                🏷️ {entry.tag || entry.subcategory}
                              </span>
                            )}
                          </td>
                          <td><span className="account-pill">{entry.account?.toUpperCase() || 'CASH'}</span></td>
                          <td>
                            <span className={`badge ${entry.type === 'income' ? 'badge-income' : 'badge-expense'}`}>
                              {entry.type}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{entry.source || 'Manual'}</td>
                          <td className="number">{formatMoney(entry.amount)}</td>
                          <td className="number" style={{ fontWeight: 700 }}>{formatMoney(actual)}</td>
                          <td className="number">
                            <span className={`variance-pill ${varianceClass}`}>
                              {varianceText}
                            </span>
                          </td>
                          <td>
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
                                title="Revert actual"
                                onClick={() => handleClearActual(entry.id)}
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
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
