import React, { useState, useEffect } from 'react';
import { inferTag, useBudgetStore } from '../../store/useBudgetStore';
import { calculateCreditSettlementDate, getCreditCycleHint } from '../../engine/creditCards';
import { getCurrencyRate, formatNativeCurrency } from '../../engine/currency';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { getEntryActualAmount } from '../../engine/forecast';
import type { CashEntry, EntryDraw } from '../../types';
import { DeleteAffectedPartiesModal, type AffectedPartyOption } from './DeleteAffectedPartiesModal';

interface EntryModalProps {
  isOpen: boolean;
  initialType?: 'expense' | 'income';
  entryToEdit?: CashEntry | null;
  onClose: () => void;
  onDeductPrompt?: (entry: CashEntry, actualAmount: number) => void;
}

export const EntryModal: React.FC<EntryModalProps> = ({
  isOpen,
  initialType = 'expense',
  entryToEdit,
  onClose,
  onDeductPrompt,
}) => {
  const {
    entries,
    addEntry,
    updateEntry,
    recordActual,
    clearActual,
    updateCreditSettlementOverride,
    recalculateCreditSettlement,
    deleteDraw,
    settleJobForecastPayment,
    rates,
    entryActuals,
    partTimeJobs,
    asfJobs,
    irqJobs,
    storageAssets,
    accounts,
  } = useBudgetStore();

  const activeEntry = (entryToEdit ? entries.find((e) => e.id === entryToEdit.id) : null) || entryToEdit;
  const [deleteDrawTarget, setDeleteDrawTarget] = useState<{ drawIndex: number; draw: EntryDraw } | null>(null);

  const [creditType, setCreditType] = useState<string>('');
  const [date, setDate] = useState<string>(DateUtils.todayString());
  const [creditSettlementDate, setCreditSettlementDate] = useState<string>('');
  const [creditSettlementHint, setCreditSettlementHint] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [account, setAccount] = useState<string>('cib');
  const [type, setType] = useState<'income' | 'expense'>(initialType);
  const [currency, setCurrency] = useState<string>('EGP');
  const [amount, setAmount] = useState<string>('');
  const [actualAmount, setActualAmount] = useState<string>('');
  const [recalcStatus, setRecalcStatus] = useState<string>('');
  const [statementNote, setStatementNote] = useState<string>('');
  const [seriesEditMode, setSeriesEditMode] = useState<'single' | 'future'>('single');

  // Recurring options
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly' | 'weekly' | 'biweekly'>('monthly');
  const [recurringCount, setRecurringCount] = useState<number>(12);
  const [recurringDayOfWeek, setRecurringDayOfWeek] = useState<number>(new Date().getDay());

  useEffect(() => {
    if (activeEntry) {
      const entryCurr = activeEntry.currency || 'EGP';
      setCreditType(activeEntry.creditType || '');
      setDate(activeEntry.date);
      setCategory(activeEntry.category);
      setTag(activeEntry.tag || activeEntry.subcategory || '');
      setAccount(activeEntry.account || 'cib');
      setType(activeEntry.type);
      setCurrency(entryCurr);
      
      const isForeign = entryCurr !== 'EGP';
      const nativeAmount = isForeign
        ? (activeEntry.originalAmount !== undefined && activeEntry.originalAmount !== null
            ? activeEntry.originalAmount
            : (activeEntry.fxRateAtEntry ? Math.round((activeEntry.amount / activeEntry.fxRateAtEntry) * 100) / 100 : activeEntry.amount))
        : activeEntry.amount;
      setAmount(String(nativeAmount));

      const existingActual = getEntryActualAmount(activeEntry, entryActuals);
      const nativeActual = isForeign && existingActual > 0
        ? (activeEntry.fxRateAtEntry ? Math.round((existingActual / activeEntry.fxRateAtEntry) * 100) / 100 : existingActual)
        : existingActual;
      setActualAmount(nativeActual > 0 ? String(nativeActual) : '');

      setCreditSettlementDate(activeEntry.creditSettlementDate || activeEntry.settlementDate || '');
      setStatementNote(activeEntry.statementNote || '');
      setSeriesEditMode('single');
      setIsRecurring(false);
      setRecalcStatus('');
    } else {
      setType(initialType);
      setCreditType('');
      setDate(DateUtils.todayString());
      setCategory('');
      setTag('');
      setAccount('cib');
      setCurrency('EGP');
      setAmount('');
      setActualAmount('');
      setCreditSettlementDate('');
      setStatementNote('');
      setSeriesEditMode('single');
      setRecurringDayOfWeek(new Date(`${DateUtils.todayString()}T00:00:00`).getDay());
      setIsRecurring(false);
      setRecalcStatus('');
    }
  }, [entryToEdit, activeEntry?.draws?.length, initialType, isOpen, entryActuals]);

  // Recalculate settlement date when credit card or date changes
  useEffect(() => {
    if (creditType === 'cib_card') {
      const settDate = calculateCreditSettlementDate(date, 'cib');
      setCreditSettlementDate(settDate);
      setCreditSettlementHint(getCreditCycleHint(date, 'cib'));
      setAccount('cib');
    } else if (creditType === 'hsbc_card') {
      const settDate = calculateCreditSettlementDate(date, 'hsbc');
      setCreditSettlementDate(settDate);
      setCreditSettlementHint(getCreditCycleHint(date, 'hsbc'));
      setAccount('hsbc');
    } else if (creditType === 'cib') {
      setCategory('CIB Credit Due');
      setAccount('cib');
      setCreditSettlementHint('');
    } else if (creditType === 'hsbc') {
      setCategory('HSBC Credit Due');
      setAccount('hsbc');
      setCreditSettlementHint('');
    } else {
      setCreditSettlementHint('');
    }
  }, [creditType, date]);

  useEffect(() => {
    if (!tag.trim()) {
      const inferred = inferTag({ category, creditType, account, type });
      if (inferred) setTag(inferred);
    }
  }, [category, creditType, account, type, tag]);

  if (!isOpen) return null;

  // Currency conversion calculation note
  const numericAmount = Number(amount) || 0;
  const fxRate = currency === 'EGP' ? 1 : getCurrencyRate(rates, currency);
  const egpEquivalent = Math.round(numericAmount * fxRate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numericAmount || numericAmount <= 0) return;

    const isSettlement =
      creditType === 'cib' ||
      creditType === 'hsbc' ||
      (entryToEdit?.id && entryToEdit.id.startsWith('credit-settlement-')) ||
      category.toLowerCase().includes('settlement') ||
      category.toLowerCase().includes('credit due') ||
      category.toLowerCase().includes('card payment') ||
      category.toLowerCase().includes('credit payment') ||
      category.toLowerCase().includes('bill payment') ||
      category.toLowerCase().includes('card bill') ||
      tag.toLowerCase().includes('settlement');

    const isCardExpense = (creditType === 'cib_card' || creditType === 'hsbc_card') && !isSettlement;
    const isCreditDue = creditType === 'cib' || creditType === 'hsbc' || isSettlement;
    const shouldPromptDeduct = Boolean(onDeductPrompt);

    const normalizedCategory = category.trim() || (isCreditDue
      ? `${creditType.includes('hsbc') ? 'HSBC' : 'CIB'} Credit Due`
      : type === 'income' ? 'Income' : 'Other');
    const chosenAccount = isCardExpense && (!account.trim() || account.toLowerCase() === 'cash')
      ? (creditType.includes('hsbc') ? 'HSBC Credit' : 'CIB Credit')
      : account.toLowerCase().trim() || (creditType === 'hsbc' ? 'hsbc' : 'cib');
    const settlementDate = isCardExpense
      ? creditSettlementDate || calculateCreditSettlementDate(date, creditType.includes('hsbc') ? 'hsbc' : 'cib')
      : '';
    const baseEntry: Omit<CashEntry, 'id'> = {
      date,
      category: normalizedCategory,
      subcategory: tag.trim() || undefined,
      tag: tag.trim() || undefined,
      account: chosenAccount,
      type,
      amount: egpEquivalent,
      currency,
      originalAmount: numericAmount,
      fxRateAtEntry: fxRate,
      creditType: creditType || undefined,
      creditSettlementDate: settlementDate || undefined,
      source: isCardExpense ? 'credit card' : isSettlement ? 'recurring credit' : undefined,
      actualAmount: actualAmount ? Math.round(Number(actualAmount) * fxRate) : undefined,
      actualDate: actualAmount ? date : undefined,
    };

    if (entryToEdit) {
      const newActual = actualAmount ? Math.round(Number(actualAmount) * fxRate) : 0;
      const previousActual = getEntryActualAmount(entryToEdit, entryActuals);
      if (entryToEdit.id.startsWith('credit-settlement-')) {
        updateCreditSettlementOverride(entryToEdit.id, {
          amount: egpEquivalent,
          date,
          note: statementNote.trim() || undefined,
        });
      } else {
        updateEntry(entryToEdit.id, baseEntry, seriesEditMode);
      }
      if (newActual > 0) {
        recordActual(entryToEdit.id, newActual, date, {
          tag: baseEntry.tag,
          account: baseEntry.account,
          note: baseEntry.note,
        });
        if (shouldPromptDeduct && newActual !== previousActual && onDeductPrompt) {
          onDeductPrompt({ ...baseEntry, id: entryToEdit.id }, newActual - previousActual);
        }
      } else if (previousActual > 0) {
        clearActual(entryToEdit.id);
      }
    } else {
      const newActual = actualAmount ? Math.round(Number(actualAmount) * fxRate) : 0;
      if (isRecurring && recurringCount > 1) {
        const seriesId = `series-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let firstCreatedId = '';
        for (let i = 0; i < recurringCount; i++) {
          let recDate = date;
          if (recurringFrequency === 'monthly') {
            const [y, m, d] = date.split('-').map(Number);
            const targetM = m - 1 + i;
            const targetYear = y + Math.floor(targetM / 12);
            const targetMonth = (targetM % 12) + 1;
            const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
            const safeDay = Math.min(d, daysInTargetMonth);
            recDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
          } else if (recurringFrequency === 'weekly' || recurringFrequency === 'biweekly') {
            const dObj = new Date(date);
            const baseDay = dObj.getDay();
            const target = recurringDayOfWeek;
            const offset = (target - baseDay + 7) % 7;
            dObj.setDate(dObj.getDate() + offset + i * (recurringFrequency === 'biweekly' ? 14 : 7));
            recDate = DateUtils.formatDateObj(dObj);
          }

          const createdId = addEntry({
            ...baseEntry,
            date: recDate,
            isRecurring: true,
            seriesId,
            actualAmount: i === 0 && newActual > 0 ? newActual : undefined,
            actualDate: i === 0 && newActual > 0 ? recDate : undefined,
            source: 'recurring',
          });
          if (i === 0) firstCreatedId = createdId;
        }
        if (newActual > 0 && shouldPromptDeduct && onDeductPrompt) {
          onDeductPrompt({ ...baseEntry, id: firstCreatedId }, newActual);
        }
      } else {
        const createdId = addEntry(baseEntry);
        if (newActual > 0 && shouldPromptDeduct && onDeductPrompt) {
          onDeductPrompt({ ...baseEntry, id: createdId }, newActual);
        }
      }
    }

    onClose();
  };

  const handleRecalculateCreditDue = () => {
    if (!entryToEdit?.id.startsWith('credit-settlement-')) return;
    const recalculated = recalculateCreditSettlement(entryToEdit.id);
    if (!recalculated) {
      setRecalcStatus('No matching card spend or base due was found for this cycle.');
      return;
    }
    setAmount(String(recalculated.amount));
    setDate(recalculated.date);
    setActualAmount('');
    setCreditSettlementDate(recalculated.date);
    setRecalcStatus(`Recalculated from ${recalculated.cardExpenseCount || 0} card transaction(s). Click Update entry to save.`);
  };

  if (!isOpen) return null;

  return (
    <dialog open className="native-dialog entry-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="entry-form entry-form-modern" id="entryForm">
        <div className="dialog-heading">
          <h3>{entryToEdit ? 'Edit budget entry' : `Add ${type === 'income' ? 'Income' : 'Expense'}`}</h3>
          <button className="icon-button close-dialog-btn" type="button" aria-label="Close dialog" onClick={onClose}>
            ✕
          </button>
        </div>

        <label>
          Payment / Credit Mode
          <select value={creditType} onChange={(e) => setCreditType(e.target.value)}>
            <option value="">Direct (Cash / Bank account)</option>
            <option value="cib_card">💳 Card Spend: Charged to CIB Card (Settles next cycle)</option>
            <option value="hsbc_card">💳 Card Spend: Charged to HSBC Card (Settles next cycle)</option>
            <option value="cib">🏛️ Card Bill Settlement: Pay CIB Card (Deducts from account)</option>
            <option value="hsbc">🏛️ Card Bill Settlement: Pay HSBC Card (Deducts from account)</option>
          </select>
        </label>

        {entryToEdit?.id.startsWith('credit-settlement-') && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>🏛️ Credit Statement Reconciliation</span>
              <button className="ghost-button" style={{ fontSize: '11px', padding: '2px 8px' }} type="button" onClick={handleRecalculateCreditDue}>
                Reset to calculated
              </button>
            </div>
            {entryToEdit.calculatedAmount !== undefined && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span>Calculated: <strong>{formatMoney(entryToEdit.calculatedAmount)}</strong></span>
                <span>Statement: <strong>{formatMoney(egpEquivalent)}</strong></span>
                <span style={{ color: (egpEquivalent - entryToEdit.calculatedAmount) > 0 ? '#f43f5e' : (egpEquivalent - entryToEdit.calculatedAmount) < 0 ? '#10b981' : 'inherit' }}>
                  Variance: <strong>{(egpEquivalent - entryToEdit.calculatedAmount) > 0 ? `+${formatMoney(egpEquivalent - entryToEdit.calculatedAmount)}` : formatMoney(egpEquivalent - entryToEdit.calculatedAmount)}</strong>
                </span>
              </div>
            )}
            <label style={{ fontSize: '12px', margin: 0 }}>
              Reconciliation note (optional)
              <input
                type="text"
                placeholder="e.g. Bank refund, pending purchase, statement fee"
                value={statementNote}
                onChange={(e) => setStatementNote(e.target.value)}
                style={{ marginTop: '4px', fontSize: '12px' }}
              />
            </label>
            {recalcStatus && (
              <small style={{ display: 'block', color: 'var(--muted)', marginTop: '6px' }}>
                {recalcStatus}
              </small>
            )}
          </div>
        )}

        {entryToEdit && (entryToEdit.seriesId || entryToEdit.isRecurring) && (
          <div style={{ padding: '10px 12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)', marginTop: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>🔄 Recurring Entry Scope</div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="radio"
                  name="seriesEditMode"
                  value="single"
                  checked={seriesEditMode === 'single'}
                  onChange={() => setSeriesEditMode('single')}
                />
                <span>This occurrence only</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="radio"
                  name="seriesEditMode"
                  value="future"
                  checked={seriesEditMode === 'future'}
                  onChange={() => setSeriesEditMode('future')}
                />
                <span>All future occurrences</span>
              </label>
            </div>
          </div>
        )}

        {/* Existing Draws List if Editing */}
        {activeEntry && Array.isArray(activeEntry.draws) && activeEntry.draws.length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--surface-soft)', borderRadius: '8px', border: '1px solid var(--line)', marginTop: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>📋 Recorded Draws / Tranches ({activeEntry.draws.length})</div>
            <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {activeEntry.draws.map((d, dIdx) => {
                const entryIsForeign = (activeEntry.currency || 'EGP').toUpperCase() !== 'EGP';
                const drawRate = activeEntry.fxRateAtEntry || getCurrencyRate(rates, activeEntry.currency || 'USD') || 48.5;
                const nativeDrawQty = entryIsForeign ? Math.round((d.amount / drawRate) * 100) / 100 : d.amount;
                return (
                  <div key={d.id || dIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '4px 8px', background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                    <span>
                      {DateUtils.formatDisplayDate(d.date)}:{' '}
                      <strong>
                        {entryIsForeign
                          ? `${formatNativeCurrency(nativeDrawQty, activeEntry.currency)} (≈ ${formatMoney(d.amount)})`
                          : formatMoney(d.amount)}
                      </strong>{' '}
                      {d.tag ? ` #${d.tag}` : ''}
                      {d.note ? ` (${d.note})` : ''}
                    </span>
                    {(() => {
                      const linkedJob =
                        partTimeJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id || p.id === d.id)) ||
                        asfJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id || p.id === d.id)) ||
                        irqJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id || p.id === d.id));
                      const hasAffectedDraw = Boolean(linkedJob || (storageAssets.length > 0 && (d.storageAssetId || d.account?.toLowerCase().includes('storage') || entryIsForeign)));
                      return (
                        <button
                          type="button"
                          className="icon-button"
                          style={{ position: 'relative', color: 'var(--rose, #f43f5e)', padding: '2px', height: 'auto', minWidth: 'auto' }}
                          title={hasAffectedDraw ? 'Delete this draw (has affected linked records)' : 'Delete this draw'}
                          onClick={() => {
                            setDeleteDrawTarget({ drawIndex: dIdx, draw: d });
                          }}
                        >
                          ✕
                          {hasAffectedDraw && (
                            <span
                              className="affected-parties-dot"
                              title="Has affected linked records"
                            />
                          )}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <label id="dateField">
          Date
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {(creditType === 'cib_card' || creditType === 'hsbc_card') && (
          <label id="creditSettlementField" className="entry-field">
            Settlement Due Date
            <input
              name="creditSettlementDate"
              type="date"
              value={creditSettlementDate}
              onChange={(e) => setCreditSettlementDate(e.target.value)}
            />
            {creditSettlementHint && (
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
                💡 {creditSettlementHint}
              </small>
            )}
          </label>
        )}

        <label id="categoryField" className="entry-field">
          Category
          <input
            name="category"
            type="text"
            list="expenseCategories"
            placeholder="Home, Training, Kids, Food, Bills..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <datalist id="expenseCategories">
          <option value="Home" />
          <option value="Training" />
          <option value="Kids" />
          <option value="Transportation" />
          <option value="Garage" />
          <option value="Bills" />
          <option value="Food" />
          <option value="Groceries" />
          <option value="Dining Out" />
          <option value="Medical" />
          <option value="Other" />
        </datalist>

        <label id="tagField" className="entry-field">
          Subcategory / Tag
          <input
            name="tag"
            type="text"
            list="subcatSuggestions"
            placeholder="e.g. Food, Bills, Groceries (optional)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </label>
        <datalist id="subcatSuggestions">
          <option value="Food" />
          <option value="Groceries" />
          <option value="Credit" />
          <option value="Loan" />
          <option value="Installment" />
          <option value="Rent" />
          <option value="Salary" />
          <option value="Bills" />
          <option value="Kids" />
          <option value="Part-Time" />
          <option value="Maintenance" />
          <option value="Electricity" />
          <option value="Internet" />
          <option value="Water" />
          <option value="Fuel" />
        </datalist>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Account / Destination
            <input
              name="account"
              type="text"
              list="accountSuggestions"
              placeholder="cib, hsbc, cash, hsbc_usd..."
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />
          </label>
          <datalist id="accountSuggestions">
            <option value="cib">🏦 CIB Operating Account</option>
            <option value="hsbc">🏦 HSBC Operating Account</option>
            <option value="hsbc_usd">🏦 HSBC USD Sub-Account (Storage)</option>
            <option value="hsbc_eur">🏦 HSBC EUR Sub-Account (Storage)</option>
            <option value="cash_usd">💵 USD Cash in Hand (Storage)</option>
            <option value="cash">💵 Cash in Hand (EGP)</option>
          </datalist>

          <label id="typeField" className="entry-field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
          <label>
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="EGP">EGP (Local)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="SAR">SAR (﷼)</option>
              <option value="AED">AED (د.إ)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </label>

          <label>
            Amount ({currency})
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
        </div>

        {currency !== 'EGP' && numericAmount > 0 && (
          <small style={{ color: 'var(--muted)', fontSize: '12px', margin: '-4px 0 0', display: 'block' }}>
            ≈ {formatMoney(egpEquivalent)} (FX: {fxRate.toFixed(2)})
          </small>
        )}

        <label>
          Actual amount {currency !== 'EGP' ? `(${currency})` : ''} (Optional)
          <input
            name="actualAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder={currency !== 'EGP' ? '0.00 if not paid yet' : '0 if not paid yet'}
            value={actualAmount}
            onChange={(e) => setActualAmount(e.target.value)}
          />
        </label>
        {currency !== 'EGP' && Number(actualAmount) > 0 && (
          <small style={{ color: 'var(--muted)', fontSize: '12px', margin: '-4px 0 0', display: 'block' }}>
            Actual in EGP: ≈ {formatMoney(Math.round(Number(actualAmount) * fxRate))}
          </small>
        )}

        {!entryToEdit && (
          <div id="recurringField" className="entry-field recurring-group" style={{ marginTop: '8px' }}>
            <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span>Repeat this entry</span>
            </label>

            {isRecurring && (
              <div className="recurring-options" style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Frequency
                  <select
                    value={recurringFrequency}
                    onChange={(e) => setRecurringFrequency(e.target.value as 'monthly' | 'weekly' | 'biweekly')}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
                  </select>
                </label>

                <label>
                  <span>Number of times</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={recurringCount}
                    onChange={(e) => setRecurringCount(Number(e.target.value) || 12)}
                  />
                </label>
                {(recurringFrequency === 'weekly' || recurringFrequency === 'biweekly') && (
                  <label>
                    Day of the week
                    <select value={recurringDayOfWeek} onChange={(e) => setRecurringDayOfWeek(Number(e.target.value))}>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {entryToEdit && !activeEntry?.isClosed && (
            <button
              type="button"
              className="ghost-button finish-loan-btn"
              style={{
                marginRight: 'auto',
                color: 'var(--green, #16a34a)',
                borderColor: 'var(--green, #16a34a)',
                padding: '8px 14px',
              }}
              title="Finish and close this entry at current actual amount"
              onClick={() => {
                const currentActualEgp = getEntryActualAmount(activeEntry || entryToEdit, entryActuals);
                const inputActual = Number(actualAmount) || 0;
                const finalActualEgp = currency !== 'EGP'
                  ? Math.round(inputActual * fxRate) || currentActualEgp
                  : inputActual || currentActualEgp;

                updateEntry(entryToEdit.id, {
                  isClosed: true,
                  keepOngoing: false,
                  actualAmount: finalActualEgp > 0 ? finalActualEgp : undefined,
                  amount: finalActualEgp > 0 ? finalActualEgp : entryToEdit.amount,
                });
                settleJobForecastPayment(entryToEdit.id, finalActualEgp, true);
                onClose();
              }}
            >
              ✓ Finish &amp; Fulfill
            </button>
          )}
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            {entryToEdit ? 'Update entry' : 'Save entry'}
          </button>
        </div>
      </form>

      {/* Selective affected parties deletion modal */}
      {deleteDrawTarget && activeEntry && (() => {
        const linkedJob =
          partTimeJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id)) ||
          asfJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id)) ||
          irqJobs.find((j) => j.forecastEntryId === activeEntry.id || j.payments?.some((p) => p.entryId === activeEntry.id));

        const entryIsForeign = (activeEntry.currency || 'EGP').toUpperCase() !== 'EGP';
        const drawRate = activeEntry.fxRateAtEntry || getCurrencyRate(rates, activeEntry.currency || 'USD') || 48.5;
        const nativeDrawQty = entryIsForeign ? Math.round((deleteDrawTarget.draw.amount / drawRate) * 100) / 100 : deleteDrawTarget.draw.amount;
        const amountDisplay = entryIsForeign
          ? `${formatNativeCurrency(nativeDrawQty, activeEntry.currency)} (≈ ${formatMoney(deleteDrawTarget.draw.amount)})`
          : formatMoney(deleteDrawTarget.draw.amount);

        const deleteDrawOptions: AffectedPartyOption[] = [
          {
            id: 'cashflow',
            label: 'Forecast & History Actuals',
            sublabel: `Deduct ${amountDisplay} from this forecast entry and recalculate actual received amount.`,
            icon: '📊',
            defaultChecked: true,
          },
          ...(linkedJob
            ? [
                {
                  id: 'job',
                  label: `Job Tracker: ${linkedJob.title || linkedJob.client}`,
                  sublabel: `Deduct payment tranche from "${linkedJob.title || linkedJob.client}" and adjust remaining invoice.`,
                  icon: '💼',
                  defaultChecked: true,
                },
              ]
            : []),
          (() => {
            const targetAccount = (deleteDrawTarget.draw.account || activeEntry.account || '').trim().toLowerCase();
            const currUpper = (activeEntry.currency || 'USD').toUpperCase();
            const matchingStorage = storageAssets.find(
              (a) =>
                a.id === deleteDrawTarget.draw.storageAssetId ||
                a.name.trim().toLowerCase() === targetAccount ||
                (entryIsForeign &&
                  ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper))
            );
            const matchedAccount = accounts[targetAccount];
            const isExpense = activeEntry.type === 'expense';
            const assetName = matchingStorage
              ? matchingStorage.name
              : matchedAccount
              ? matchedAccount.name || targetAccount.toUpperCase()
              : targetAccount.toUpperCase();
            const currentQtyDesc = matchingStorage
              ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit || ''})`
              : matchedAccount
              ? ` (Current: ${formatMoney(matchedAccount.balance || 0)})`
              : '';
            const actionText = isExpense
              ? `Refund / restore +${entryIsForeign ? formatNativeCurrency(nativeDrawQty, activeEntry.currency) : formatMoney(deleteDrawTarget.draw.amount)} to`
              : `Revert / deduct -${entryIsForeign ? formatNativeCurrency(nativeDrawQty, activeEntry.currency) : formatMoney(deleteDrawTarget.draw.amount)} from`;

            return {
              id: 'storage',
              label: matchingStorage ? `Storage Asset: ${assetName}` : `Bank Balance: ${assetName}`,
              sublabel: `${actionText} ${assetName}${currentQtyDesc}.`,
              icon: matchingStorage ? '🏦' : '💳',
              defaultChecked: Boolean(
                matchingStorage ||
                matchedAccount ||
                targetAccount.includes('storage') ||
                targetAccount.includes('usd') ||
                targetAccount.includes('hsbc') ||
                targetAccount.includes('cib') ||
                targetAccount.includes('cash') ||
                entryIsForeign
              ),
            };
          })(),
        ];

        return (
          <DeleteAffectedPartiesModal
            isOpen={Boolean(deleteDrawTarget)}
            title="Delete Tranche Draw"
            subtitle="Choose which records and balances should be updated upon deleting this tranche."
            itemDescription={`Tranche on ${DateUtils.formatDisplayDate(deleteDrawTarget.draw.date)}${deleteDrawTarget.draw.note ? ` — ${deleteDrawTarget.draw.note}` : ''}`}
            amountFormatted={amountDisplay}
            options={deleteDrawOptions}
            onConfirm={(selectedOptionIds) => {
              deleteDraw(activeEntry.id, deleteDrawTarget.drawIndex, {
                updateCashflow: selectedOptionIds.includes('cashflow'),
                syncJob: selectedOptionIds.includes('job'),
                revertStorage: selectedOptionIds.includes('storage'),
              });
              setDeleteDrawTarget(null);
            }}
            onClose={() => setDeleteDrawTarget(null)}
          />
        );
      })()}
    </dialog>
  );
};
