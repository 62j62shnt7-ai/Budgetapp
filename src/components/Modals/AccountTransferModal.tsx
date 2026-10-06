import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { ArrowRightLeft, AlertCircle } from 'lucide-react';

export interface AccountTransferModalProps {
  isOpen: boolean;
  initialFromAccount?: string;
  initialToAccount?: string;
  initialAmount?: number;
  reason?: string;
  onClose: () => void;
}

export const AccountTransferModal: React.FC<AccountTransferModalProps> = ({
  isOpen,
  initialFromAccount,
  initialToAccount,
  initialAmount,
  reason,
  onClose,
}) => {
  const { accounts, transferAccountFunds } = useBudgetStore();

  const accountKeys = Object.keys(accounts);

  const [fromAccount, setFromAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [prevModalKey, setPrevModalKey] = useState<string>('');
  const currentModalKey = `${isOpen}-${initialFromAccount || ''}-${initialToAccount || ''}-${initialAmount || 0}`;

  if (currentModalKey !== prevModalKey) {
    setPrevModalKey(currentModalKey);
    if (isOpen) {
      const resolvedTo = initialToAccount && accounts[initialToAccount]
        ? initialToAccount
        : accountKeys[0] || 'cib';

      let resolvedFrom = initialFromAccount && accounts[initialFromAccount] && initialFromAccount !== resolvedTo
        ? initialFromAccount
        : '';

      if (!resolvedFrom) {
        const candidates = accountKeys
          .filter((k) => k !== resolvedTo)
          .sort((a, b) => Number(accounts[b]?.balance || 0) - Number(accounts[a]?.balance || 0));
        resolvedFrom = candidates[0] || accountKeys.find((k) => k !== resolvedTo) || '';
      }

      setFromAccount(resolvedFrom);
      setToAccount(resolvedTo);
      setAmount(initialAmount && initialAmount > 0 ? String(Math.round(initialAmount)) : '');
      setErrorMsg(null);
    }
  }

  if (!isOpen) return null;

  const fromAccObj = accounts[fromAccount];
  const toAccObj = accounts[toAccount];

  const handleFromChange = (newFrom: string) => {
    setFromAccount(newFrom);
    if (toAccount === newFrom) {
      const other = accountKeys.find((k) => k !== newFrom);
      if (other) setToAccount(other);
    }
  };

  const handleToChange = (newTo: string) => {
    setToAccount(newTo);
    if (fromAccount === newTo) {
      const other = accountKeys.find((k) => k !== newTo);
      if (other) setFromAccount(other);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const numAmt = Math.round(Number(amount));

    if (!numAmt || numAmt <= 0) {
      setErrorMsg('Please enter a valid transfer amount.');
      return;
    }
    if (!fromAccount || !toAccount || fromAccount === toAccount) {
      setErrorMsg('Please select different origin and destination bank accounts.');
      return;
    }
    if (!fromAccObj || !toAccObj) {
      setErrorMsg('Selected accounts could not be found.');
      return;
    }

    const fromBalance = Number(fromAccObj.balance || 0);
    if (fromBalance < numAmt) {
      // Soft warning / confirmation if transfer exceeds source balance
      const proceed = window.confirm(
        `Source account ${fromAccObj.name} has ${formatMoney(fromBalance)}, which is less than the transfer amount of ${formatMoney(numAmt)}. Do you still want to proceed?`
      );
      if (!proceed) return;
    }

    const note = reason
      ? `Transfer ${formatMoney(numAmt)}: ${fromAccObj.name} → ${toAccObj.name} (${reason})`
      : `Transfer ${formatMoney(numAmt)} from ${fromAccObj.name} to ${toAccObj.name}`;

    const success = transferAccountFunds(fromAccount, toAccount, numAmt, note);
    if (success) {
      onClose();
    } else {
      setErrorMsg('Transfer failed. Please check inputs and try again.');
    }
  };

  return (
    <dialog
      open
      className="native-dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ display: 'block', zIndex: 1100 }}
    >
      <form onSubmit={handleSubmit} className="entry-form" style={{ maxWidth: '480px' }}>
        <div className="dialog-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRightLeft size={18} color="var(--primary, #3b82f6)" />
            <h3 style={{ margin: 0 }}>Transfer Funds Between Accounts</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {reason && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              background: 'var(--amber-soft, rgba(245, 158, 11, 0.12))',
              border: '1px solid var(--amber, #f59e0b)',
              color: 'var(--text-main)',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              margin: '0 0 14px',
            }}
          >
            <AlertCircle size={16} color="var(--amber, #f59e0b)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Funding Requirement:</strong>
              <div style={{ marginTop: '2px', color: 'var(--muted)' }}>{reason}</div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              background: 'var(--danger-soft, #fee2e2)',
              color: 'var(--danger, #dc2626)',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
          <span>From Account (Source):</span>
          <select
            className="form-input"
            value={fromAccount}
            onChange={(e) => handleFromChange(e.target.value)}
            required
          >
            {accountKeys.map((key) => {
              const acc = accounts[key];
              return (
                <option key={key} value={key} disabled={key === toAccount}>
                  {acc.name || key.toUpperCase()} (Available: {formatMoney(Number(acc.balance || 0))})
                </option>
              );
            })}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
          <span>To Account (Destination):</span>
          <select
            className="form-input"
            value={toAccount}
            onChange={(e) => handleToChange(e.target.value)}
            required
          >
            {accountKeys.map((key) => {
              const acc = accounts[key];
              return (
                <option key={key} value={key} disabled={key === fromAccount}>
                  {acc.name || key.toUpperCase()} (Current: {formatMoney(Number(acc.balance || 0))})
                </option>
              );
            })}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Transfer Amount (EGP):</span>
            {initialAmount && initialAmount > 0 && (
              <button
                type="button"
                className="ghost-button"
                style={{ fontSize: '11px', padding: '2px 6px', height: 'auto' }}
                onClick={() => setAmount(String(Math.round(initialAmount)))}
              >
                Set Shortfall ({formatMoney(Math.round(initialAmount))})
              </button>
            )}
          </div>
          <input
            type="number"
            className="form-input"
            placeholder="0"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>

        {fromAccObj && toAccObj && amount && Number(amount) > 0 && (
          <div
            style={{
              background: 'var(--surface-soft, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>{fromAccObj.name} new balance:</span>
              <strong
                style={{
                  color:
                    Number(fromAccObj.balance || 0) - Number(amount) < 0
                      ? 'var(--danger, #dc2626)'
                      : 'var(--text-main)',
                }}
              >
                {formatMoney(Number(fromAccObj.balance || 0) - Number(amount))}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{toAccObj.name} new balance:</span>
              <strong style={{ color: 'var(--green, #10b981)' }}>
                {formatMoney(Number(toAccObj.balance || 0) + Number(amount))}
              </strong>
            </div>
          </div>
        )}

        <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Transfer Funds
          </button>
        </div>
      </form>
    </dialog>
  );
};
