import React, { useEffect, useRef } from 'react';
import { 
  MinusCircle, 
  PlusCircle, 
  ArrowLeftRight, 
  CreditCard, 
  X 
} from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExpense: () => void;
  onOpenIncome: () => void;
  onOpenTransfer: () => void;
  onOpenLoan: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onOpenExpense,
  onOpenIncome,
  onOpenTransfer,
  onOpenLoan,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();

    return () => {
      previousActiveRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const actionItems = [
    {
      id: 'expense',
      label: 'Add Expense',
      description: 'Record an expense, card purchase, or bill',
      icon: <MinusCircle size={22} color="var(--red, #ef4444)" />,
      badgeColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      onClick: () => {
        onClose();
        onOpenExpense();
      },
    },
    {
      id: 'income',
      label: 'Add Income',
      description: 'Record salary, client revenue, or cash inflow',
      icon: <PlusCircle size={22} color="var(--green, #10b981)" />,
      badgeColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
      onClick: () => {
        onClose();
        onOpenIncome();
      },
    },
    {
      id: 'transfer',
      label: 'Transfer Funds',
      description: 'Move money between your liquid bank accounts',
      icon: <ArrowLeftRight size={22} color="var(--blue, #3b82f6)" />,
      badgeColor: 'rgba(59, 130, 246, 0.12)',
      borderColor: 'rgba(59, 130, 246, 0.3)',
      onClick: () => {
        onClose();
        onOpenTransfer();
      },
    },
    {
      id: 'loan',
      label: 'Bridge Deficit / Loan',
      description: 'Borrow funds or inject liquidity into cashflow',
      icon: <CreditCard size={22} color="var(--teal, #14b8a6)" />,
      badgeColor: 'rgba(20, 184, 166, 0.12)',
      borderColor: 'rgba(20, 184, 166, 0.3)',
      onClick: () => {
        onClose();
        onOpenLoan();
      },
    },
  ];

  return (
    <div className="mobile-action-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="mobile-action-sheet quick-add-sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickAddTitle"
      >
        <div className="action-sheet-header">
          <div className="action-sheet-drag-handle" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Create
              </span>
              <h3 id="quickAddTitle" style={{ margin: '2px 0 0', fontSize: '17px', fontWeight: 800 }}>
                New Transaction
              </h3>
            </div>
            <button
              className="ghost-button icon-button"
              type="button"
              onClick={onClose}
              aria-label="Close quick add menu"
              style={{ width: '36px', height: '36px', minHeight: '36px', padding: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="quick-add-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {actionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="action-sheet-btn quick-add-item-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '14px',
                background: item.badgeColor,
                border: `1px solid ${item.borderColor}`,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                minHeight: '60px',
                touchAction: 'manipulation',
              }}
              onClick={item.onClick}
            >
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)' }}>
                  {item.label}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.3 }}>
                  {item.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
