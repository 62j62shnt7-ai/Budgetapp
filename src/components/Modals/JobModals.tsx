import React, { useState, useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { calculateJobFinancials, formatJobCurrency } from '../../engine/jobs';
import type { JobItem, JobDayLog, JobExpense, JobPayment } from '../../types';

// ==========================================
// 1. Job Form Modal (Add / Edit Job)
// ==========================================
interface JobFormModalProps {
  isOpen: boolean;
  jobToEdit?: JobItem | null;
  onClose: () => void;
}

export const JobFormModal: React.FC<JobFormModalProps> = ({ isOpen, jobToEdit, onClose }) => {
  const { saveJob } = useBudgetStore();

  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [startDate, setStartDate] = useState(DateUtils.todayString());
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [type, setType] = useState<'daily_rate' | 'lumpsum'>('daily_rate');
  const [dailyRate, setDailyRate] = useState('');
  const [lumpSumAmount, setLumpSumAmount] = useState('');
  const [status, setStatus] = useState<'active' | 'invoiced' | 'partial' | 'paid'>('active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (jobToEdit) {
      setTitle(jobToEdit.title || '');
      setClient(jobToEdit.client || '');
      setStartDate(jobToEdit.startDate || '');
      setEndDate(jobToEdit.endDate || '');
      setCurrency(jobToEdit.currency || 'USD');
      setType((jobToEdit.type as any) === 'lumpsum' ? 'lumpsum' : 'daily_rate');
      setDailyRate(jobToEdit.dailyRate ? String(jobToEdit.dailyRate) : '');
      setLumpSumAmount(jobToEdit.lumpSumAmount ? String(jobToEdit.lumpSumAmount) : '');
      setStatus((jobToEdit.status as any) || 'active');
      setNotes(jobToEdit.notes || '');
    } else {
      setTitle('');
      setClient('');
      setStartDate(DateUtils.todayString());
      setEndDate('');
      setCurrency('USD');
      setType('daily_rate');
      setDailyRate('');
      setLumpSumAmount('');
      setStatus('active');
      setNotes('');
    }
  }, [jobToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !client.trim()) return;

    const baseJob: JobItem = {
      id: jobToEdit ? jobToEdit.id : `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      client: client.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      currency,
      type,
      dailyRate: type === 'daily_rate' ? Number(dailyRate) || 0 : undefined,
      lumpSumAmount: type === 'lumpsum' ? Number(lumpSumAmount) || 0 : undefined,
      status,
      notes: notes.trim() || undefined,
      daysWorked: jobToEdit ? jobToEdit.daysWorked : [],
      expenses: jobToEdit ? jobToEdit.expenses : [],
      payments: jobToEdit ? jobToEdit.payments : [],
    };

    saveJob('partTime', baseJob);
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="jobForm">
        <div className="dialog-heading">
          <h3>{jobToEdit ? 'Edit Part-Time Job' : 'Add Part-Time Job'}</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <label>
          Job / Project Title
          <input
            name="title"
            type="text"
            required
            placeholder="e.g. Design Consulting, Mobile App..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label>
          Client / Company
          <input
            name="client"
            type="text"
            required
            placeholder="e.g. TechCorp, Acme Ltd"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <label>
            Start Date
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            End Date (Optional)
            <input
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <label>
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="EGP">EGP (Local)</option>
              <option value="GBP">GBP (£)</option>
              <option value="SAR">SAR (﷼)</option>
              <option value="AED">AED (د.إ)</option>
            </select>
          </label>
          <label>
            Compensation Type
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="daily_rate">Daily Rate</option>
              <option value="lumpsum">Lump Sum (Fixed)</option>
            </select>
          </label>
        </div>

        {type === 'daily_rate' ? (
          <label>
            Daily Rate ({currency})
            <input
              name="dailyRate"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g. 250"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Lump Sum Amount ({currency})
            <input
              name="lumpSumAmount"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g. 1500"
              value={lumpSumAmount}
              onChange={(e) => setLumpSumAmount(e.target.value)}
            />
          </label>
        )}

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">Active (In Progress)</option>
            <option value="invoiced">Invoiced (Waiting Payment)</option>
            <option value="partial">Partial (Partially Paid)</option>
            <option value="paid">Paid (Settled)</option>
          </select>
        </label>

        <label>
          Notes / Contract Details
          <textarea
            name="notes"
            rows={2}
            placeholder="Deliverables, contract terms, contact info..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save Job
          </button>
        </div>
      </form>
    </dialog>
  );
};

// ==========================================
// 2. Job Log Day Modal
// ==========================================
interface JobLogDayModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
}

export const JobLogDayModal: React.FC<JobLogDayModalProps> = ({ isOpen, jobId, onClose }) => {
  const { partTimeJobs, saveJob } = useBudgetStore();
  const [date, setDate] = useState(DateUtils.todayString());
  const [preset, setPreset] = useState<'1' | '0.5' | 'custom'>('1');
  const [customUnits, setCustomUnits] = useState('1.0');
  const [note, setNote] = useState('');

  if (!isOpen || !jobId) return null;
  const job = partTimeJobs.find((j) => j.id === jobId);
  if (!job) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const units = preset === '1' ? 1.0 : preset === '0.5' ? 0.5 : Number(customUnits) || 1.0;

    const newLog: JobDayLog = {
      id: `day-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      units,
      note: note.trim() || undefined,
    };

    const updatedDays = [...(job.daysWorked || []), newLog];
    saveJob('partTime', { ...job, daysWorked: updatedDays });
    setNote('');
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="jobLogDayForm">
        <div className="dialog-heading">
          <h3>Log Day / Shift Worked</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <p style={{ margin: '-4px 0 12px', fontSize: '13px', color: 'var(--muted)' }}>
          {job.title} ({job.client})
        </p>

        <label>
          Date Worked
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label>
          Duration / Day Unit
          <select value={preset} onChange={(e) => setPreset(e.target.value as any)}>
            <option value="1">Full Day (1.0)</option>
            <option value="0.5">Half Day (0.5)</option>
            <option value="custom">Custom Units / Shifts</option>
          </select>
        </label>

        {preset === 'custom' && (
          <label>
            Custom Units (e.g. 0.25, 1.5)
            <input
              name="units"
              type="number"
              step="0.1"
              min="0.1"
              value={customUnits}
              onChange={(e) => setCustomUnits(e.target.value)}
            />
          </label>
        )}

        <label>
          Work Summary / Note
          <input
            name="note"
            type="text"
            placeholder="e.g. Sprint review, backend API integration"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Log Day
          </button>
        </div>
      </form>
    </dialog>
  );
};

// ==========================================
// 3. Job Expense Modal
// ==========================================
interface JobExpenseModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
}

export const JobExpenseModal: React.FC<JobExpenseModalProps> = ({ isOpen, jobId, onClose }) => {
  const { partTimeJobs, saveJob } = useBudgetStore();
  const [date, setDate] = useState(DateUtils.todayString());
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [isReimbursable, setIsReimbursable] = useState(true);
  const [receiptNote, setReceiptNote] = useState('');

  if (!isOpen || !jobId) return null;
  const job = partTimeJobs.find((j) => j.id === jobId);
  if (!job) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!title.trim() || !amt || amt <= 0) return;

    const newExpense: JobExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      title: title.trim(),
      amount: amt,
      currency: job.currency,
      isReimbursable,
      receiptNote: receiptNote.trim() || undefined,
    };

    const updatedExpenses = [...(job.expenses || []), newExpense];
    saveJob('partTime', { ...job, expenses: updatedExpenses });
    setTitle('');
    setAmount('');
    setReceiptNote('');
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="jobExpenseForm">
        <div className="dialog-heading">
          <h3>Log Job Expense</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <label>
          Expense Date
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label>
          Description
          <input
            name="title"
            type="text"
            required
            placeholder="e.g. Travel tickets, Cloud hosting, Software license"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label>
          Amount ({job.currency})
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
          <input
            name="isReimbursable"
            type="checkbox"
            checked={isReimbursable}
            onChange={(e) => setIsReimbursable(e.target.checked)}
          />
          <span>Billable to client (Reimbursable in Invoice)</span>
        </label>
        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>
          Unchecked means it is an out-of-pocket project expense that reduces your net profit.
        </small>

        <label style={{ marginTop: '10px' }}>
          Receipt / Notes (Optional)
          <input
            name="receiptNote"
            type="text"
            placeholder="Invoice #, receipt URL or details"
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save Expense
          </button>
        </div>
      </form>
    </dialog>
  );
};

// ==========================================
// 4. Job Payment Modal
// ==========================================
interface JobPaymentModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
}

export const JobPaymentModal: React.FC<JobPaymentModalProps> = ({ isOpen, jobId, onClose }) => {
  const { partTimeJobs, rates, saveJob, accounts, addEntry } = useBudgetStore();
  const [paidDate, setPaidDate] = useState(DateUtils.todayString());
  const [actualPaidAmount, setActualPaidAmount] = useState('');
  const [settlementAccount, setSettlementAccount] = useState('cib');
  const [syncToBudget, setSyncToBudget] = useState(true);
  const [paymentNote, setPaymentNote] = useState('');

  if (!isOpen || !jobId) return null;
  const job = partTimeJobs.find((j) => j.id === jobId);
  if (!job) return null;

  const fin = calculateJobFinancials(job, rates);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(actualPaidAmount);
    if (!amt || amt <= 0) return;

    const newPayment: JobPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: paidDate,
      amount: amt,
      currency: job.currency,
      settlementAccount,
      account: settlementAccount,
      syncToBudget,
      paymentNote: paymentNote.trim() || undefined,
    };

    const updatedPayments = [...(job.payments || []), newPayment];

    // Compute updated status
    const newTotalPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    let newStatus = job.status;
    if (newTotalPaid >= fin.totalInvoice && fin.totalInvoice > 0) {
      newStatus = 'paid';
    } else if (newTotalPaid > 0) {
      newStatus = 'partial';
    }

    saveJob('partTime', {
      ...job,
      payments: updatedPayments,
      status: newStatus,
    });

    // If syncToBudget is enabled, add an Income entry into Cashflow!
    if (syncToBudget) {
      const egpAmount = Math.round(amt * fin.fxRate);
      addEntry({
        date: paidDate,
        category: 'Job Income',
        subcategory: job.client || 'Part-Time',
        tag: 'Part-Time',
        account: settlementAccount,
        type: 'income',
        amount: egpAmount,
        actualAmount: egpAmount,
        currency: job.currency,
        source: `Job: ${job.title}`,
      });
    }

    setActualPaidAmount('');
    setPaymentNote('');
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="jobPaymentForm">
        <div className="dialog-heading">
          <h3>Record Job Payment</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Total Invoiced:</span>
            <strong>{formatJobCurrency(fin.totalInvoice, job.currency)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Already Received:</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatJobCurrency(fin.totalPaid, job.currency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', paddingTop: '4px', borderTop: '1px dashed var(--line)' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Remaining Balance:</span>
            <strong style={{ color: 'var(--amber)' }}>{formatJobCurrency(fin.remainingBalance, job.currency)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Approx. Remaining EGP:</span>
            <span style={{ fontWeight: 600, color: 'var(--green)' }}>{formatMoney(fin.remainingBalanceEgp)}</span>
          </div>
        </div>

        <label>
          Payment Date
          <input
            name="paidDate"
            type="date"
            required
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </label>

        <label>
          Payment Amount Received ({job.currency})
          <input
            name="actualPaidAmount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder={String(fin.remainingBalance || 0)}
            value={actualPaidAmount}
            onChange={(e) => setActualPaidAmount(e.target.value)}
          />
        </label>
        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '-4px', marginBottom: '6px' }}>
          💡 You can record partial payments or full balance. Remaining balance will update automatically.
        </small>

        <label>
          Deposit Account
          <select value={settlementAccount} onChange={(e) => setSettlementAccount(e.target.value)}>
            {Object.entries(accounts).map(([id, a]) => (
              <option key={id} value={id}>{a.name}</option>
            ))}
          </select>
        </label>

        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
          <input
            name="syncToBudget"
            type="checkbox"
            checked={syncToBudget}
            onChange={(e) => setSyncToBudget(e.target.checked)}
          />
          <span>Record as Income Entry in Cash Forecast &amp; Balance</span>
        </label>

        <label style={{ marginTop: '10px' }}>
          Payment Reference / Note
          <input
            name="paymentNote"
            type="text"
            placeholder="Wire ref, Swift confirmation, conversion rate..."
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Confirm Payment
          </button>
        </div>
      </form>
    </dialog>
  );
};
