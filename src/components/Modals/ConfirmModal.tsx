import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onCancel()} style={{ display: 'block', zIndex: 1000 }}>
      <div className="dialog-heading">
        <h3>{title}</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onCancel}>
          x
        </button>
      </div>

      <p style={{ margin: '16px 0', color: 'var(--muted)', fontSize: '14px', lineHeight: '1.5' }}>
        {message}
      </p>

      <div className="dialog-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`primary-button ${isDanger ? 'danger-button' : ''}`}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
};
