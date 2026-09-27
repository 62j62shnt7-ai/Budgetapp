import React, { useState, useEffect } from 'react';
import { Modal } from '../Common/Modal';

export interface AffectedRecordOption {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  badge?: string;
  badgeColor?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export type AffectedPartyOption = AffectedRecordOption;

export interface AffectedRecordsModalProps {
  isOpen: boolean;
  mode?: 'delete' | 'add' | 'sync' | 'update';
  title?: string;
  subtitle?: string;
  itemDescription?: string;
  amountFormatted?: string;
  metaBadge?: string;
  options: AffectedRecordOption[];
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary' | 'success';
  onConfirm: (selectedOptionIds: string[]) => void;
  onClose: () => void;
}

export type DeleteAffectedPartiesModalProps = AffectedRecordsModalProps;

export const AffectedRecordsModal: React.FC<AffectedRecordsModalProps> = ({
  isOpen,
  mode = 'delete',
  title,
  subtitle,
  itemDescription,
  amountFormatted,
  metaBadge,
  options,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant,
  onConfirm,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, boolean> = {};
      options.forEach((opt) => {
        initial[opt.id] = opt.required ? true : opt.defaultChecked !== false;
      });
      setSelectedIds(initial);
    }
  }, [isOpen, options]);

  if (!isOpen) return null;

  const isDelete = mode === 'delete';
  const isAdd = mode === 'add';

  const defaultTitle = isDelete
    ? 'Confirm Deletion'
    : isAdd
    ? 'Confirm Addition'
    : 'Review Affected Records';

  const defaultSubtitle = isDelete
    ? 'Select which affected records and balances should be updated upon deletion.'
    : isAdd
    ? 'Select which records and accounts should be updated with this addition.'
    : 'Review and select which linked records to synchronize.';

  const resolvedTitle = title || defaultTitle;
  const resolvedSubtitle = subtitle || defaultSubtitle;
  const resolvedVariant = confirmVariant || (isDelete ? 'danger' : isAdd ? 'success' : 'primary');

  const handleToggle = (id: string, disabled?: boolean, required?: boolean) => {
    if (disabled || required) return;
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSelectAll = () => {
    const next: Record<string, boolean> = {};
    options.forEach((opt) => {
      next[opt.id] = true;
    });
    setSelectedIds(next);
  };

  const handleDeselectAll = () => {
    const next: Record<string, boolean> = {};
    options.forEach((opt) => {
      next[opt.id] = Boolean(opt.required);
    });
    setSelectedIds(next);
  };

  const activeIds = Object.keys(selectedIds).filter((id) => selectedIds[id]);
  const allSelected = options.length > 0 && options.every((opt) => selectedIds[opt.id]);

  const handleConfirm = () => {
    onConfirm(activeIds);
    onClose();
  };

  const getHeaderIcon = () => {
    if (isDelete) return '🗑️';
    if (isAdd) return '➕';
    return '🔄';
  };

  const getAccentBg = () => {
    if (resolvedVariant === 'danger') return 'var(--color-danger-bg, rgba(244, 63, 94, 0.12))';
    if (resolvedVariant === 'success') return 'var(--color-success-bg, rgba(16, 185, 129, 0.12))';
    return 'rgba(99, 102, 241, 0.12)';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      id="affectedRecordsDialog"
      maxWidth="520px"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: getAccentBg(),
              fontSize: '16px',
              flexShrink: 0,
            }}
          >
            {getHeaderIcon()}
          </div>
          <span style={{ color: 'var(--text-main, #f8fafc)', fontWeight: 700, fontSize: '1.15rem' }}>
            {resolvedTitle}
          </span>
        </div>
      }
      subtitle={resolvedSubtitle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '4px' }}>
        {/* Item Summary Card */}
        {(itemDescription || amountFormatted || metaBadge) && (
          <div
            style={{
              background: 'var(--bg-surface-elevated, #161e31)',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ flex: 1, minWidth: '180px' }}>
              {itemDescription && (
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main, #f8fafc)', lineHeight: 1.4 }}>
                  {itemDescription}
                </div>
              )}
              {metaBadge && (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: 'var(--text-muted, #94a3b8)',
                  }}
                >
                  {metaBadge}
                </span>
              )}
            </div>

            {amountFormatted && (
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: isDelete ? 'var(--color-danger, #f43f5e)' : 'var(--color-success, #10b981)',
                  background: isDelete ? 'var(--color-danger-bg, rgba(244, 63, 94, 0.12))' : 'var(--color-success-bg, rgba(16, 185, 129, 0.12))',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  letterSpacing: '0.2px',
                }}
              >
                {amountFormatted}
              </div>
            )}
          </div>
        )}

        {/* Affected Records Header & Quick Selection */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Affected Records ({activeIds.length}/{options.length})
          </div>
          {options.length > 1 && (
            <button
              type="button"
              onClick={allSelected ? handleDeselectAll : handleSelectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--brand-primary, #6366f1)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {allSelected ? 'Clear non-required' : 'Select all'}
            </button>
          )}
        </div>

        {/* Options List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' }}>
          {options.map((opt) => {
            const isChecked = Boolean(selectedIds[opt.id]);
            const isLocked = Boolean(opt.disabled || opt.required);

            return (
              <div
                key={opt.id}
                onClick={() => handleToggle(opt.id, opt.disabled, opt.required)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: isChecked
                    ? `1.5px solid ${isDelete ? 'var(--color-danger, #f43f5e)' : 'var(--brand-primary, #6366f1)'}`
                    : '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  background: isChecked
                    ? isDelete
                      ? 'rgba(244, 63, 94, 0.06)'
                      : 'rgba(99, 102, 241, 0.06)'
                    : 'var(--bg-surface, #0f1523)',
                  cursor: isLocked ? 'default' : 'pointer',
                  opacity: opt.disabled ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
              >
                {/* Visual Checkbox */}
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    marginTop: '2px',
                    border: isChecked
                      ? `1.5px solid ${isDelete ? 'var(--color-danger, #f43f5e)' : 'var(--brand-primary, #6366f1)'}`
                      : '1.5px solid var(--text-dim, #64748b)',
                    background: isChecked
                      ? isDelete
                        ? 'var(--color-danger, #f43f5e)'
                        : 'var(--brand-primary, #6366f1)'
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isChecked && '✓'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {opt.icon && <span style={{ fontSize: '14px' }}>{opt.icon}</span>}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>
                      {opt.label}
                    </span>
                    {opt.badge && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: opt.badgeColor || 'rgba(99, 102, 241, 0.15)',
                          color: opt.badgeColor ? '#ffffff' : 'var(--brand-primary, #6366f1)',
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                    {opt.required && (
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                        (Required)
                      </span>
                    )}
                  </div>
                  {opt.sublabel && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '3px', lineHeight: '1.4' }}>
                      {opt.sublabel}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dialog Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))' }}>
          <button
            type="button"
            onClick={onClose}
            className="ghost-button"
            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              color: '#ffffff',
              background:
                resolvedVariant === 'danger'
                  ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
                  : resolvedVariant === 'success'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'var(--brand-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%))',
              boxShadow:
                resolvedVariant === 'danger'
                  ? '0 2px 10px rgba(244, 63, 94, 0.35)'
                  : resolvedVariant === 'success'
                  ? '0 2px 10px rgba(16, 185, 129, 0.35)'
                  : '0 2px 10px rgba(99, 102, 241, 0.35)',
              transition: 'transform 0.15s ease, filter 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1.0)')}
          >
            {confirmLabel ||
              (isDelete
                ? activeIds.length > 1
                  ? `Confirm & Delete (${activeIds.length} records)`
                  : 'Confirm Deletion'
                : isAdd
                ? 'Confirm & Save'
                : 'Apply Changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
