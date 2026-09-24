import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils } from '../../engine/dateUtils';
import { calculateCreditSettlementDate, getCreditCycleHint } from '../../engine/creditCards';
import { X, Check } from 'lucide-react';
import type { EntryType } from '../../types';

interface EntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EntryDialog: React.FC<EntryDialogProps> = ({ isOpen, onClose }) => {
  const { addEntry } = useBudgetStore();

  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(DateUtils.todayString());
  const [category, setCategory] = useState<string>('Home');
  const [subcategory, setSubcategory] = useState<string>('');
  const [account, setAccount] = useState<string>('cash');
  const [tag, setTag] = useState<string>('');
  const [note, setNote] = useState<string>('');

  if (!isOpen) return null;

  const isCredit = account.toLowerCase().includes('cib') || account.toLowerCase().includes('hsbc');
  const settlementDate = isCredit ? calculateCreditSettlementDate(date, account) : undefined;
  const cycleHint = isCredit ? getCreditCycleHint(date, account) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) return;

    addEntry({
      type,
      amount: numAmt,
      date,
      category: category.trim() || 'General',
      subcategory: subcategory.trim() || undefined,
      account,
      tag: tag.trim() || undefined,
      note: note.trim() || undefined,
      creditType: isCredit ? account : undefined,
      settlementDate,
    });

    // Reset and close
    setAmount('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            New Transaction
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Type Switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-surface-elevated)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
              <button
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  background: type === 'expense' ? 'var(--color-danger)' : 'transparent',
                  color: type === 'expense' ? '#fff' : 'var(--text-muted)',
                }}
                onClick={() => setType('expense')}
              >
                Expense
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  background: type === 'income' ? 'var(--color-success)' : 'transparent',
                  color: type === 'income' ? '#fff' : 'var(--text-muted)',
                }}
                onClick={() => setType('income')}
              >
                Income
              </button>
            </div>

            {/* Amount */}
            <div className="form-group">
              <label className="form-label">Amount (EGP)</label>
              <input
                type="number"
                step="any"
                required
                className="form-input"
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            {/* Date & Account */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Account / Card</label>
                <select
                  className="form-select"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="cib">CIB (Credit Card)</option>
                  <option value="hsbc">HSBC (Credit Card)</option>
                </select>
              </div>
            </div>

            {/* Credit Cycle Callout */}
            {isCredit && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  fontSize: '0.8rem',
                  color: '#818cf8',
                }}
              >
                <div>{cycleHint}</div>
                <div style={{ marginTop: '0.2rem', fontWeight: 600 }}>
                  Settlement Due: {DateUtils.formatDisplayDate(settlementDate)}
                </div>
              </div>
            )}

            {/* Category & Subcategory */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  className="form-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Home, Bills, Food"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subcategory</label>
                <input
                  type="text"
                  className="form-input"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="e.g. Groceries, Gym"
                />
              </div>
            </div>

            {/* Tag & Note */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Tag (#hashtag)</label>
                <input
                  type="text"
                  className="form-input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="e.g. Fixed, Variable, Work"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Note</label>
                <input
                  type="text"
                  className="form-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reference or note"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={16} />
              <span>Save Entry</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
