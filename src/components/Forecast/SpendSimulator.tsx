import React, { useState } from 'react';
import { formatMoney, DateUtils } from '../../engine/dateUtils';
import { Calculator, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { MonthlyForecast } from '../../types';

interface SpendSimulatorProps {
  baseForecast: MonthlyForecast[];
}

export const SpendSimulator: React.FC<SpendSimulatorProps> = ({ baseForecast }) => {
  const [simAmount, setSimAmount] = useState<number>(15000);
  const [simMonth, setSimMonth] = useState<string>(
    baseForecast.length > 0 ? baseForecast[0].month : DateUtils.currentYearMonth()
  );

  // Recalculate impact
  let lowestSimBalance = Infinity;
  let causesDeficit = false;
  let hitMonth = '';

  baseForecast.forEach((f) => {
    let bal = f.balance;
    if (f.month >= simMonth) {
      bal -= simAmount;
    }
    if (bal < lowestSimBalance) {
      lowestSimBalance = bal;
      if (bal < 0 && !causesDeficit) {
        causesDeficit = true;
        hitMonth = f.month;
      }
    }
  });

  return (
    <div className="card" style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
        <Calculator size={18} color="#8b5cf6" />
        <span>Spend &ldquo;What-If&rdquo; Simulator</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Simulate Spend Amount (EGP)</label>
          <input
            type="number"
            className="form-input"
            value={simAmount || ''}
            onChange={(e) => setSimAmount(Number(e.target.value))}
            placeholder="e.g. 20000"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Impact Month</label>
          <select
            className="form-select"
            value={simMonth}
            onChange={(e) => setSimMonth(e.target.value)}
          >
            {baseForecast.map((f) => (
              <option key={f.month} value={f.month}>
                {DateUtils.formatDisplayDate(f.month)}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: causesDeficit ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${causesDeficit ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {causesDeficit ? (
            <AlertTriangle size={20} color="#f43f5e" />
          ) : (
            <CheckCircle2 size={20} color="#10b981" />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: causesDeficit ? '#f43f5e' : '#10b981' }}>
              {causesDeficit ? `Triggers Deficit in ${hitMonth}!` : 'Safe to Spend!'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Lowest balance: {formatMoney(lowestSimBalance)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
