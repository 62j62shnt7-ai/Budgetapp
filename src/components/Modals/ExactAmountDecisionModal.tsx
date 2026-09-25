import React from 'react';
import type { CashEntry } from '../../types';
import { formatMoney } from '../../engine/dateUtils';
import { Modal } from '../Common/Modal';

interface ExactAmountDecisionModalProps {
  isOpen: boolean;
  entry: CashEntry | null;
  actualAmount: number;
  plannedAmount: number;
  onKeep: () => void;
  onFinish: () => void;
}

export const ExactAmountDecisionModal: React.FC<ExactAmountDecisionModalProps> = ({
  isOpen,
  entry,
  actualAmount,
  plannedAmount,
  onKeep,
  onFinish,
}) => {
  if (!isOpen || !entry) return null;

  const isIncome = entry.type === 'income';
  const isLoan =
    Boolean(entry.loanId) ||
    (entry.source || '').toLowerCase().includes('loan') ||
    (entry.category || '').toLowerCase().includes('loan');
  const itemName = entry.category || (isIncome ? 'Income' : 'Expense');
  const verb = isLoan ? 'drawn' : isIncome ? 'received' : 'spent';

  const title = isLoan
    ? '💳 Full Loan Facility Drawn'
    : isIncome
    ? '💰 Full Income Received'
    : '✓ Full Budget Reached';

  const subtitle = isLoan
    ? 'Choose whether to finish and close this loan facility, or keep it open in your Cash Flow to log further draws.'
    : isIncome
    ? 'Choose whether to finish and complete this income (move to History), or keep it ongoing in Cash Flow.'
    : 'Choose whether to finish and complete this expense budget (move to History), or keep it ongoing in Cash Flow to log more spends.';

  const keepBtnText = isLoan ? 'Keep Loan Open' : 'Keep Ongoing in Cash Flow';
  const finishBtnText = isLoan ? 'Finish & Close Facility' : 'Finish & Fulfill';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onKeep}
      id="exactAmountDecisionDialog"
      maxWidth="480px"
      title={<span id="exactAmountDecisionTitle">{title}</span>}
      subtitle={subtitle}
    >
      <div className="entry-form entry-form-modern" style={{ padding: '4px 0 0' }}>

        <p id="exactAmountDecisionMessage" style={{ fontSize: '13.5px', margin: '0 0 8px', lineHeight: '1.5' }}>
          You recorded {verb} of <strong>{formatMoney(actualAmount)}</strong> (100% of planned{' '}
          <strong>{formatMoney(plannedAmount)}</strong>) for <em>{itemName}</em>.
        </p>

        <p
          id="exactAmountDecisionSubtitle"
          style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '0 0 14px', lineHeight: '1.4' }}
        >
          {subtitle}
        </p>

        <div
          id="exactAmountDecisionDetails"
          style={{
            background: 'var(--surface-soft, rgba(0,0,0,0.03))',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '13px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: 'var(--muted)' }}>Planned Amount:</span>
            <strong>{formatMoney(plannedAmount)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)' }}>
            <span>Total {isLoan ? 'Drawn' : isIncome ? 'Received' : 'Spent'}:</span>
            <strong>{formatMoney(actualAmount)}</strong>
          </div>
        </div>

        <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="ghost-button"
            id="exactAmountKeepBtn"
            type="button"
            onClick={onKeep}
            style={{ padding: '8px 14px' }}
          >
            {keepBtnText}
          </button>
          <button
            className="primary-button"
            id="exactAmountFinishBtn"
            type="button"
            onClick={onFinish}
            style={{
              padding: '8px 14px',
              background: 'var(--green, #16a34a)',
              borderColor: 'var(--green, #16a34a)',
              color: '#fff',
            }}
          >
            {finishBtnText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
