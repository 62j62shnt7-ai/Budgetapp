import React, { useState, useEffect } from 'react';
import { inferTag, useBudgetStore } from '../../store/useBudgetStore';
import { calculateCreditSettlementDate, getCreditCycleHint } from '../../engine/creditCards';
import { getCurrencyRate } from '../../engine/currency';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { getEntryActualAmount } from '../../engine/forecast';
import type { CashEntry } from '../../types';

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
    addEntry,
    updateEntry,
    recordActual,
    clearActual,
    updateCreditSettlementOverride,
    recalculateCreditSettlement,
    rates,
    entryActuals,
  } = useBudgetStore();

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

  // Recurring options
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly' | 'weekly' | 'biweekly'>('monthly');
  const [recurringCount, setRecurringCount] = useState<number>(12);
  const [recurringDayOfWeek, setRecurringDayOfWeek] = useState<number>(new Date().getDay());

  useEffect(() => {
    if (entryToEdit) {
      setCreditType(entryToEdit.creditType || '');
      setDate(entryToEdit.date);
      setCategory(entryToEdit.category);
      setTag(entryToEdit.tag || entryToEdit.subcategory || '');
      setAccount(entryToEdit.account || 'cib');
      setType(entryToEdit.type);
      setCurrency(entryToEdit.currency || 'EGP');
      setAmount(String(entryToEdit.amount));
      const existingActual = getEntryActualAmount(entryToEdit, entryActuals);
      setActualAmount(existingActual > 0 ? String(existingActual) : '');
      setCreditSettlementDate(entryToEdit.creditSettlementDate || entryToEdit.settlementDate || '');
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
      setRecurringDayOfWeek(new Date(`${DateUtils.todayString()}T00:00:00`).getDay());
      setIsRecurring(false);
      setRecalcStatus('');
    }
  }, [entryToEdit, initialType, isOpen]);

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
  const egpEquivalent = numericAmount * fxRate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numericAmount || numericAmount <= 0) return;

    const isCardExpense = creditType === 'cib_card' || creditType === 'hsbc_card';
    const isCreditDue = creditType === 'cib' || creditType === 'hsbc';
    const normalizedCategory = category.trim() || (isCreditDue
      ? `${creditType === 'cib' ? 'CIB' : 'HSBC'} Credit Due`
      : type === 'income' ? 'Income' : 'Other');
    const chosenAccount = isCardExpense && (!account.trim() || account.toLowerCase() === 'cash')
      ? (creditType.includes('hsbc') ? 'HSBC Credit' : 'CIB Credit')
      : account.toLowerCase().trim() || 'cib';
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
      creditType: creditType || undefined,
      creditSettlementDate: settlementDate || undefined,
      source: isCardExpense ? 'credit card' : undefined,
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
        });
      } else {
        updateEntry(entryToEdit.id, baseEntry);
      }
      if (newActual > 0) {
        recordActual(entryToEdit.id, newActual, date);
        if (onDeductPrompt && newActual !== previousActual) {
          onDeductPrompt({ ...baseEntry, id: entryToEdit.id }, newActual - previousActual);
        }
      } else if (previousActual > 0) {
        clearActual(entryToEdit.id);
      }
    } else {
      if (isRecurring && recurringCount > 1) {
        // Generate repeating entries
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

          addEntry({
            ...baseEntry,
            date: recDate,
            actualAmount: i === 0 && actualAmount ? Number(actualAmount) : undefined,
            source: 'recurring',
          });
        }
      } else {
        addEntry(baseEntry);
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

  return (
    <dialog open className="native-dialog entry-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form entry-form-modern" id="entryForm">
        <div className="dialog-heading">
          <h3>{entryToEdit ? 'Edit budget entry' : `Add ${type === 'income' ? 'Income' : 'Expense'}`}</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <label>
          Payment / Credit Mode
          <select value={creditType} onChange={(e) => setCreditType(e.target.value)}>
            <option value="">Direct (Cash / Bank account)</option>
            <option value="cib_card">💳 Paid with CIB Credit Card</option>
            <option value="hsbc_card">💳 Paid with HSBC Credit Card</option>
            <option value="cib">🏛️ CIB Credit Due (Lump sum)</option>
            <option value="hsbc">🏛️ HSBC Credit Due (Lump sum)</option>
          </select>
        </label>

        {entryToEdit?.id.startsWith('credit-settlement-') && (
          <div style={{ marginTop: '8px' }}>
            <button className="ghost-button" type="button" onClick={handleRecalculateCreditDue}>
              Recalculate from card history
            </button>
            {recalcStatus && (
              <small style={{ display: 'block', color: 'var(--muted)', marginTop: '6px' }}>
                {recalcStatus}
              </small>
            )}
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
            Account
            <input
              name="account"
              type="text"
              placeholder="cib, hsbc, cash"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />
          </label>

          <label id="typeField" className="entry-field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
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
          Actual amount (Optional)
          <input
            name="actualAmount"
            type="number"
            step="1"
            min="0"
            placeholder="0 if not paid yet"
            value={actualAmount}
            onChange={(e) => setActualAmount(e.target.value)}
          />
        </label>

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
                    onChange={(e) => setRecurringFrequency(e.target.value as any)}
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

        <div className="dialog-actions" style={{ marginTop: '18px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            {entryToEdit ? 'Update entry' : 'Save entry'}
          </button>
        </div>
      </form>
    </dialog>
  );
};
