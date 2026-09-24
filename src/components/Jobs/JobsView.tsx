import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { calculateJobFinancials, formatJobCurrency } from '../../engine/jobs';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import type { JobItem } from '../../types';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface JobsViewProps {
  onOpenJobModal: (job?: JobItem) => void;
  onOpenLogDayModal: (jobId: string) => void;
  onOpenExpenseModal: (jobId: string) => void;
  onOpenPaymentModal: (jobId: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({
  onOpenJobModal,
  onOpenLogDayModal,
  onOpenExpenseModal,
  onOpenPaymentModal,
}) => {
  const { partTimeJobs, rates, deleteJob, saveJob } = useBudgetStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'invoiced' | 'partial' | 'paid'>('all');
  const [activeCurrencyFilter, setActiveCurrencyFilter] = useState<string>('all');
  const [activeSort, setActiveSort] = useState<'newest' | 'oldest'>('newest');
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

  const toggleExpand = (jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  // 1. Calculate Aggregated Metrics across all jobs
  let totalPendingEgp = 0;
  const pendingByCurrency: Record<string, number> = {};
  let totalPaidEgp = 0;
  let paidJobsCount = 0;
  let activeJobsCount = 0;
  let totalReimbursableEgp = 0;

  partTimeJobs.forEach((job) => {
    const fin = calculateJobFinancials(job, rates);
    const curr = fin.currency;

    totalPaidEgp += fin.totalPaidEgp;
    if (fin.computedStatus === 'paid') {
      paidJobsCount++;
    }

    if (fin.remainingBalance > 0 && (fin.computedStatus === 'invoiced' || fin.computedStatus === 'partial')) {
      totalPendingEgp += fin.remainingBalanceEgp;
      pendingByCurrency[curr] = (pendingByCurrency[curr] || 0) + fin.remainingBalance;
    }

    if (fin.computedStatus === 'active') {
      activeJobsCount++;
    }

    if (fin.computedStatus !== 'paid') {
      totalReimbursableEgp += fin.billableExpensesEgp;
    }
  });

  // 2. Filter & Sort Jobs
  const filteredJobs = partTimeJobs.filter((job) => {
    const fin = calculateJobFinancials(job, rates);
    if (activeFilter !== 'all') {
      if (activeFilter === 'partial' && fin.computedStatus !== 'partial') return false;
      if (activeFilter === 'active' && fin.computedStatus !== 'active') return false;
      if (activeFilter === 'invoiced' && fin.computedStatus !== 'invoiced') return false;
      if (activeFilter === 'paid' && fin.computedStatus !== 'paid') return false;
    }
    if (activeCurrencyFilter !== 'all' && (job.currency || 'USD').toUpperCase() !== activeCurrencyFilter.toUpperCase()) {
      return false;
    }
    return true;
  });

  filteredJobs.sort((a, b) => {
    const dateA = a.startDate || (a.daysWorked && a.daysWorked[0]?.date) || '';
    const dateB = b.startDate || (b.daysWorked && b.daysWorked[0]?.date) || '';
    if (dateA && dateB) {
      return activeSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    return 0;
  });

  const handleDeleteDay = (job: JobItem, dayIdx: number) => {
    const days = [...(job.daysWorked || [])];
    days.splice(dayIdx, 1);
    saveJob('partTime', { ...job, daysWorked: days });
  };

  const handleDeleteExpense = (job: JobItem, expenseId: string) => {
    const expenses = (job.expenses || []).filter((e) => e.id !== expenseId);
    saveJob('partTime', { ...job, expenses });
  };

  const handleDeletePayment = (job: JobItem, paymentId: string) => {
    const payments = (job.payments || []).filter((p) => p.id !== paymentId);
    saveJob('partTime', { ...job, payments });
  };

  return (
    <section className="view" id="jobs" style={{ display: 'block' }}>
      {/* Top Metrics Cards */}
      <div className="jobs-kpis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <div className="job-kpi-card glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
          <span className="job-kpi-label" style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Pending Invoices
          </span>
          <div className="job-kpi-val" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--amber)' }}>
            {formatMoney(totalPendingEgp)}
          </div>
          <div className="job-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
            {Object.keys(pendingByCurrency).length === 0
              ? 'No pending receivables'
              : Object.entries(pendingByCurrency)
                  .map(([curr, amt]) => `${formatJobCurrency(amt, curr)} due`)
                  .join(' + ')}
          </div>
        </div>

        <div className="job-kpi-card glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
          <span className="job-kpi-label" style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Collected / Paid
          </span>
          <div className="job-kpi-val text-green" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--green)' }}>
            {formatMoney(totalPaidEgp)}
          </div>
          <div className="job-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
            {paidJobsCount} {paidJobsCount === 1 ? 'job' : 'jobs'} settled
          </div>
        </div>

        <div className="job-kpi-card glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
          <span className="job-kpi-label" style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Active Work
          </span>
          <div className="job-kpi-val text-blue" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0ea5e9' }}>
            {activeJobsCount}
          </div>
          <div className="job-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
            {activeJobsCount} {activeJobsCount === 1 ? 'job' : 'jobs'} in progress
          </div>
        </div>

        <div className="job-kpi-card glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
          <span className="job-kpi-label" style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Reimbursable Expenses
          </span>
          <div className="job-kpi-val text-amber" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
            {formatMoney(totalReimbursableEgp)}
          </div>
          <div className="job-kpi-sub" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
            Billed to clients
          </div>
        </div>
      </div>

      {/* Controls Toolbar */}
      <div className="jobs-toolbar glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '12px 16px', borderRadius: '10px', marginBottom: '18px' }}>
        <div className="jobs-filters-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(['all', 'active', 'invoiced', 'partial', 'paid'] as const).map((filter) => (
            <button
              key={filter}
              className={`job-filter-pill ${activeFilter === filter ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveFilter(filter)}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: '1px solid var(--line)',
                background: activeFilter === filter ? 'var(--ink)' : 'transparent',
                color: activeFilter === filter ? 'var(--surface)' : 'var(--ink)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {filter === 'all' ? 'All Jobs' : filter}
            </button>
          ))}

          <select
            value={activeCurrencyFilter}
            onChange={(e) => setActiveCurrencyFilter(e.target.value)}
            className="job-filter-select"
            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}
          >
            <option value="all">All Currencies</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="EGP">EGP (Local)</option>
            <option value="GBP">GBP (£)</option>
            <option value="SAR">SAR (﷼)</option>
            <option value="AED">AED (د.إ)</option>
          </select>

          <select
            value={activeSort}
            onChange={(e) => setActiveSort(e.target.value as any)}
            className="job-filter-select"
            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}
          >
            <option value="newest">📅 Newest Date</option>
            <option value="oldest">📅 Oldest Date</option>
          </select>
        </div>

        <button className="primary-button" type="button" onClick={() => onOpenJobModal()}>
          <Plus size={14} style={{ marginRight: '4px' }} />
          <span>+ New Job / Project</span>
        </button>
      </div>

      {/* Jobs Stream */}
      <div id="jobsList" className="jobs-stream" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredJobs.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '48px 20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '38px', marginBottom: '12px' }}>💼</div>
            <h3 style={{ fontSize: '18px', marginBottom: '6px', color: 'var(--ink)' }}>No part-time jobs found</h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', maxWidth: '440px', margin: '0 auto 16px' }}>
              {partTimeJobs.length === 0
                ? "You haven't added any part-time jobs yet. Track your daily rates, milestones, client expenses, and multi-currency income."
                : 'No jobs match the current filter selection.'}
            </p>
            <button className="primary-button" type="button" onClick={() => onOpenJobModal()}>
              + Create New Job
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const fin = calculateJobFinancials(job, rates);
            const isExpanded = expandedJobIds.has(job.id);
            const days = job.daysWorked || [];
            const expenses = job.expenses || [];
            const payments = job.payments || [];

            return (
              <article
                key={job.id}
                className="job-card glass-panel"
                style={{
                  borderRadius: '12px',
                  padding: '18px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className={`badge ${fin.computedStatus === 'paid' ? 'badge-income' : fin.computedStatus === 'invoiced' ? 'badge-warning' : 'badge-neutral'}`}>
                        {fin.computedStatus.toUpperCase()}
                      </span>
                      {job.client && (
                        <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                          🏢 {job.client}
                        </span>
                      )}
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: 'var(--ink)' }}>{job.title}</h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)', flexWrap: 'wrap' }}>
                      {job.startDate && (
                        <span>📅 {DateUtils.formatDisplayDate(job.startDate)} {job.endDate ? `to ${DateUtils.formatDisplayDate(job.endDate)}` : '– Ongoing'}</span>
                      )}
                      <span>
                        💰 {job.type === 'lumpsum' ? `Fixed ${formatJobCurrency(job.lumpSumAmount || 0, job.currency)}` : `${formatJobCurrency(job.dailyRate || 0, job.currency)} / day`}
                      </span>
                      <span>⏱️ {fin.totalDays} days worked</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
                      {formatJobCurrency(fin.totalInvoice, job.currency)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      ≈ {formatMoney(fin.totalInvoiceEgp)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button
                        className="ghost-button icon-button"
                        type="button"
                        title="Edit Job"
                        onClick={() => onOpenJobModal(job)}
                      >
                        ✏️
                      </button>
                      <button
                        className="ghost-button icon-button"
                        type="button"
                        title="Expand Details"
                        onClick={() => toggleExpand(job.id)}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ marginTop: '14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                    <span>Paid: {formatJobCurrency(fin.totalPaid, job.currency)} ({fin.percentPaid}%)</span>
                    <span style={{ color: fin.remainingBalance > 0 ? 'var(--amber)' : 'var(--green)' }}>
                      Remaining: {formatJobCurrency(fin.remainingBalance, job.currency)}
                    </span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${fin.percentPaid}%`,
                        background: fin.percentPaid >= 100 ? 'var(--green)' : 'var(--blue)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Expanded Sections */}
                {isExpanded && (
                  <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Days Worked Section */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>📅 Days / Shifts Worked ({days.length})</strong>
                        <button
                          className="ghost-button"
                          type="button"
                          style={{ padding: '3px 8px', fontSize: '11.5px' }}
                          onClick={() => onOpenLogDayModal(job.id)}
                        >
                          + Log Day
                        </button>
                      </div>
                      {days.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface-soft)', borderRadius: '6px' }}>
                          No shifts logged yet. Click "+ Log Day" to track days worked.
                        </div>
                      ) : (
                        <div className="table-wrap compact" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Units</th>
                                <th>Note</th>
                                <th style={{ width: '30px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {days.map((d, dIdx) => (
                                <tr key={dIdx}>
                                  <td>{DateUtils.formatDisplayDate(d.date)}</td>
                                  <td>{d.units || 1.0}</td>
                                  <td style={{ color: 'var(--muted)', fontSize: '12px' }}>{d.note || '—'}</td>
                                  <td>
                                    <button
                                      className="delete-button icon-button"
                                      type="button"
                                      onClick={() => handleDeleteDay(job, dIdx)}
                                    >
                                      x
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Expenses Section */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>🧾 Project Expenses ({expenses.length})</strong>
                        <button
                          className="ghost-button"
                          type="button"
                          style={{ padding: '3px 8px', fontSize: '11.5px' }}
                          onClick={() => onOpenExpenseModal(job.id)}
                        >
                          + Log Expense
                        </button>
                      </div>
                      {expenses.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface-soft)', borderRadius: '6px' }}>
                          No expenses recorded for this project.
                        </div>
                      ) : (
                        <div className="table-wrap compact" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th className="number">Amount</th>
                                <th>Reimbursable</th>
                                <th style={{ width: '30px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {expenses.map((e) => (
                                <tr key={e.id}>
                                  <td>{DateUtils.formatDisplayDate(e.date)}</td>
                                  <td>{e.title || e.description}</td>
                                  <td className="number">{formatJobCurrency(e.amount, job.currency)}</td>
                                  <td>{e.isReimbursable !== false ? '✓ Yes' : 'No'}</td>
                                  <td>
                                    <button
                                      className="delete-button icon-button"
                                      type="button"
                                      onClick={() => handleDeleteExpense(job, e.id)}
                                    >
                                      x
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Payments Section */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>💵 Payments Received ({payments.length})</strong>
                        <button
                          className="ghost-button"
                          type="button"
                          style={{ padding: '3px 8px', fontSize: '11.5px', color: 'var(--green)', borderColor: 'var(--green)' }}
                          onClick={() => onOpenPaymentModal(job.id)}
                        >
                          + Record Payment
                        </button>
                      </div>
                      {payments.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface-soft)', borderRadius: '6px' }}>
                          No payments recorded yet. Click "+ Record Payment" when client pays.
                        </div>
                      ) : (
                        <div className="table-wrap compact" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th className="number">Amount</th>
                                <th>Account</th>
                                <th>Note</th>
                                <th style={{ width: '30px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {payments.map((p) => (
                                <tr key={p.id}>
                                  <td>{DateUtils.formatDisplayDate(p.date)}</td>
                                  <td className="number" style={{ fontWeight: 700, color: 'var(--green)' }}>
                                    {formatJobCurrency(p.amount, job.currency)}
                                  </td>
                                  <td><span className="account-pill">{p.settlementAccount || p.account || 'cib'}</span></td>
                                  <td style={{ color: 'var(--muted)', fontSize: '12px' }}>{p.paymentNote || p.note || '—'}</td>
                                  <td>
                                    <button
                                      className="delete-button icon-button"
                                      type="button"
                                      onClick={() => handleDeletePayment(job, p.id)}
                                    >
                                      x
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px dashed var(--line)' }}>
                      <button
                        className="delete-button"
                        type="button"
                        onClick={() => deleteJob('partTime', job.id)}
                      >
                        Delete Job
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
