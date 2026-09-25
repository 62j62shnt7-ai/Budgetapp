import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils } from '../../engine/dateUtils';

interface LoanBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoanBridgeModal: React.FC<LoanBridgeModalProps> = ({ isOpen, onClose }) => {
  const { addEntry, addInstallment } = useBudgetStore();

  const [name, setName] = useState<string>('Bridge Loan');
  const [amount, setAmount] = useState<string>('');
  const [disbursementDate, setDisbursementDate] = useState<string>(DateUtils.todayString());
  const [account, setAccount] = useState<string>('cib');
  const [repaymentType, setRepaymentType] = useState<'single' | 'installments'>('single');

  // Single repayment fields
  const [dueDate, setDueDate] = useState<string>(DateUtils.formatDateObj(new Date(Date.now() + 30 * 86400000)));
  const [repaymentAmount, setRepaymentAmount] = useState<string>('');

  // Installment repayment fields
  const [installmentMonths, setInstallmentMonths] = useState<number>(6);
  const [installmentStartMonth, setInstallmentStartMonth] = useState<string>(DateUtils.addMonths(DateUtils.currentYearMonth(), 1));
  const [installmentAmount, setInstallmentAmount] = useState<string>('');
  const [installmentDay, setInstallmentDay] = useState<number>(15);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loanAmt = Number(amount);
    if (!loanAmt || loanAmt <= 0) return;
    const loanId = `loan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 1. Add disbursement income entry
    addEntry({
      date: disbursementDate,
      category: `Loan Inflow: ${name.trim() || 'Bridge Loan'}`,
      subcategory: 'Loan',
      tag: 'Loan',
      account,
      type: 'income',
      amount: loanAmt,
      currency: 'EGP',
      source: 'bridge loan',
      loanId,
      initialAmount: loanAmt,
    });

    // 2. Schedule repayment
    if (repaymentType === 'single') {
      const repAmt = Number(repaymentAmount) || loanAmt;
      addEntry({
        date: dueDate,
        category: `Loan Repayment: ${name.trim() || 'Bridge Loan'}`,
        subcategory: 'Loan Repayment',
        tag: 'Loan Repayment',
        account,
        type: 'expense',
        amount: repAmt,
        currency: 'EGP',
        source: 'loan repayment',
        loanId,
        initialAmount: repAmt,
      });
    } else {
      const perMonth = Number(installmentAmount) || Math.round(loanAmt / installmentMonths);
      addInstallment({
        name: `${name} Repayment`,
        tag: 'Loan Repayment',
        amount: perMonth,
        frequency: 1,
        totalMonths: installmentMonths,
        remainingMonths: installmentMonths,
        startMonth: installmentStartMonth,
        account,
        loanId,
        initialAmount: perMonth,
      });
    }

    onClose();
  };

  return (
    <dialog open className="native-dialog loan-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form entry-form-modern" id="loanBridgeForm">
        <div className="dialog-heading">
          <h3>💳 Bridge Deficit with Loan</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <p style={{ margin: '-4px 0 14px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.4' }}>
          Receive cash on the deficit start date to cover the shortfall, and schedule the repayment due date.
        </p>

        <label>
          Loan name / label
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Personal Bridge Loan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="inline-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Loan amount (EGP)
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (!repaymentAmount) setRepaymentAmount(e.target.value);
                if (!installmentAmount && installmentMonths > 0) {
                  setInstallmentAmount(String(Math.round(Number(e.target.value) / installmentMonths)));
                }
              }}
            />
          </label>

          <label>
            Disbursement date
            <input
              name="disbursementDate"
              type="date"
              required
              value={disbursementDate}
              onChange={(e) => setDisbursementDate(e.target.value)}
            />
          </label>
        </div>

        <label>
          Deposit into account
          <select value={account} onChange={(e) => setAccount(e.target.value)} required>
            <option value="cib">CIB</option>
            <option value="hsbc">HSBC</option>
          </select>
        </label>

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed var(--line)' }}>
          <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>
            Repayment Structure
          </span>
          <div className="repayment-type-selector" style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <label
              className="radio-pill-label"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                background: repaymentType === 'single' ? 'var(--surface-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="repaymentType"
                value="single"
                checked={repaymentType === 'single'}
                onChange={() => setRepaymentType('single')}
                style={{ width: 'auto', margin: 0 }}
              />
              Single Due Date
            </label>
            <label
              className="radio-pill-label"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                background: repaymentType === 'installments' ? 'var(--surface-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="repaymentType"
                value="installments"
                checked={repaymentType === 'installments'}
                onChange={() => setRepaymentType('installments')}
                style={{ width: 'auto', margin: 0 }}
              />
              Monthly Installments
            </label>
          </div>

          {repaymentType === 'single' ? (
            <div className="inline-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                Repayment due date
                <input
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Repayment amount (EGP)
                <input
                  name="repaymentAmount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Principal + interest"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  required
                />
              </label>
            </div>
          ) : (
            <div>
              <div className="inline-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Number of months
                  <input
                    name="installmentMonths"
                    type="number"
                    min="1"
                    max="120"
                    value={installmentMonths}
                    onChange={(e) => {
                      const m = Number(e.target.value) || 6;
                      setInstallmentMonths(m);
                      if (amount) {
                        setInstallmentAmount(String(Math.round(Number(amount) / m)));
                      }
                    }}
                    required
                  />
                </label>
                <label>
                  Start month
                  <input
                    name="installmentStartMonth"
                    type="month"
                    value={installmentStartMonth}
                    onChange={(e) => setInstallmentStartMonth(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="inline-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                <label>
                  Monthly payment (EGP)
                  <input
                    name="installmentAmount"
                    type="number"
                    min="1"
                    step="1"
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Payment day of month
                  <input
                    name="installmentDay"
                    type="number"
                    min="1"
                    max="31"
                    value={installmentDay}
                    onChange={(e) => setInstallmentDay(Number(e.target.value) || 15)}
                    required
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-actions" style={{ marginTop: '18px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Bridge Deficit
          </button>
        </div>
      </form>
    </dialog>
  );
};
