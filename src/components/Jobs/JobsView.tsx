import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { calculateJobFinancials, formatJobCurrency } from '../../engine/jobs';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import type { JobItem, JobPayment } from '../../types';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Receipt,
  CreditCard,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { AffectedRecordsModal } from '../Modals/AffectedRecordsModal';
import { hasJobAffectedParties, hasJobPaymentAffectedParties } from '../../utils/affectedRecords';

interface JobsViewProps {
  onOpenJobModal: (job?: JobItem) => void;
  onOpenLogDayModal: (jobId: string) => void;
  onOpenExpenseModal: (jobId: string) => void;
  onOpenPaymentModal: (jobId: string) => void;
  onOpenForecastModal: (jobId: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({
  onOpenJobModal,
  onOpenLogDayModal,
  onOpenExpenseModal,
  onOpenPaymentModal,
  onOpenForecastModal,
}) => {
  const { partTimeJobs, rates, entries, deletedForecasts, deleteJob, saveJob, deleteJobPayment, storageAssets } = useBudgetStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'invoiced' | 'partial' | 'paid'>('all');
  const [activeCurrencyFilter, setActiveCurrencyFilter] = useState<string>('all');
  const [activeSort, setActiveSort] = useState<'newest' | 'oldest'>('newest');
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [activeJobSubTab, setActiveJobSubTab] = useState<Record<string, 'days' | 'expenses' | 'payments'>>({});

  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{ job: JobItem; payment: JobPayment } | null>(null);
  const [deleteJobTarget, setDeleteJobTarget] = useState<JobItem | null>(null);

  const toggleExpand = (jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const getSubTab = (jobId: string): 'days' | 'expenses' | 'payments' => {
    return activeJobSubTab[jobId] || 'days';
  };

  const setSubTab = (jobId: string, tab: 'days' | 'expenses' | 'payments') => {
    setActiveJobSubTab((prev) => ({ ...prev, [jobId]: tab }));
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
    const payment = (job.payments || []).find((p) => p.id === paymentId);
    if (!payment) return;
    setDeletePaymentTarget({ job, payment });
  };

  const handleDeleteJob = (job: JobItem) => {
    setDeleteJobTarget(job);
  };

  return (
    <section className="view" id="jobs" style={{ display: 'block' }}>
      {/* Top Metrics Cards */}
      <div className="jobs-kpis-grid">
        <div className="job-kpi-card glass-panel jobs-kpi-pending">
          <div className="job-kpi-header">
            <span className="job-kpi-label">Pending Receivables</span>
            <AlertCircle size={16} className="text-amber" />
          </div>
          <div className="job-kpi-val text-amber">
            {formatMoney(totalPendingEgp)}
          </div>
          <div className="job-kpi-sub" title={Object.entries(pendingByCurrency).map(([curr, amt]) => `${formatJobCurrency(amt, curr)} due`).join(' + ')}>
            {Object.keys(pendingByCurrency).length === 0
              ? 'All invoices settled'
              : Object.entries(pendingByCurrency)
                  .map(([curr, amt]) => `${formatJobCurrency(amt, curr)} due`)
                  .join(' · ')}
          </div>
        </div>

        <div className="job-kpi-card glass-panel jobs-kpi-paid">
          <div className="job-kpi-header">
            <span className="job-kpi-label">Collected / Paid</span>
            <CheckCircle2 size={16} className="text-green" />
          </div>
          <div className="job-kpi-val text-green">
            {formatMoney(totalPaidEgp)}
          </div>
          <div className="job-kpi-sub">
            {paidJobsCount} {paidJobsCount === 1 ? 'project' : 'projects'} settled
          </div>
        </div>

        <div className="job-kpi-card glass-panel jobs-kpi-active">
          <div className="job-kpi-header">
            <span className="job-kpi-label">Active Work</span>
            <Clock size={16} className="text-blue" />
          </div>
          <div className="job-kpi-val text-blue">
            {activeJobsCount}
          </div>
          <div className="job-kpi-sub">
            {activeJobsCount} {activeJobsCount === 1 ? 'project' : 'projects'} ongoing
          </div>
        </div>

        <div className="job-kpi-card glass-panel jobs-kpi-expenses">
          <div className="job-kpi-header">
            <span className="job-kpi-label">Reimbursable Expenses</span>
            <Receipt size={16} style={{ color: 'var(--color-cyan, #06b6d4)' }} />
          </div>
          <div className="job-kpi-val" style={{ color: 'var(--color-cyan, #06b6d4)' }}>
            {formatMoney(totalReimbursableEgp)}
          </div>
          <div className="job-kpi-sub">
            To bill or claim back
          </div>
        </div>
      </div>

      {/* Controls Toolbar */}
      <div className="jobs-toolbar glass-panel">
        <div className="jobs-filters-group">
          <div className="jobs-filter-chips">
            {(['all', 'active', 'invoiced', 'partial', 'paid'] as const).map((filter) => (
              <button
                key={filter}
                className={`job-filter-pill ${activeFilter === filter ? 'is-active' : ''}`}
                type="button"
                onClick={() => setActiveFilter(filter)}
              >
                {filter === 'all' ? 'All Projects' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          <div className="jobs-filter-selects">
            <select
              value={activeCurrencyFilter}
              onChange={(e) => setActiveCurrencyFilter(e.target.value)}
              className="job-filter-select"
            >
              <option value="all">🌐 All Currencies</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="EGP">EGP (Local)</option>
              <option value="GBP">GBP (£)</option>
              <option value="SAR">SAR (﷼)</option>
              <option value="AED">AED (د.إ)</option>
            </select>

            <select
              value={activeSort}
              onChange={(e) => setActiveSort(e.target.value as 'newest' | 'oldest')}
              className="job-filter-select"
            >
              <option value="newest">📅 Newest Date</option>
              <option value="oldest">📅 Oldest Date</option>
            </select>
          </div>
        </div>

        <button className="primary-button jobs-add-btn" type="button" onClick={() => onOpenJobModal()}>
          <Plus size={16} />
          <span>New Project</span>
        </button>
      </div>

      {/* Jobs Stream */}
      <div id="jobsList" className="jobs-stream">
        {filteredJobs.length === 0 ? (
          <div className="glass-panel jobs-empty-state">
            <div className="jobs-empty-icon">
              <Briefcase size={36} />
            </div>
            <h3 style={{ fontSize: '18px', marginBottom: '6px', color: 'var(--ink)' }}>No projects found</h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', maxWidth: '440px', margin: '0 auto 18px', lineHeight: 1.5 }}>
              {partTimeJobs.length === 0
                ? "Track part-time jobs, consulting gigs, daily rates, reimbursable expenses, and scheduled invoices."
                : 'No projects match your current filters.'}
            </p>
            <button className="primary-button" type="button" onClick={() => onOpenJobModal()}>
              <Plus size={15} style={{ marginRight: '6px' }} />
              Create First Project
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const fin = calculateJobFinancials(job, rates);
            const isExpanded = expandedJobIds.has(job.id);
            const days = job.daysWorked || [];
            const expenses = job.expenses || [];
            const payments = job.payments || [];
            const currentSubTab = getSubTab(job.id);

            const isForecastActive = Boolean(
              job.forecastDueDate &&
              fin.remainingBalance > 0 &&
              (!job.forecastEntryId || (entries.some((e) => e.id === job.forecastEntryId) && !deletedForecasts.includes(job.forecastEntryId)))
            );

            return (
              <article
                key={job.id}
                className={`job-card glass-panel jobs-job-card ${isExpanded ? 'is-expanded' : ''}`}
              >
                {/* Header Row */}
                <div className="jobs-card-header">
                  <div className="jobs-card-header-left">
                    <div className="jobs-card-status-row">
                      <span className={`badge ${fin.computedStatus === 'paid' ? 'badge-income' : fin.computedStatus === 'invoiced' || fin.computedStatus === 'partial' ? 'badge-warning' : 'badge-neutral'}`}>
                        {fin.computedStatus.toUpperCase()}
                      </span>
                      {job.client && (
                        <span className="job-client-tag">
                          <Building2 size={13} />
                          {job.client}
                        </span>
                      )}
                      <span className="job-currency-badge">
                        {job.currency || 'USD'}
                      </span>
                    </div>

                    <h3 className="job-card-heading">{job.title}</h3>

                    <div className="jobs-card-meta">
                      {job.startDate && (
                        <span>
                          <Calendar size={13} />
                          {DateUtils.formatDisplayDate(job.startDate)} {job.endDate ? `to ${DateUtils.formatDisplayDate(job.endDate)}` : '– Ongoing'}
                        </span>
                      )}
                      <span>
                        <DollarSign size={13} />
                        {job.type === 'lumpsum'
                          ? `Fixed ${formatJobCurrency(job.lumpSumAmount || 0, job.currency)}`
                          : job.type === 'hourly' || job.rateType === 'hourly'
                            ? `${formatJobCurrency(job.rateAmount || 0, job.currency)} / hr`
                            : `${formatJobCurrency(job.dailyRate || job.rateAmount || 0, job.currency)} / day`}
                      </span>
                      <span>
                        <Clock size={13} />
                        {fin.totalDays} {fin.totalDays === 1 ? 'shift' : 'shifts'}
                      </span>
                    </div>
                  </div>

                  <div className="jobs-card-header-right">
                    <div className="jobs-card-total-val">
                      {formatJobCurrency(fin.totalInvoice, job.currency)}
                    </div>
                    <div className="jobs-card-total-egp">
                      ≈ {formatMoney(fin.totalInvoiceEgp)}
                    </div>
                    <div className="jobs-card-quick-actions">
                      <button
                        className="ghost-button icon-button"
                        type="button"
                        title="Edit Project"
                        onClick={() => onOpenJobModal(job)}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        className="ghost-button icon-button"
                        type="button"
                        title={isExpanded ? "Collapse Details" : "Expand Details"}
                        onClick={() => toggleExpand(job.id)}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Settlement Status */}
                <div className="jobs-progress">
                  <div className="jobs-progress-labels">
                    <span className="jobs-progress-paid">
                      Paid: <strong>{formatJobCurrency(fin.totalPaid, job.currency)}</strong> ({fin.percentPaid}%)
                    </span>
                    <span className={fin.remainingBalance > 0 ? 'jobs-progress-remaining text-amber' : 'jobs-progress-remaining text-green'}>
                      {fin.remainingBalance > 0
                        ? `Balance Due: ${formatJobCurrency(fin.remainingBalance, job.currency)}`
                        : 'Fully Settled ✓'}
                    </span>
                  </div>
                  <div className="jobs-progress-track">
                    <div
                      className={`jobs-progress-fill ${fin.percentPaid >= 100 ? 'is-complete' : ''}`}
                      style={{ width: `${Math.min(100, fin.percentPaid)}%` }}
                    />
                  </div>
                </div>

                {/* Forecast Banner & Action Bar */}
                <div className="jobs-card-action-bar">
                  {isForecastActive ? (
                    <div className="jobs-forecast-banner">
                      <div className="jobs-forecast-banner-text">
                        <Calendar size={14} className="text-blue" />
                        <span>
                          Expected in Forecast on <strong>{DateUtils.formatDisplayDate(job.forecastDueDate)}</strong> ({formatJobCurrency(job.forecastAmount || fin.remainingBalance, job.currency)} ≈ {formatMoney(Math.round((job.forecastAmount || fin.remainingBalance) * fin.fxRate))})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button jobs-forecast-edit-btn"
                        onClick={() => onOpenForecastModal(job.id)}
                      >
                        Reschedule
                      </button>
                    </div>
                  ) : fin.remainingBalance > 0 ? (
                    <button
                      type="button"
                      className="ghost-button jobs-schedule-btn"
                      onClick={() => onOpenForecastModal(job.id)}
                    >
                      <Calendar size={13} />
                      Schedule in Forecast
                    </button>
                  ) : <div />}

                  <div className="jobs-card-action-buttons">
                    {fin.remainingBalance > 0 && (
                      <button
                        type="button"
                        className="primary-button jobs-record-payment-btn"
                        onClick={() => onOpenPaymentModal(job.id)}
                      >
                        <CreditCard size={14} />
                        Record Payment
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost-button jobs-toggle-details-btn"
                      onClick={() => toggleExpand(job.id)}
                    >
                      {isExpanded ? 'Hide Records' : `View Records (${days.length + expenses.length + payments.length})`}
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Clean Segmented Sub-View (Eliminating 3 crowded columns and mini-scrollbars) */}
                {isExpanded && (
                  <div className="jobs-expanded-details">
                    {/* Segmented Controls Header */}
                    <div className="jobs-tabs-header">
                      <div className="jobs-subtabs-nav">
                        <button
                          type="button"
                          className={`jobs-subtab-pill ${currentSubTab === 'days' ? 'is-active' : ''}`}
                          onClick={() => setSubTab(job.id, 'days')}
                        >
                          <Clock size={14} />
                          Shifts ({days.length})
                        </button>
                        <button
                          type="button"
                          className={`jobs-subtab-pill ${currentSubTab === 'expenses' ? 'is-active' : ''}`}
                          onClick={() => setSubTab(job.id, 'expenses')}
                        >
                          <Receipt size={14} />
                          Expenses ({expenses.length})
                        </button>
                        <button
                          type="button"
                          className={`jobs-subtab-pill ${currentSubTab === 'payments' ? 'is-active' : ''}`}
                          onClick={() => setSubTab(job.id, 'payments')}
                        >
                          <CreditCard size={14} />
                          Payments ({payments.length})
                        </button>
                      </div>

                      {/* Sub-tab quick add button */}
                      <div>
                        {currentSubTab === 'days' && (
                          <button
                            className="primary-button jobs-subtab-action-btn"
                            type="button"
                            onClick={() => onOpenLogDayModal(job.id)}
                          >
                            <Plus size={13} />
                            Log Shift
                          </button>
                        )}
                        {currentSubTab === 'expenses' && (
                          <button
                            className="primary-button jobs-subtab-action-btn"
                            type="button"
                            onClick={() => onOpenExpenseModal(job.id)}
                          >
                            <Plus size={13} />
                            Log Expense
                          </button>
                        )}
                        {currentSubTab === 'payments' && (
                          <button
                            className="primary-button jobs-subtab-action-btn jobs-pay-btn"
                            type="button"
                            onClick={() => onOpenPaymentModal(job.id)}
                          >
                            <Plus size={13} />
                            Record Payment
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sub-tab Content: Full-width, clean table without forced max-height scrollbars */}
                    <div className="jobs-subtab-content">
                      {currentSubTab === 'days' && (
                        days.length === 0 ? (
                          <div className="jobs-subtab-empty">
                            <Clock size={24} className="text-dim" />
                            <p>No shifts logged for this project yet.</p>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => onOpenLogDayModal(job.id)}
                            >
                              + Log First Shift
                            </button>
                          </div>
                        ) : (
                          <div className="jobs-clean-table-wrap">
                            <table className="jobs-clean-table jobs-shifts-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th style={{ width: '100px' }}>Units</th>
                                  <th>Description / Note</th>
                                  <th style={{ width: '40px', textAlign: 'right' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((d, dIdx) => (
                                  <tr key={dIdx}>
                                    <td className="jobs-table-date" data-label="Date">
                                      {DateUtils.formatDisplayDate(d.date)}
                                    </td>
                                    <td data-label="Units">
                                      <span className="jobs-units-badge">
                                        {d.units || 1.0} {d.units === 1 ? 'unit' : 'units'}
                                      </span>
                                    </td>
                                    <td className="jobs-table-note" data-label="Note">{d.note || '—'}</td>
                                    <td className="jobs-table-actions" style={{ textAlign: 'right' }}>
                                      <button
                                        className="ghost-button icon-button jobs-row-delete-btn"
                                        type="button"
                                        title="Delete shift"
                                        onClick={() => handleDeleteDay(job, dIdx)}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}

                      {currentSubTab === 'expenses' && (
                        expenses.length === 0 ? (
                          <div className="jobs-subtab-empty">
                            <Receipt size={24} className="text-dim" />
                            <p>No client or project expenses recorded.</p>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => onOpenExpenseModal(job.id)}
                            >
                              + Record Project Expense
                            </button>
                          </div>
                        ) : (
                          <div className="jobs-clean-table-wrap">
                            <table className="jobs-clean-table jobs-expenses-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Expense Description</th>
                                  <th className="number">Amount</th>
                                  <th>Reimbursable</th>
                                  <th style={{ width: '40px', textAlign: 'right' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {expenses.map((e) => (
                                  <tr key={e.id}>
                                    <td className="jobs-table-date" data-label="Date">
                                      {DateUtils.formatDisplayDate(e.date)}
                                    </td>
                                    <td data-label="Expense"><strong>{e.title || e.description}</strong></td>
                                    <td className="number jobs-table-num" data-label="Amount">
                                      {formatJobCurrency(e.amount, job.currency)}
                                    </td>
                                    <td data-label="Status">
                                      <span className={`badge ${e.isReimbursable !== false ? 'badge-income' : 'badge-neutral'}`}>
                                        {e.isReimbursable !== false ? '✓ Billed to Client' : 'Internal'}
                                      </span>
                                    </td>
                                    <td className="jobs-table-actions" style={{ textAlign: 'right' }}>
                                      <button
                                        className="ghost-button icon-button jobs-row-delete-btn"
                                        type="button"
                                        title="Delete expense"
                                        onClick={() => handleDeleteExpense(job, e.id)}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}

                      {currentSubTab === 'payments' && (
                        payments.length === 0 ? (
                          <div className="jobs-subtab-empty">
                            <CreditCard size={24} className="text-dim" />
                            <p>No payments recorded yet for this project.</p>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => onOpenPaymentModal(job.id)}
                            >
                              + Record Received Payment
                            </button>
                          </div>
                        ) : (
                          <div className="jobs-clean-table-wrap">
                            <table className="jobs-clean-table jobs-payments-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th className="number">Amount</th>
                                  <th>Destination Account</th>
                                  <th>Payment Note</th>
                                  <th style={{ width: '40px', textAlign: 'right' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map((p) => {
                                  const hasAffectedPay = hasJobPaymentAffectedParties(p, storageAssets);
                                  return (
                                    <tr key={p.id}>
                                      <td className="jobs-table-date" data-label="Date">
                                        {DateUtils.formatDisplayDate(p.date)}
                                      </td>
                                      <td className="number jobs-table-num text-green" style={{ fontWeight: 700 }} data-label="Amount">
                                        +{formatJobCurrency(p.amount, job.currency)}
                                      </td>
                                      <td data-label="Account">
                                        <span className="account-pill">
                                          {(p.settlementAccount || p.account || 'Bank').toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="jobs-table-note" data-label="Note">{p.paymentNote || p.note || '—'}</td>
                                      <td className="jobs-table-actions" style={{ textAlign: 'right' }}>
                                        <button
                                          className="ghost-button icon-button jobs-row-delete-btn"
                                          type="button"
                                          style={{ position: 'relative' }}
                                          title={hasAffectedPay ? 'Delete payment (linked to cashflow or storage)' : 'Delete payment'}
                                          onClick={() => handleDeletePayment(job, p.id)}
                                        >
                                          <Trash2 size={14} />
                                          {hasAffectedPay && (
                                            <span
                                              className="affected-parties-dot"
                                              title="Linked to cashflow or storage"
                                            />
                                          )}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>

                    {/* Section Footer Actions */}
                    <div className="jobs-detail-actions">
                      {(() => {
                        const hasAffectedJob = hasJobAffectedParties(job);
                        return (
                          <button
                            className="delete-button"
                            type="button"
                            style={{ position: 'relative' }}
                            title={hasAffectedJob ? 'Delete Project (has linked payments or forecast records)' : 'Delete Project'}
                            onClick={() => handleDeleteJob(job)}
                          >
                            <Trash2 size={13} style={{ marginRight: '6px' }} />
                            Delete Project
                            {hasAffectedJob && (
                              <span
                                className="affected-parties-dot"
                                title="Has linked payments or forecast records"
                              />
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Selective Payment Deletion Modal */}
      {deletePaymentTarget && (
        <AffectedRecordsModal
          isOpen={Boolean(deletePaymentTarget)}
          title="Delete Job Payment"
          subtitle="Choose which records and balances should be updated upon deleting this payment."
          itemDescription={`Payment for "${deletePaymentTarget.job.title || deletePaymentTarget.job.client}" on ${DateUtils.formatDisplayDate(deletePaymentTarget.payment.date)}`}
          amountFormatted={formatJobCurrency(deletePaymentTarget.payment.amount, deletePaymentTarget.payment.currency || deletePaymentTarget.job.currency)}
          options={[
            {
              id: 'job',
              label: `Job Tracker (${deletePaymentTarget.job.title || deletePaymentTarget.job.client})`,
              sublabel: 'Remove payment from this job and recalculate remaining balance & status.',
              icon: '💼',
              defaultChecked: true,
            },
            ...(deletePaymentTarget.payment.entryId
              ? [
                  {
                    id: 'cashflow',
                    label: 'Cash Flow & Forecast Actuals',
                    sublabel: 'Deduct this payment from the linked Forecast / Cashflow entry actuals.',
                    icon: '📊',
                    defaultChecked: true,
                  },
                ]
              : []),
            ...(storageAssets.length > 0
              ? (() => {
                  const targetAccount = (deletePaymentTarget.payment.settlementAccount || deletePaymentTarget.payment.account || '').trim().toLowerCase();
                  const paymentCurr = (deletePaymentTarget.payment.currency || deletePaymentTarget.job.currency || 'USD').toUpperCase();
                  const isForeign = paymentCurr !== 'EGP';
                  const matchingStorage = storageAssets.find(
                    (a) =>
                      a.name.trim().toLowerCase() === targetAccount ||
                      (isForeign &&
                        ((a.unit || '').toUpperCase() === paymentCurr || (a.currency || '').toUpperCase() === paymentCurr))
                  );
                  const assetName = matchingStorage ? matchingStorage.name : 'Storage / Bank Balance';
                  const currentQtyDesc = matchingStorage ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit || ''})` : '';
                  return [
                    {
                      id: 'storage',
                      label: `Storage: ${assetName}`,
                      sublabel: `Revert / deduct ${formatJobCurrency(deletePaymentTarget.payment.amount, deletePaymentTarget.payment.currency || deletePaymentTarget.job.currency)} from ${assetName}${currentQtyDesc}.`,
                      icon: '🏦',
                      defaultChecked: Boolean(
                        matchingStorage &&
                          (targetAccount.includes('storage') ||
                            targetAccount.includes('usd') ||
                            targetAccount.includes('hsbc') ||
                            targetAccount.includes('cash') ||
                            isForeign)
                      ),
                    },
                  ];
                })()
              : []),
          ]}
          onConfirm={(selectedOptionIds) => {
            const targetAccount = (deletePaymentTarget.payment.settlementAccount || deletePaymentTarget.payment.account || '').trim().toLowerCase();
            const paymentCurr = (deletePaymentTarget.payment.currency || deletePaymentTarget.job.currency || 'USD').toUpperCase();
            const isForeign = paymentCurr !== 'EGP';
            const matchingStorage = storageAssets.find(
              (a) =>
                a.name.trim().toLowerCase() === targetAccount ||
                (isForeign &&
                  ((a.unit || '').toUpperCase() === paymentCurr || (a.currency || '').toUpperCase() === paymentCurr))
            );
            deleteJobPayment('partTime', deletePaymentTarget.job.id, deletePaymentTarget.payment.id, {
              syncCashflow: selectedOptionIds.includes('cashflow'),
              deleteCashEntry: false,
              revertStorage: selectedOptionIds.includes('storage'),
              storageAssetId: matchingStorage?.id,
            });
            setDeletePaymentTarget(null);
          }}
          onClose={() => setDeletePaymentTarget(null)}
        />
      )}

      {/* Selective Job Deletion Modal */}
      {deleteJobTarget && (
        <AffectedRecordsModal
          isOpen={Boolean(deleteJobTarget)}
          title="Delete Job"
          subtitle="Choose what records should be affected when deleting this job."
          itemDescription={`Job: "${deleteJobTarget.title || deleteJobTarget.client}"`}
          options={[
            {
              id: 'job',
              label: 'Job Tracker Record',
              sublabel: 'Permanently remove this job from the Job Tracker.',
              icon: '💼',
              defaultChecked: true,
            },
            ...((deleteJobTarget.payments && deleteJobTarget.payments.length > 0) || deleteJobTarget.forecastEntryId
              ? [
                  {
                    id: 'cashEntries',
                    label: 'Linked Cash Flow & History Records',
                    sublabel: 'Delete all associated income records and forecast projections from Cash Flow & History.',
                    icon: '🗑️',
                    defaultChecked: false,
                  },
                ]
              : []),
          ]}
          onConfirm={(selectedOptionIds) => {
            deleteJob('partTime', deleteJobTarget.id, {
              deleteCashEntries: selectedOptionIds.includes('cashEntries'),
            });
            setDeleteJobTarget(null);
          }}
          onClose={() => setDeleteJobTarget(null)}
        />
      )}
    </section>
  );
};
