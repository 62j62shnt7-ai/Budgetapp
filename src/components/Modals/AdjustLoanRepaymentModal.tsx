import React from 'react';
import type { CashEntry, Installment } from '../../types';
import { formatMoney } from '../../engine/dateUtils';

export type LinkedRepaymentInfo =
  | {
      type: 'single';
      target: CashEntry;
      scaledAmount: number;
      currentAmount: number;
    }
  | {
      type: 'installment';
      target: Installment;
      scaledAmount: number;
      currentAmount: number;
      months: number;
    };

interface AdjustLoanRepaymentModalProps {
  isOpen: boolean;
  inflowEntry: CashEntry | null;
  linkedInfo: LinkedRepaymentInfo | null;
  totalDrawn: number;
  plannedLoan: number;
  onKeep: () => void;
  onScale: (scaledAmount: number) => void;
}

export const AdjustLoanRepaymentModal: React.FC<AdjustLoanRepaymentModalProps> = ({
  isOpen,
  inflowEntry,
  linkedInfo,
  totalDrawn,
  plannedLoan,
  onKeep,
  onScale,
}) => {
  if (!isOpen || !inflowEntry || !linkedInfo) return null;

  const isSingle = linkedInfo.type === 'single';
  const scaleBtnText = isSingle
    ? `Scale to ${formatMoney(linkedInfo.scaledAmount)}`
    : `Scale to ${formatMoney(linkedInfo.scaledAmount)}/mo`;

  return (
    <dialog
      open
      className="native-dialog"
      id="adjustLoanRepaymentDialog"
      onClick={(e) => e.target === e.currentTarget && onKeep()}
      style={{ display: 'block', zIndex: 1100, maxWidth: '500px' }}
    >
      <div className="entry-form entry-form-modern" style={{ padding: '20px' }}>
        <div className="dialog-heading" style={{ marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>💳 Scale Linked Loan Repayment?</h3>
        </div>

        <p id="adjustLoanRepaymentMessage" style={{ fontSize: '13.5px', margin: '0 0 10px', lineHeight: '1.5' }}>
          You recorded a draw of <strong>{formatMoney(totalDrawn)}</strong> (out of{' '}
          <strong>{formatMoney(plannedLoan)}</strong> loan facility) for <em>{inflowEntry.category}</em>.
        </p>

        <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '0 0 12px', lineHeight: '1.4' }}>
          Since this is a partial draw, would you like to scale down your future scheduled repayment obligations to
          proportionally match what was actually borrowed?
        </p>

        <div
          id="adjustLoanRepaymentDetails"
          style={{
            background: 'var(--surface-soft, rgba(0,0,0,0.03))',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '13px',
            marginBottom: '18px',
          }}
        >
          {isSingle ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--muted)' }}>Current Scheduled Repayment:</span>
                <strong>{formatMoney(linkedInfo.currentAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--blue, #2563eb)' }}>
                <span>Scaled to Drawn ({formatMoney(totalDrawn)}):</span>
                <strong>{formatMoney(linkedInfo.scaledAmount)}</strong>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--muted)' }}>Current Installments:</span>
                <strong>
                  {linkedInfo.months} × {formatMoney(linkedInfo.currentAmount)}/mo (
                  {formatMoney(linkedInfo.currentAmount * linkedInfo.months)})
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--blue, #2563eb)' }}>
                <span>Scaled to Drawn ({formatMoney(totalDrawn)}):</span>
                <strong>
                  {linkedInfo.months} × {formatMoney(linkedInfo.scaledAmount)}/mo (
                  {formatMoney(linkedInfo.scaledAmount * linkedInfo.months)})
                </strong>
              </div>
            </>
          )}
        </div>

        <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="ghost-button"
            id="adjustLoanRepaymentKeepBtn"
            type="button"
            onClick={onKeep}
            style={{ padding: '8px 14px' }}
          >
            Keep Full Repayment
          </button>
          <button
            className="primary-button"
            id="adjustLoanRepaymentScaleBtn"
            type="button"
            onClick={() => onScale(linkedInfo.scaledAmount)}
            style={{
              padding: '8px 14px',
              background: 'var(--blue, #2563eb)',
              borderColor: 'var(--blue, #2563eb)',
              color: '#fff',
            }}
          >
            {scaleBtnText}
          </button>
        </div>
      </div>
    </dialog>
  );
};
