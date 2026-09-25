import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  id?: string;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = '520px',
  className = '',
  id,
  showCloseButton = true,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Light-dismiss backdrop click fallback for browsers without closedby support
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isInsideContent =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;

    if (!isInsideContent) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className={`native-dialog modern-top-layer-dialog ${className}`}
      style={{ maxWidth }}
      {...{ closedby: 'any' }}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-shell">
        {(title || showCloseButton) && (
          <div className="dialog-heading">
            {typeof title === 'string' ? <h3 style={{ margin: 0 }}>{title}</h3> : title}
            {showCloseButton && (
              <button
                className="icon-button close-dialog-btn"
                type="button"
                aria-label="Close"
                onClick={onClose}
              >
                ✕
              </button>
            )}
          </div>
        )}
        {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
        <div className="dialog-body-content">{children}</div>
      </div>
    </dialog>
  );
};
