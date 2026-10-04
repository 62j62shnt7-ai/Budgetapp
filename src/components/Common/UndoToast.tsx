import React, { useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { RotateCcw, X } from 'lucide-react';

export const UndoToast: React.FC = () => {
  const { undoToast, undo, undoStack, dismissUndoToast } = useBudgetStore();

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => {
      dismissUndoToast();
    }, 6000);
    return () => clearTimeout(timer);
  }, [undoToast, dismissUndoToast]);

  if (!undoToast) return null;

  return (
    <div className="undo-toast-container" role="status" aria-live="polite">
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
    </div>
  );
};
