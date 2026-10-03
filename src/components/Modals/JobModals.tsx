import React, { useState } from 'react';
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

  const currentJobKey = isOpen ? (jobToEdit?.id || 'new') : 'closed';
  const [prevJobKey, setPrevJobKey] = useState(currentJobKey);

  if (prevJobKey !== currentJobKey) {
    setPrevJobKey(currentJobKey);
    if (jobToEdit) {
      setTitle(jobToEdit.title || '');
      setClient(jobToEdit.client || '');
      setStartDate(jobToEdit.startDate || '');
      setEndDate(jobToEdit.endDate || '');
      setCurrency(jobToEdit.currency || 'USD');
      setType(jobToEdit.type === 'lumpsum' ? 'lumpsum' : 'daily_rate');
      setDailyRate(jobToEdit.dailyRate ? String(jobToEdit.dailyRate) : '');
      setLumpSumAmount(jobToEdit.lumpSumAmount ? String(jobToEdit.lumpSumAmount) : '');
      setStatus(
        jobToEdit.status === 'invoiced' || jobToEdit.status === 'partial' || jobToEdit.status === 'paid'
          ? jobToEdit.status
          : 'active'
      );
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
  }

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
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
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
            <select value={type} onChange={(e) => setType(e.target.value as 'daily_rate' | 'lumpsum')}>
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
          <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'invoiced' | 'partial' | 'paid')}>
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
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
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
          <select value={preset} onChange={(e) => setPreset(e.target.value as '1' | '0.5' | 'custom')}>
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
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
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
// ==========================================
// 4. Job Payment Modal
// ==========================================
function generatePaymentId(): string {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

interface JobPaymentModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
}

export const JobPaymentModal: React.FC<JobPaymentModalProps> = ({ isOpen, jobId, onClose }) => {
  const {
    partTimeJobs,
    rates,
    saveJob,
    accounts,
    updateAccountBalance,
    storageAssets,
    depositToStorageAsset,
    addStorageAsset,
    addEntry,
    updateEntry,
    entries,
  } = useBudgetStore();

  const job = partTimeJobs.find((j) => j.id === jobId);
  const fin = job ? calculateJobFinancials(job, rates) : null;
  const isForeign = Boolean(job && (job.currency || 'USD').toUpperCase() !== 'EGP');

  const [paidDate, setPaidDate] = useState(DateUtils.todayString());
  const [actualPaidAmount, setActualPaidAmount] = useState('');
  const [settlementMode, setSettlementMode] = useState<'foreign' | 'convert_egp'>('foreign');
  const [foreignDestination, setForeignDestination] = useState('storage:hsbc_usd');
  const [selectedEgpAccount, setSelectedEgpAccount] = useState('hsbc');
  const [customFxRate, setCustomFxRate] = useState<string>('');
  const [customEgpAmount, setCustomEgpAmount] = useState<string>('');
  const [syncToBudget, setSyncToBudget] = useState(true);
  const [paymentNote, setPaymentNote] = useState('');

  // Synchronize initial state when modal opens
  const currentPayKey = isOpen && jobId ? `${jobId}-${fin?.remainingBalance ?? ''}-${fin?.totalInvoice ?? ''}` : 'closed';
  const [prevPayKey, setPrevPayKey] = useState(currentPayKey);

  if (prevPayKey !== currentPayKey) {
    setPrevPayKey(currentPayKey);
    if (job && fin) {
      setPaidDate(DateUtils.todayString());
      setActualPaidAmount(fin.remainingBalance > 0 ? String(fin.remainingBalance) : String(fin.totalInvoice || ''));
      setCustomFxRate(String(fin.fxRate || 48.5));
      const initialEgp = Math.round((fin.remainingBalance > 0 ? fin.remainingBalance : fin.totalInvoice) * (fin.fxRate || 48.5));
      setCustomEgpAmount(String(initialEgp));
      const defaultForeignDest =
        (job.currency || '').toUpperCase() === 'EUR' ? 'storage:hsbc_eur' : 'storage:hsbc_usd';
      setForeignDestination(job.forecastDestination?.startsWith('storage:') ? job.forecastDestination : defaultForeignDest);
      const accKeys = Object.keys(accounts);
      if (accKeys.length > 0 && !accounts[selectedEgpAccount]) {
        setSelectedEgpAccount(accKeys[0]);
      }
    }
  }

  // Update EGP amount when foreign amount or fx rate changes
  const handleAmountChange = (val: string) => {
    setActualPaidAmount(val);
    const amt = Number(val) || 0;
    const rate = Number(customFxRate) || (fin?.fxRate || 48.5);
    setCustomEgpAmount(String(Math.round(amt * rate)));
  };

  const handleFxRateChange = (val: string) => {
    setCustomFxRate(val);
    const amt = Number(actualPaidAmount) || 0;
    const rate = Number(val) || (fin?.fxRate || 48.5);
    setCustomEgpAmount(String(Math.round(amt * rate)));
  };

  if (!isOpen || !job || !fin) return null;

  const processPayment = (shouldDeposit: boolean) => {
    const amt = Number(actualPaidAmount);
    if (!amt || amt <= 0) return;

    const effectiveFxRate = Number(customFxRate) || fin.fxRate || 48.5;
    let finalEgpAmount = Number(customEgpAmount) || Math.round(amt * effectiveFxRate);
    let chosenLabel = '';

    // 1. Handle Destination & Funds Routing
    if (shouldDeposit) {
      if (settlementMode === 'foreign' && isForeign) {
        if (foreignDestination.startsWith('storage:existing-')) {
          const assetId = foreignDestination.replace('storage:existing-', '');
          depositToStorageAsset(assetId, amt);
          const existing = storageAssets.find((a) => a.id === assetId);
          chosenLabel = existing ? existing.name : 'Storage Reserve';
        } else if (foreignDestination === 'storage:hsbc_usd') {
          const existing = storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'USD');
          if (existing) {
            depositToStorageAsset(existing.id, amt);
          } else {
            addStorageAsset({
              name: 'HSBC USD Account',
              category: 'Currency',
              quantity: amt,
              unit: 'USD',
              buyPrice: effectiveFxRate,
              rate: effectiveFxRate,
              rateSource: 'currency:USD',
              currency: 'EGP',
              locationType: 'bank',
              location: 'hsbc',
              locationLabel: 'HSBC Foreign Account',
            });
          }
          chosenLabel = 'HSBC USD Account';
        } else if (foreignDestination === 'storage:cash_usd') {
          const existing = storageAssets.find((a) => a.name.toLowerCase().includes('cash') && a.unit.toUpperCase() === 'USD');
          if (existing) {
            depositToStorageAsset(existing.id, amt);
          } else {
            addStorageAsset({
              name: 'USD Cash in Hand',
              category: 'Currency',
              quantity: amt,
              unit: 'USD',
              buyPrice: effectiveFxRate,
              rate: effectiveFxRate,
              rateSource: 'currency:USD',
              currency: 'EGP',
              locationType: 'cash',
              location: 'cash',
              locationLabel: 'Physical Cash',
            });
          }
          chosenLabel = 'USD Cash in Hand';
        } else if (foreignDestination === 'storage:hsbc_eur') {
          const existing = storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'EUR');
          if (existing) {
            depositToStorageAsset(existing.id, amt);
          } else {
            addStorageAsset({
              name: 'HSBC EUR Account',
              category: 'Currency',
              quantity: amt,
              unit: 'EUR',
              buyPrice: effectiveFxRate,
              rate: effectiveFxRate,
              rateSource: 'currency:EUR',
              currency: 'EGP',
              locationType: 'bank',
              location: 'hsbc',
              locationLabel: 'HSBC Foreign Account',
            });
          }
          chosenLabel = 'HSBC EUR Account';
        }
      } else {
        const accKey = selectedEgpAccount;
        const acc = accounts[accKey];
        chosenLabel = acc?.name || accKey.toUpperCase();
        if (acc) {
          const curBal = Number(acc.balance || 0);
          updateAccountBalance(accKey, curBal + finalEgpAmount);
        }
      }
    } else {
      chosenLabel = 'Recorded Only (No Deposit)';
    }

    // 2. Record Job Payment
    let linkedEntryId = job.forecastEntryId;
    const newPayment: JobPayment = {
      id: generatePaymentId(),
      entryId: linkedEntryId,
      date: paidDate,
      amount: amt,
      currency: job.currency,
      egpAmount: finalEgpAmount,
      settlementAccount: chosenLabel,
      account: chosenLabel,
      syncToBudget,
      paymentNote: paymentNote.trim() || undefined,
    };

    const updatedPayments = [...(job.payments || []), newPayment];
    const newTotalPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const isFullySettled = newTotalPaid >= fin.totalInvoice && fin.totalInvoice > 0;
    let newStatus = job.status;
    let nextForecastDueDate = job.forecastDueDate;
    let nextForecastEntryId = job.forecastEntryId;
    let nextForecastAmount = job.forecastAmount;

    if (isFullySettled) {
      newStatus = 'paid';
      nextForecastDueDate = undefined;
      nextForecastEntryId = undefined;
      nextForecastAmount = undefined;
    } else if (newTotalPaid > 0) {
      newStatus = 'partial';
      if (nextForecastAmount) {
        nextForecastAmount = Math.max(0, nextForecastAmount - amt);
      }
    }

    // 3. Sync to Cashflow / History
    if (syncToBudget) {
      const sourceNote = shouldDeposit
        ? (settlementMode === 'foreign'
            ? `Job: ${job.title} (Deposited to ${chosenLabel})`
            : `Job: ${job.title} (Converted to ${formatMoney(finalEgpAmount)} in ${chosenLabel})`)
        : `Job: ${job.title} (Recorded in History - No Deposit)`;

      if (linkedEntryId && entries.some((e) => e.id === linkedEntryId)) {
        const existingEntry = entries.find((e) => e.id === linkedEntryId)!;
        const newDraw = {
          id: newPayment.id,
          date: paidDate,
          amount: finalEgpAmount,
          note: sourceNote,
          account: chosenLabel,
        };
        const updatedDraws = [...(existingEntry.draws || []), newDraw];
        const updatedActual = updatedDraws.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        updateEntry(linkedEntryId, {
          actualAmount: updatedActual,
          actualDate: paidDate,
          draws: updatedDraws,
          account: chosenLabel,
          isClosed: isFullySettled,
          source: sourceNote,
          jobId: job.id,
        });
      } else {
        linkedEntryId = addEntry({
          date: paidDate,
          category: 'Job Income',
          subcategory: job.client || 'Part-Time',
          tag: 'Part-Time',
          account: chosenLabel,
          type: 'income',
          amount: Math.round(fin.totalInvoice * effectiveFxRate),
          actualAmount: finalEgpAmount,
          actualDate: paidDate,
          currency: job.currency,
          originalAmount: fin.totalInvoice,
          fxRateAtEntry: effectiveFxRate,
          isClosed: isFullySettled,
          source: sourceNote,
          jobId: job.id,
        });
        newPayment.entryId = linkedEntryId;
      }
    }

    saveJob('partTime', {
      ...job,
      payments: updatedPayments,
      status: newStatus,
      forecastDueDate: nextForecastDueDate,
      forecastEntryId: nextForecastEntryId,
      forecastAmount: nextForecastAmount,
    });

    setActualPaidAmount('');
    setPaymentNote('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processPayment(true);
  };

  return (
    <dialog
      open
      className="native-dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ display: 'block', zIndex: 1000 }}
    >
      <form onSubmit={handleSubmit} className="entry-form" id="jobPaymentForm" style={{ maxWidth: '520px' }}>
        <div className="dialog-heading">
          <h3>Record Job Payment</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div
          style={{
            background: 'var(--surface-soft)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '13px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Total Invoiced:</span>
            <strong>{formatJobCurrency(fin.totalInvoice, job.currency)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Already Received:</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatJobCurrency(fin.totalPaid, job.currency)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
              paddingTop: '4px',
              borderTop: '1px dashed var(--line)',
            }}
          >
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
            placeholder={String(fin.remainingBalance || fin.totalInvoice || 0)}
            value={actualPaidAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
          />
        </label>
        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '-4px', marginBottom: '10px' }}>
          💡 Enter partial amount (e.g. $500) or full balance. Remaining balance stays active in Forecast.
        </small>

        {/* Currency / Settlement Choice */}
        {isForeign && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>
              Choose Currency &amp; Destination:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className={`ghost-button ${settlementMode === 'foreign' ? 'active-filter' : ''}`}
                onClick={() => setSettlementMode('foreign')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: settlementMode === 'foreign' ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--line)',
                  background: settlementMode === 'foreign' ? 'var(--primary-soft, rgba(59,130,246,0.1))' : 'var(--surface-soft)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px' }}>💵 Keep in {job.currency}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                  Storage Reserves (Bank/Cash)
                </div>
              </button>

              <button
                type="button"
                className={`ghost-button ${settlementMode === 'convert_egp' ? 'active-filter' : ''}`}
                onClick={() => setSettlementMode('convert_egp')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: settlementMode === 'convert_egp' ? '2px solid var(--green, #16a34a)' : '1px solid var(--line)',
                  background: settlementMode === 'convert_egp' ? 'var(--green-soft, rgba(22,163,74,0.1))' : 'var(--surface-soft)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px' }}>💱 Convert to EGP</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                  Operating Bank Account
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 1. Destination for Foreign Currency Reserves */}
        {isForeign && settlementMode === 'foreign' && (
          <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
            <label style={{ marginTop: 0 }}>
              Foreign Storage Destination &amp; Location
              <select value={foreignDestination} onChange={(e) => setForeignDestination(e.target.value)}>
                <option value="storage:hsbc_usd">🏦 HSBC USD Account (Foreign Bank)</option>
                <option value="storage:cash_usd">💵 USD Cash in Hand (Physical Cash)</option>
                {job.currency?.toUpperCase() === 'EUR' && (
                  <option value="storage:hsbc_eur">🏦 HSBC EUR Account (Foreign Bank)</option>
                )}
                {storageAssets
                  .filter((a) => a.unit.toUpperCase() === (job.currency || 'USD').toUpperCase())
                  .map((a) => (
                    <option key={a.id} value={`storage:existing-${a.id}`}>
                      📁 {a.name} ({a.quantity} {a.unit}) · {a.locationType === 'cash' ? 'Cash' : 'Bank'}
                    </option>
                  ))}
              </select>
            </label>
            <small style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
              ✓ Adds directly to your {job.currency} balance in the Storage tab without inflating liquid EGP accounts.
            </small>
          </div>
        )}

        {/* 2. Destination & Conversion for EGP */}
        {(!isForeign || settlementMode === 'convert_egp') && (
          <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
            {isForeign && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <label style={{ margin: 0 }}>
                  FX Rate (EGP / {job.currency})
                  <input
                    type="number"
                    step="0.01"
                    value={customFxRate}
                    onChange={(e) => handleFxRateChange(e.target.value)}
                    placeholder={String(fin.fxRate || 48.5)}
                  />
                </label>
                <label style={{ margin: 0 }}>
                  Received EGP Amount
                  <input
                    type="number"
                    step="1"
                    value={customEgpAmount}
                    onChange={(e) => setCustomEgpAmount(e.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>
            )}
            <label style={{ marginTop: 0 }}>
              Operating Account Destination (EGP)
              <select value={selectedEgpAccount} onChange={(e) => setSelectedEgpAccount(e.target.value)}>
                {Object.entries(accounts).map(([id, a]) => (
                  <option key={id} value={id}>
                    🏦 {a.name} (Current Bal: {formatMoney(a.balance || 0)})
                  </option>
                ))}
              </select>
            </label>
            <small style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
              ✓ Automatically credits {formatMoney(Number(customEgpAmount) || 0)} into {accounts[selectedEgpAccount]?.name || 'Operating Account'}.
            </small>
          </div>
        )}

        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
          <input
            name="syncToBudget"
            type="checkbox"
            checked={syncToBudget}
            onChange={(e) => setSyncToBudget(e.target.checked)}
          />
          <span>Record as Income Entry in Cash Forecast &amp; History</span>
        </label>

        <label style={{ marginTop: '10px' }}>
          Payment Reference / Note
          <input
            name="paymentNote"
            type="text"
            placeholder="Wire ref, Swift confirmation, conversion details..."
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="ghost-button" type="button" onClick={() => processPayment(false)}>
            Don't deposit
          </button>
          <button className="primary-button" type="button" onClick={() => processPayment(true)}>
            Deposit &amp; Save
          </button>
        </div>
      </form>
    </dialog>
  );
};



// ==========================================
// 5. Job Forecast Modal (Schedule Invoiced Amount into Forecast)
// ==========================================
interface JobForecastModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
}

export const JobForecastModal: React.FC<JobForecastModalProps> = ({ isOpen, jobId, onClose }) => {
  const {
    partTimeJobs,
    rates,
    saveJob,
    accounts,
    storageAssets,
    addEntry,
    updateEntry,
    deleteEntry,
    entries,
  } = useBudgetStore();

  const [expectedDate, setExpectedDate] = useState(DateUtils.todayString());
  const [forecastAmount, setForecastAmount] = useState('');
  const [destination, setDestination] = useState('storage:hsbc_usd');

  const job = partTimeJobs.find((j) => j.id === jobId);

  const currentForecastKey = isOpen && job ? `${job.id}-${job.forecastDueDate || ''}-${job.forecastAmount || ''}` : 'closed';
  const [prevForecastKey, setPrevForecastKey] = useState(currentForecastKey);

  if (prevForecastKey !== currentForecastKey) {
    setPrevForecastKey(currentForecastKey);
    if (job) {
      const jobFin = calculateJobFinancials(job, rates);
      setExpectedDate(job.forecastDueDate || job.endDate || DateUtils.todayString());
      setForecastAmount(String(job.forecastAmount || jobFin.remainingBalance || jobFin.totalInvoice || 0));
      setDestination(
        job.forecastDestination ||
          ((job.currency || '').toUpperCase() === 'EUR' ? 'storage:hsbc_eur' : 'storage:hsbc_usd')
      );
    }
  }

  if (!isOpen || !job) return null;

  const fin = calculateJobFinancials(job, rates);
  const isForeign = (job.currency || 'USD').toUpperCase() !== 'EGP';

  const handleRemoveForecast = () => {
    if (job.forecastEntryId) {
      deleteEntry(job.forecastEntryId);
    }
    saveJob('partTime', {
      ...job,
      forecastDueDate: undefined,
      forecastEntryId: undefined,
      forecastAmount: undefined,
      forecastDestination: undefined,
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(forecastAmount);
    if (!amt || amt <= 0 || !expectedDate) return;

    let chosenLabel = destination;
    if (destination === 'storage:hsbc_usd') chosenLabel = 'HSBC USD Account';
    else if (destination === 'storage:hsbc_eur') chosenLabel = 'HSBC EUR Account';
    else if (destination === 'storage:cash_usd') chosenLabel = 'USD Cash in Hand';
    else if (destination.startsWith('storage:existing-')) {
      const assetId = destination.replace('storage:existing-', '');
      const found = storageAssets.find((a) => a.id === assetId);
      chosenLabel = found ? found.name : 'Storage Reserve';
    } else {
      const accKey = destination.replace('account:', '');
      chosenLabel = accounts[accKey]?.name || accKey.toUpperCase();
    }

    const egpAmount = Math.round(amt * fin.fxRate);
    let entryId = job.forecastEntryId;

    const existingEntry = entryId ? entries.find((e) => e.id === entryId) : null;
    if (existingEntry) {
      updateEntry(existingEntry.id, {
        date: expectedDate,
        amount: egpAmount,
        currency: job.currency,
        originalAmount: amt,
        fxRateAtEntry: fin.fxRate,
        account: chosenLabel,
        subcategory: job.client || 'Part-Time',
        source: `Job: ${job.title} (Expected in ${chosenLabel})`,
        jobId: job.id,
      });
    } else {
      entryId = addEntry({
        date: expectedDate,
        category: 'Job Income',
        subcategory: job.client || 'Part-Time',
        tag: 'Part-Time',
        account: chosenLabel,
        type: 'income',
        amount: egpAmount,
        currency: job.currency,
        originalAmount: amt,
        fxRateAtEntry: fin.fxRate,
        source: `Job: ${job.title} (Expected in ${chosenLabel})`,
        jobId: job.id,
      });
    }

    saveJob('partTime', {
      ...job,
      status: job.status === 'active' ? 'invoiced' : job.status,
      forecastDueDate: expectedDate,
      forecastEntryId: entryId,
      forecastAmount: amt,
      forecastDestination: destination,
    });

    onClose();
  };

  const projectedEgp = Math.round((Number(forecastAmount) || 0) * fin.fxRate);

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="jobForecastForm" style={{ maxWidth: '500px' }}>
        <div className="dialog-heading">
          <h3>Schedule Invoiced Income in Forecast</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px' }}>
          Schedule when this invoiced client payout is expected to arrive. It will appear immediately in your Cashflow &amp; Net Worth Forecast.
        </p>

        <label>
          Expected Payment Date
          <input
            type="date"
            required
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </label>

        <label>
          Expected Inflow Amount ({job.currency})
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder={String(fin.remainingBalance || 0)}
            value={forecastAmount}
            onChange={(e) => setForecastAmount(e.target.value)}
          />
        </label>

        <label>
          Planned Destination
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            {isForeign && (
              <optgroup label="Foreign Currency Reserves (Storage Tab)">
                <option value="storage:hsbc_usd">🏦 HSBC USD Sub-Account</option>
                <option value="storage:hsbc_eur">🏦 HSBC EUR Sub-Account</option>
                <option value="storage:cash_usd">💵 USD Cash in Hand</option>
                {storageAssets
                  .filter((a) => a.unit.toUpperCase() === (job.currency || 'USD').toUpperCase())
                  .map((a) => (
                    <option key={a.id} value={`storage:existing-${a.id}`}>
                      📁 {a.name} ({a.quantity} {a.unit})
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label="Bank Operating (Convert to EGP)">
              {Object.entries(accounts).map(([id, a]) => (
                <option key={id} value={`account:${id}`}>
                  🏦 {a.name} Operating
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {projectedEgp > 0 && (
          <div style={{ background: 'var(--surface-soft)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Projected Inflow in EGP:</span>
            <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{formatMoney(projectedEgp)}</strong>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
          {job.forecastDueDate ? (
            <button
              className="delete-button"
              type="button"
              style={{ marginRight: 'auto' }}
              onClick={handleRemoveForecast}
            >
              Remove from Forecast
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="ghost-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Save Forecast Date
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
};
