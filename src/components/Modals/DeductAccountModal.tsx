import React, { useState, useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import type { CashEntry } from '../../types';

interface DeductAccountModalProps {
  isOpen: boolean;
  entry: CashEntry | null;
  actualAmount: number;
  onClose: () => void;
}

export const DeductAccountModal: React.FC<DeductAccountModalProps> = ({
  isOpen,
  entry,
  actualAmount,
  onClose,
}) => {
  const { accounts, updateAccountBalance, updateEntry } = useBudgetStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('cib');
  const [tag, setTag] = useState('');

  useEffect(() => {
    if (entry) {
      setSelectedAccountId(entry.account || 'cib');
      setTag(entry.tag || '');
    }
  }, [entry, isOpen]);

  if (!isOpen || !entry) return null;

  const isIncome = entry.type === 'income';

  const handleConfirm = () => {
    const acc = accounts[selectedAccountId];
    if (acc) {
      if (tag.trim() && tag.trim() !== entry.tag) {
        updateEntry(entry.id, { tag: tag.trim() });
      }
      const currentBal = acc.balance || 0;
      const newBal = isIncome ? currentBal + actualAmount : currentBal - actualAmount;
      updateAccountBalance(selectedAccountId, newBal);
    }
    onClose();
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <div className="dialog-heading">
        <h3>Adjust Account Balance?</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
      </div>

      <p style={{ margin: '12px 0', fontSize: '14px', lineHeight: '1.5' }}>
        {isIncome
          ? `Deposit ${formatMoney(actualAmount)} from "${entry.category}" into your account balance?`
          : `Deduct ${formatMoney(actualAmount)} for "${entry.category}" from your account balance?`}
      </p>

      <label>
        <span>Select account</span>
        <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
          {Object.entries(accounts).map(([id, a]) => (
            <option key={id} value={id}>
              {a.name} (Current: {formatMoney(a.balance)})
            </option>
          ))}
        </select>
      </label>
      <label style={{ marginTop: '10px' }}>
        <span>Subcategory / Tag <small style={{ color: 'var(--muted)', fontSize: '12px' }}>(Optional)</small></span>
        <input
          type="text"
          list="subcatSuggestions"
          placeholder="e.g. Food, Bills, Utilities"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </label>

      <div className="dialog-actions" style={{ marginTop: '18px' }}>
        <button className="ghost-button" type="button" onClick={onClose}>
          Don't {isIncome ? 'deposit' : 'deduct'}
        </button>
        <button className="primary-button" type="button" onClick={handleConfirm}>
          {isIncome ? 'Deposit & Save' : 'Deduct & Save'}
        </button>
      </div>
    </dialog>
  );
};
