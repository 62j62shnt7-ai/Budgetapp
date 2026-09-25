import React from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { SalaryPayment } from '../../types';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { groupPhaseForMonthIndex, monthIndexFromYearMonth } from '../../engine/salaryAndInstallments';

interface SalaryStructureSectionProps {
  salaryOpen: boolean;
  setSalaryOpen: (open: boolean) => void;
  salaryQuarterTotal: number;
  salaryAnchorMonth?: string;
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
  salaryAnchorMonth,
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
  const salaryGroupMonths = (offset: number) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const anchorIndex = monthIndexFromYearMonth(salaryAnchorMonth || DateUtils.currentYearMonth());
    let firstMatch = anchorIndex;
    while (groupPhaseForMonthIndex(firstMatch, salaryAnchorMonth) !== offset) firstMatch += 1;
    return [0, 1, 2, 3]
      .map((quarter) => monthNames[((firstMatch + quarter * 3) % 12 + 12) % 12])
      .join(', ');
  };
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0 }}>Salary structure</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Quarter total: <strong style={{ color: 'var(--green)' }}>{formatMoney(salaryQuarterTotal)}</strong>
          </span>
        </div>
        <button className="ghost-button icon-button collapse-toggle-btn" type="button" aria-label={salaryOpen ? 'Collapse' : 'Expand'}>
          {salaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {salaryOpen && (
        <div className="collapsible-content" style={{ marginTop: '12px' }}>
          <div className="salary-structure-controls">
            <div className="salary-controls-inputs">
              <label className="salary-control-field">
                <span className="field-label-text">Start month</span>
                <input
                  type="month"
                  className="form-input salary-start-month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </label>
              <label className="salary-control-field">
                <span className="field-label-text">Quarters</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  className="form-input salary-quarters-input"
                  value={quarters}
                  onChange={(e) => setQuarters(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
            </div>
            <div className="salary-controls-actions">
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
          </div>

          <div className="salary-structure-grid">
            {salaryPattern.map((p, idx) => (
              <div
                key={idx}
                className="salary-structure-card"
              >
                <div className="salary-card-header">
                  <div>
                    <strong className="salary-card-title">
                      Payment #{idx + 1} · {salaryGroupMonths(Number(p.monthOffset) || 0)}
                    </strong>
                    <span className="salary-card-subtitle">
                      Repeats every 3 months ({salaryGroupMonths(Number(p.monthOffset) || 0)})
                    </span>
                  </div>
                  <button
                    className="ghost-button icon-button salary-card-remove"
                    type="button"
                    onClick={() => onRemovePayment(idx)}
                    aria-label={`Remove payment ${idx + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="salary-card-fields">
                  <label className="salary-field-item">
                    <span className="field-label-text">Group / Months</span>
                    <select
                      className="form-select"
                      value={p.monthOffset}
                      onChange={(e) => onUpdatePayment(idx, 'monthOffset', Number(e.target.value))}
                    >
                      <option value={0}>Group 1 ({salaryGroupMonths(0)})</option>
                      <option value={1}>Group 2 ({salaryGroupMonths(1)})</option>
                      <option value={2}>Group 3 ({salaryGroupMonths(2)})</option>
                    </select>
                  </label>
                  <label className="salary-field-item">
                    <span className="field-label-text">Day of month</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="form-input"
                      value={p.day}
                      onChange={(e) => onUpdatePayment(idx, 'day', Number(e.target.value))}
                    />
                  </label>
                  <label className="salary-field-item">
                    <span className="field-label-text">Amount (EGP)</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className="form-input"
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
