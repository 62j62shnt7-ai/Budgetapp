import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { buildCreditDueEntries } from '../../engine/creditCards';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

import type { CashEntry } from '../../types';

interface CashflowViewProps {
  onOpenEntryModal: (type: 'expense' | 'income') => void;
  onEditEntry?: (entry: CashEntry) => void;
  onDeductPrompt?: (entry: CashEntry, actualAmount: number) => void;
  onOpenCapModal: () => void;
  onOpenGoalModal: () => void;
  onOpenInstallmentModal: () => void;
}

export const CashflowView: React.FC<CashflowViewProps> = ({
  onOpenEntryModal,
  onEditEntry,
  onDeductPrompt,
  onOpenCapModal,
  onOpenGoalModal,
  onOpenInstallmentModal,
}) => {
  const {
    accounts,
    entries,
    updateEntry,
    deleteEntry,
    salaryPattern,
    updateSalaryPattern,
    installments,
    deleteInstallment,
    categoryCaps,
    deleteCategoryCap,
    savingsGoals,
    deleteSavingsGoal,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    recordActual,
    setActiveTab,
  } = useBudgetStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Collapsible sections
  const [salaryOpen, setSalaryOpen] = useState(true);
  const [installmentsOpen, setInstallmentsOpen] = useState(true);
  const [expenseMixOpen, setExpenseMixOpen] = useState(true);

  // Salary matrix inputs
  const currentYm = DateUtils.currentYearMonth();
  const [startMonth, setStartMonth] = useState(currentYm);
  const [quarters, setQuarters] = useState(8);

  const hasMaterializedSalary = entries.some((e) => e.source === 'salary');
  const salaryEntries = hasMaterializedSalary ? [] : buildSalaryEntries(salaryPattern, startMonth, quarters);
  const installmentEntries = buildInstallmentEntries(installments);
  const creditEntries = buildCreditDueEntries({
    accounts,
    creditDues,
    cashEntries: entries,
    archivedEntries: [],
    entryActuals,
    creditSettlementOverrides,
  });
  const allCandidate = [...entries, ...salaryEntries, ...installmentEntries, ...creditEntries];

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

  const totalIncome = filteredForecastRows
    .filter((e) => e.type === 'income')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalExpenses = filteredForecastRows
    .filter((e) => e.type === 'expense')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const netPeriod = totalIncome - totalExpenses;

  // Expense Mix grouping
  const expensesByCategory: Record<string, number> = {};
  filteredForecastRows
    .filter((e) => e.type === 'expense')
    .forEach((e) => {
      const cat = e.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (Number(e.amount) || 0);
    });

  const salaryQuarterTotal = salaryPattern.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleUpdateSalaryAmount = (index: number, newAmount: number) => {
    const copy = [...salaryPattern];
    copy[index] = { ...copy[index], amount: Math.max(0, newAmount) };
    updateSalaryPattern(copy);
  };

  return (
    <section className="view" id="cashflow" style={{ display: 'block' }}>
      {/* Summary Period Filter Bar */}
      <div className="panel" style={{ marginBottom: '18px' }}>
        <div className="panel-heading">
          <h3 style={{ margin: 0 }}>Summary period</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Forecast candidate entries list</span>
        </div>
        <div className="salary-controls" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
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
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid" id="cashflowSummary">
        <article className="metric">
          <span>Forecast income</span>
          <strong style={{ color: 'var(--green)' }}>{formatMoney(totalIncome)}</strong>
          <small>Total across the selected period</small>
        </article>
        <article className="metric">
          <span>Forecast expenses</span>
          <strong style={{ color: 'var(--red)' }}>{formatMoney(totalExpenses)}</strong>
          <small>Includes installments &amp; credit dues</small>
        </article>
        <article className="metric">
          <span>Net</span>
          <strong style={{ color: netPeriod >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {netPeriod >= 0 ? '+' : ''}{formatMoney(netPeriod)}
          </strong>
          <small>Income minus expenses</small>
        </article>
        <article className="metric">
          <span>Entries</span>
          <strong>{filteredForecastRows.length}</strong>
          <small>Active candidate records</small>
        </article>
      </div>

      {/* Category Caps & Savings Goals */}
      <div className="content-grid salary-layout" style={{ marginTop: '18px' }}>
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Category budget caps</h3>
            <button className="ghost-button" type="button" onClick={onOpenCapModal}>
              <Plus size={14} />
              <span>Set cap</span>
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
            Monthly spending limits per category with progress tracking.
          </p>
          <div id="categoryCapsList" className="stack-list">
            {categoryCaps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                No category caps set.
              </div>
            ) : (
              categoryCaps.map((cap) => (
                <div
                  key={cap.category}
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
                    <strong>{cap.category}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>
                      Cap: {formatMoney(cap.cap)}
                    </span>
                  </div>
                  <button
                    className="ghost-button"
                    style={{ padding: '4px' }}
                    onClick={() => deleteCategoryCap(cap.category)}
                  >
                    <Trash2 size={13} color="var(--red)" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Savings goals</h3>
            <button className="ghost-button" type="button" onClick={onOpenGoalModal}>
              <Plus size={14} />
              <span>Add goal</span>
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
            Track target funds and emergency reserve savings goals.
          </p>
          <div id="savingsGoalsList" className="stack-list">
            {savingsGoals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                No savings goals created.
              </div>
            ) : (
              savingsGoals.map((g) => {
                const pct = Math.min(100, Math.round(((g.current || 0) / (g.target || 1)) * 100));
                return (
                  <div
                    key={g.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--surface-soft)',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong>{g.name}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{formatMoney(g.current)} / {formatMoney(g.target)}</span>
                        <button
                          className="ghost-button"
                          style={{ padding: '2px' }}
                          onClick={() => deleteSavingsGoal(g.id)}
                        >
                          <Trash2 size={12} color="var(--red)" />
                        </button>
                      </div>
                    </div>
                    <div style={{ height: '5px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Salary Structure Collapsible */}
      <section className="panel collapsible-panel" style={{ marginTop: '18px' }}>
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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px' }}>
                Start month:
                <input
                  type="month"
                  className="form-input"
                  style={{ width: '140px', marginLeft: '6px', padding: '4px 8px' }}
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </label>
              <label style={{ fontSize: '13px' }}>
                Quarters:
                <input
                  type="number"
                  min="1"
                  max="24"
                  className="form-input"
                  style={{ width: '70px', marginLeft: '6px', padding: '4px 8px' }}
                  value={quarters}
                  onChange={(e) => setQuarters(Number(e.target.value))}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {salaryPattern.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--surface-soft)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '12px', display: 'block' }}>
                      Month +{p.monthOffset} (Day {p.day})
                    </strong>
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '90px', padding: '3px 6px', fontSize: '12px' }}
                    value={p.amount || ''}
                    onChange={(e) => handleUpdateSalaryAmount(idx, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Installments & Expense Mix */}
      <div className="content-grid salary-layout" style={{ marginTop: '18px' }}>
        <section className="panel collapsible-panel">
          <div
            className="panel-heading"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setInstallmentsOpen(!installmentsOpen)}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Installments</h3>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>({installments.length})</span>
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
                  <div
                    key={inst.id}
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
                        {formatMoney(inst.amount)}/mo · {inst.remainingMonths || inst.totalMonths} months left
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
                ))
              )}
            </div>
          )}
        </section>

        <section className="panel collapsible-panel">
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
              {Object.entries(expensesByCategory).map(([cat, amt]) => {
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
      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
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
          <div className="filters" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                const placeholder = isLoan ? 'Add draw' : isCreditSettlement ? 'Add payment' : e.type === 'income' ? 'Add actual' : 'Add spend';
                const actualValue = Number(e.actualAmount || 0);
                const plannedAmt = Number(e.amount || 0);
                const remainingAmt = Math.max(0, plannedAmt - actualValue);
                const isFull = plannedAmt > 0 && actualValue >= plannedAmt;
                const canFinish = actualValue > 0 && !e.isClosed && !isOpening;

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
                    <td className="cell-date">{DateUtils.formatDisplayDate(e.date)}</td>
                    <td className="cell-category">
                      <strong>{e.category}</strong>
                      {e.tag && (
                        <span className="source-pill" style={{ marginLeft: '4px', fontSize: '10px' }}>
                          #{e.tag}
                        </span>
                      )}
                      {e.creditType && (
                        <span className="source-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--blue)', fontWeight: 600, fontSize: '10px', marginLeft: '4px' }}>
                          💳 {e.creditType.toUpperCase()}
                        </span>
                      )}
                      {isCreditSettlement && (
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '10.5px', marginTop: '2px' }}>
                          Settlement due
                        </small>
                      )}
                    </td>
                    <td className="cell-account">{e.account.toUpperCase()}</td>
                    <td className="cell-type">
                      <span className={`pill ${e.type}`}>{e.type}</span>
                    </td>
                    <td className="cell-source">
                      <span className={`source-pill ${e.source === 'loan' ? 'loan' : ''}`}>
                        {e.source || 'manual'}
                      </span>
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
                                  const newActual = actualValue + val;
                                  recordActual(e.id, newActual, DateUtils.todayString());
                                  if (onDeductPrompt) onDeductPrompt(e, val);
                                }
                                input.value = '';
                              }
                            }}
                            onBlur={(ev) => {
                              const input = ev.currentTarget;
                              const val = Math.round(Number(input.value) || 0);
                              if (val > 0) {
                                const newActual = actualValue + val;
                                recordActual(e.id, newActual, DateUtils.todayString());
                                if (onDeductPrompt) onDeductPrompt(e, val);
                              }
                              input.value = '';
                            }}
                          />
                          {actualValue > 0 && (
                            <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                              {isLoan
                                ? `Drawn so far: ${formatMoney(actualValue)} ${isFull ? '(Full amount reached)' : `(Remaining: ${formatMoney(remainingAmt)})`}`
                                : isCreditSettlement
                                ? `Paid so far: ${formatMoney(actualValue)} ${isFull ? '(Settled in full)' : `(Remaining: ${formatMoney(remainingAmt)})`}`
                                : `Spent so far: ${formatMoney(actualValue)} ${isFull ? '(Full budget reached)' : `(Remaining: ${formatMoney(remainingAmt)})`}`}
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
                                if (window.confirm(`Finish and close "${e.category}" at current actual amount (${formatMoney(actualValue)})?\n\nRemaining budget will be closed and removed from future forecast.`)) {
                                  updateEntry(e.id, { isClosed: true, amount: actualValue });
                                }
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
    </section>
  );
};
