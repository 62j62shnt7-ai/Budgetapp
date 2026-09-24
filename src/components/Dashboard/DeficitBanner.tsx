import React from 'react';
import type { DeficitSummary } from '../../types';
import { formatMoney, DateUtils } from '../../engine/dateUtils';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface DeficitBannerProps {
  deficits: DeficitSummary;
}

export const DeficitBanner: React.FC<DeficitBannerProps> = ({ deficits }) => {
  const { setActiveTab } = useBudgetStore();

  if (!deficits.hasDeficit || deficits.deficitPeriods.length === 0) {
    return null;
  }

  const firstDeficit = deficits.deficitPeriods[0];
  const daysUntil = DateUtils.daysBetween(DateUtils.todayString(), firstDeficit.startDate);

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)',
        borderColor: 'rgba(244, 63, 94, 0.3)',
        marginBottom: '1.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.2)',
            color: '#f43f5e',
            padding: '12px',
            borderRadius: '12px',
            display: 'flex',
          }}
        >
          <AlertTriangle size={24} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
            Cashflow Deficit Warning: -{formatMoney(deficits.worstDeficit)}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
            <Clock size={14} />
            <span>
              {daysUntil > 0 ? `Expected in approx. ${daysUntil} days` : 'Deficit starts this month'} ({DateUtils.formatDisplayDate(firstDeficit.startDate)})
            </span>
          </div>
        </div>
      </div>

      <button
        className="btn btn-secondary"
        style={{ borderColor: 'rgba(244, 63, 94, 0.3)', color: '#f43f5e' }}
        onClick={() => setActiveTab('deficits')}
      >
        <span>Inspect Forecast &amp; Deficits</span>
        <ArrowRight size={14} />
      </button>
    </div>
  );
};
