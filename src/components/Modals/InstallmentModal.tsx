import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils } from '../../engine/dateUtils';

interface InstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallmentModal: React.FC<InstallmentModalProps> = ({ isOpen, onClose }) => {
  const { addInstallment } = useBudgetStore();

  const [name, setName] = useState<string>('');
  const [tag, setTag] = useState<string>('Installment');
  const [amount, setAmount] = useState<string>('');
  const [frequency, setFrequency] = useState<number>(1);
  const [day, setDay] = useState<number>(30);
  const [startMonth, setStartMonth] = useState<string>(DateUtils.currentYearMonth());
  const [months, setMonths] = useState<number>(12);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim() || !amt || amt <= 0) return;

    addInstallment({
      name: name.trim(),
      tag: tag.trim() || 'Installment',
      amount: amt,
      frequency,
      totalMonths: months,
      remainingMonths: months,
      startMonth,
    });

    setName('');
    setTag('Installment');
    setAmount('');
    setMonths(12);
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="installmentForm">
        <div className="dialog-heading">
          <h3>Add installment</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <label>
          Name
          <input
            name="name"
            type="text"
            required
            placeholder="Car, School, Phone, Gym, Loan..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Subcategory / Tag
          <input
            name="tag"
            type="text"
            list="subcatSuggestions"
            placeholder="e.g. Installment, Loan, Kids (optional)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </label>
        <label>
          Amount per payment (EGP)
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Frequency
            <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>
              <option value="1">Monthly</option>
              <option value="2">Every 2 months</option>
              <option value="3">Quarterly (every 3 months)</option>
              <option value="6">Semi-annually (every 6 months)</option>
              <option value="12">Annually</option>
            </select>
          </label>
          <label>
            Payment day
            <input
              name="day"
              type="number"
              min="1"
              max="31"
              required
              value={day}
              onChange={(e) => setDay(Number(e.target.value) || 30)}
            />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Start month
            <input
              name="startMonth"
              type="month"
              required
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </label>
          <label>
            Number of payments
            <input
              name="months"
              type="number"
              min="1"
              max="120"
              required
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 12)}
            />
          </label>
        </div>
        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save installment
          </button>
        </div>
      </form>
    </dialog>
  );
};
