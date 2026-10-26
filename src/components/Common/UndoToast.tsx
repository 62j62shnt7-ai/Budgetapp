import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { RotateCcw, X, CheckCircle2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { Modal } from './Modal';

export type AppNoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface AppNoticePayload {
  id: string;
  message: string;
  tone: AppNoticeTone;
}

export interface AppConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
}

interface PendingConfirmState extends AppConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

const APP_NOTICE_EVENT = 'budget-app-notice';
const APP_CONFIRM_EVENT = 'budget-app-confirm';

export function showAppNotice(message: string, tone: AppNoticeTone = 'info'): void {
  if (typeof window === 'undefined') return;
  const payload: AppNoticePayload = {
    id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    message,
    tone,
  };
  window.dispatchEvent(new CustomEvent<AppNoticePayload>(APP_NOTICE_EVENT, { detail: payload }));
}

export function requestAppConfirm(options: AppConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<PendingConfirmState>(APP_CONFIRM_EVENT, {
        detail: { ...options, resolve },
      })
    );
  });
}

export const UndoToast: React.FC = () => {
  const { undoToast, undo, undoStack, dismissUndoToast } = useBudgetStore(
    useShallow((state) => ({
      undoToast: state.undoToast,
      undo: state.undo,
      undoStack: state.undoStack,
      dismissUndoToast: state.dismissUndoToast,
    }))
  );

  const [notice, setNotice] = useState<AppNoticePayload | null>(null);
  const [confirmState, setConfirmState] = useState<PendingConfirmState | null>(null);

  useEffect(() => {
    const onNotice = (e: Event) => {
      const custom = e as CustomEvent<AppNoticePayload>;
      if (custom.detail) {
        setNotice(custom.detail);
      }
    };
    const onConfirm = (e: Event) => {
      const custom = e as CustomEvent<PendingConfirmState>;
      if (custom.detail) {
        setConfirmState((prev) => {
          if (prev) prev.resolve(false);
          return custom.detail;
        });
      }
    };
    window.addEventListener(APP_NOTICE_EVENT, onNotice);
    window.addEventListener(APP_CONFIRM_EVENT, onConfirm);
    return () => {
      window.removeEventListener(APP_NOTICE_EVENT, onNotice);
      window.removeEventListener(APP_CONFIRM_EVENT, onConfirm);
    };
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => {
      dismissUndoToast();
    }, 6000);
    return () => clearTimeout(timer);
  }, [undoToast, dismissUndoToast]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleConfirmResolution = (accepted: boolean) => {
    if (!confirmState) return;
    const { resolve } = confirmState;
    setConfirmState(null);
    resolve(accepted);
  };

  const renderNoticeIcon = (tone: AppNoticeTone) => {
    switch (tone) {
      case 'success':
        return <CheckCircle2 size={15} style={{ color: 'var(--green, #10b981)', flexShrink: 0 }} />;
      case 'warning':
        return <AlertTriangle size={15} style={{ color: 'var(--amber, #f59e0b)', flexShrink: 0 }} />;
      case 'danger':
        return <AlertOctagon size={15} style={{ color: 'var(--red, #f43f5e)', flexShrink: 0 }} />;
      default:
        return <Info size={15} style={{ color: 'var(--kpi-cyan, #38bdf8)', flexShrink: 0 }} />;
    }
  };

  return (
    <>
      {(undoToast || notice) && (
        <div className="undo-toast-container" role="status" aria-live="polite">
          {notice && (
            <div className={`undo-toast app-notice-toast tone-${notice.tone}`}>
              <div className="undo-toast-content">
                {renderNoticeIcon(notice.tone)}
                <span className="undo-toast-message app-notice-message">
                  {notice.message}
                </span>
              </div>
              <div className="undo-toast-actions">
                <button
                  type="button"
                  className="undo-toast-close"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {undoToast && (
            <div className="undo-toast">
              <div className="undo-toast-content">
                <span className="undo-toast-dot" />
                <span className="undo-toast-message">
                  {undoToast.label}
                </span>
                {undoStack.length > 0 && (
                  <span className="undo-toast-count" title={`${undoStack.length} actions in history`}>
                    {undoStack.length}
                  </span>
                )}
              </div>
              <div className="undo-toast-actions">
                <button
                  type="button"
                  className="undo-toast-btn"
                  onClick={() => {
                    undo();
                    dismissUndoToast();
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  className="undo-toast-close"
                  onClick={dismissUndoToast}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(confirmState)}
        onClose={() => handleConfirmResolution(false)}
        title={confirmState?.title || 'Confirm Action'}
        maxWidth="440px"
        className="confirm-action-dialog"
      >
        {confirmState && (
          <div className="confirm-dialog-body">
            <p className="confirm-dialog-message">{confirmState.message}</p>
            <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleConfirmResolution(false)}
              >
                {confirmState.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className={`primary-button ${confirmState.tone === 'danger' ? 'btn-confirm-danger' : confirmState.tone === 'warning' ? 'btn-confirm-warning' : ''}`}
                onClick={() => handleConfirmResolution(true)}
              >
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
