import React from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Installment } from '../../types';
import { formatMoney } from '../../engine/dateUtils';

interface InstallmentsSectionProps {
  installmentsOpen: boolean;
  setInstallmentsOpen: (open: boolean) => void;
  installments: Installment[];
  installmentMonthlyTotal: number;
  installmentOutstandingTotal: number;
  installmentProgressSummary: { paid: number; total: number; remaining: number };
  onOpenInstallmentModal: () => void;
  getInstallmentProgress: (inst: Installment) => { paid: number; total: number; remaining: number };
  onDeleteInstallment: (id: string) => void;
}

export const InstallmentsSection: React.FC<InstallmentsSectionProps> = ({
  installmentsOpen,
  setInstallmentsOpen,
  installments,
  installmentMonthlyTotal,
  installmentOutstandingTotal,
  installmentProgressSummary,
  onOpenInstallmentModal,
  getInstallmentProgress,
  onDeleteInstallment,
}) => {
  return (
    <section className="panel collapsible-panel cashflow-collapsible-panel">
      <div
        className="panel-heading"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setInstallmentsOpen(!installmentsOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={installmentsOpen}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setInstallmentsOpen(!installmentsOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0 }}>Installments</h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>({installments.length})</span>
          {!installmentsOpen && installments.length > 0 && (
            <span className="collapsed-installment-summary" style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              <strong>{formatMoney(installmentMonthlyTotal)}/mo</strong>
              <span style={{ margin: '0 6px' }}>· Total: {formatMoney(installmentOutstandingTotal)}</span>
              <span>
                {installmentProgressSummary.paid > 0
                  ? `(${installmentProgressSummary.paid}/${installmentProgressSummary.total} paid)`
                  : `(${installmentProgressSummary.total} scheduled)`}
              </span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            className="ghost-button"
            type="button"
            style={{ fontSize: '12px', padding: '3px 8px' }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenInstallmentModal();
            }}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            <span>Installment</span>
          </button>
          <button className="ghost-button icon-button collapse-toggle-btn" type="button" aria-label={installmentsOpen ? 'Collapse' : 'Expand'}>
            {installmentsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {installmentsOpen && (
        <div className="collapsible-content" style={{ marginTop: '12px' }}>
          {installments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
              No installments recorded.
            </div>
          ) : (
            installments.map((inst) => {
              const progress = getInstallmentProgress(inst);
              return (
                <div
                  key={inst.id}
                  className="installment-summary-card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-soft)',
                    border: '1px solid var(--line)',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <strong>{inst.name}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                      {formatMoney(inst.amount)}/mo · Total: {formatMoney((Number(inst.amount) || 0) * progress.total)}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>
                      {progress.paid > 0 ? `Paid ${progress.paid} of ${progress.total}` : `${progress.total} scheduled`}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: progress.remaining === 0 ? 'var(--green)' : 'var(--blue, #2563eb)',
                        marginTop: '4px',
                      }}
                    >
                      {progress.remaining === 0
                        ? '✓ Completed · Remaining: 0'
                        : `${progress.remaining} remaining · ${formatMoney((Number(inst.amount) || 0) * progress.remaining)} outstanding`}
                    </span>
                  </div>
                  <button
                    className="ghost-button icon-button"
                    style={{ padding: '6px' }}
                    type="button"
                    aria-label={`Delete installment ${inst.name}`}
                    onClick={() => onDeleteInstallment(inst.id)}
                  >
                    <Trash2 size={14} color="var(--red)" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
