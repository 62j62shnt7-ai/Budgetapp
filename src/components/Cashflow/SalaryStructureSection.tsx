import React from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { SalaryPayment } from '../../types';
import { formatMoney } from '../../engine/dateUtils';
import { groupPhaseForMonthIndex } from '../../engine/salaryAndInstallments';

interface SalaryStructureSectionProps {
  salaryOpen: boolean;
  setSalaryOpen: (open: boolean) => void;
  salaryQuarterTotal: number;
  startMonth: string;
  setStartMonth: (val: string) => void;
  quarters: number;
  setQuarters: (val: number) => void;
  salaryPattern: SalaryPayment[];
  onAddPayment: () => void;
  onPopulate: () => void;
  onClearPeriod: () => void;
  onClearAll: () => void;
  onUpdatePayment: (idx: number, field: keyof SalaryPayment, value: number) => void;
  onRemovePayment: (idx: number) => void;
}

export const SalaryStructureSection: React.FC<SalaryStructureSectionProps> = ({
  salaryOpen,
  setSalaryOpen,
  salaryQuarterTotal,
  startMonth,
  setStartMonth,
  quarters,
  setQuarters,
  salaryPattern,
  onAddPayment,
  onPopulate,
  onClearPeriod,
  onClearAll,
  onUpdatePayment,
  onRemovePayment,
}) => {
  return (
    <section className="panel collapsible-panel cashflow-collapsible-panel" style={{ marginTop: '18px' }}>
      <div
        className="panel-heading"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setSalaryOpen(!salaryOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={salaryOpen}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSalaryOpen(!salaryOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Salary structure</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Quarter total: <strong style={{ color: 'var(--green)' }}>{formatMoney(salaryQuarterTotal)}</strong>
          </span>
        </div>
        <button className="ghost-button icon-button" type="button" aria-label={salaryOpen ? 'Collapse' : 'Expand'}>
          {salaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {salaryOpen && (
        <div className="collapsible-content" style={{ marginTop: '12px' }}>
          <div
            className="salary-structure-controls"
            style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px' }}>
              Start month:
              <input
                type="month"
                className="form-input salary-start-month"
                style={{ marginLeft: '6px', padding: '4px 8px' }}
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px' }}>
              Quarters:
              <input
                type="number"
                min="1"
                max="24"
                className="form-input"
                style={{ width: '70px', marginLeft: '6px', padding: '4px 8px' }}
                value={quarters}
                onChange={(e) => setQuarters(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
              />
            </label>
            <button className="ghost-button" type="button" onClick={onAddPayment}>
              <Plus size={15} style={{ marginRight: '4px' }} /> Add payment
            </button>
            <button className="primary-button salary-populate-button" type="button" onClick={onPopulate}>
              Populate forecast
            </button>
            <button className="ghost-button salary-clear-button" type="button" onClick={onClearPeriod}>
              Clear period
            </button>
            <button className="ghost-button salary-clear-all-button" type="button" onClick={onClearAll}>
              Clear all
            </button>
          </div>

          <div className="salary-structure-grid">
            {salaryPattern.map((p, idx) => (
              <div
                key={idx}
                className="salary-structure-card"
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--line)',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px' }}>Payment #{idx + 1}</strong>
                  <button
                    className="ghost-button"
                    style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--red)' }}
                    type="button"
                    onClick={() => onRemovePayment(idx)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  <label style={{ fontSize: '12px' }}>
                    Month offset
                    <select
                      className="form-select"
                      style={{ marginTop: '2px', padding: '4px 8px', fontSize: '12px' }}
                      value={p.monthOffset}
                      onChange={(e) => onUpdatePayment(idx, 'monthOffset', Number(e.target.value))}
                    >
                      <option value={0}>Month 1 ({groupPhaseForMonthIndex(0)})</option>
                      <option value={1}>Month 2 ({groupPhaseForMonthIndex(1)})</option>
                      <option value={2}>Month 3 ({groupPhaseForMonthIndex(2)})</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '12px' }}>
                    Day of month
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="form-input"
                      style={{ marginTop: '2px', padding: '4px 8px', fontSize: '12px' }}
                      value={p.day}
                      onChange={(e) => onUpdatePayment(idx, 'day', Number(e.target.value))}
                    />
                  </label>
                  <label style={{ fontSize: '12px' }}>
                    Amount (EGP)
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className="form-input"
                      style={{ marginTop: '2px', padding: '4px 8px', fontSize: '12px' }}
                      value={p.amount}
                      onChange={(e) => onUpdatePayment(idx, 'amount', Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
