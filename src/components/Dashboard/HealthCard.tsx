import React from 'react';
import type { HealthScoreResult, SmartInsight } from '../../types';
import { ShieldCheck, Info, AlertCircle, Sparkles } from 'lucide-react';

interface HealthCardProps {
  health: HealthScoreResult;
  insights: SmartInsight[];
}

export const HealthCard: React.FC<HealthCardProps> = ({ health, insights }) => {
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return '#10b981';
      case 'B': return '#06b6d4';
      case 'C': return '#f59e0b';
      case 'D': return '#f97316';
      default: return '#f43f5e';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
      {/* Financial Health Score Breakdown */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem' }}>
            <ShieldCheck size={20} color={getGradeColor(health.grade)} />
            <span>Financial Health Score</span>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              fontFamily: 'var(--font-heading)',
              color: getGradeColor(health.grade),
              padding: '0.2rem 0.75rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            {health.score}/100 <span style={{ fontSize: '1rem' }}>({health.grade})</span>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          {health.summaryNote}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
              <span>Liquidity &amp; Deficit Safety</span>
              <span>{health.deficitScore}/40</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${(health.deficitScore / 40) * 100}%`, height: '100%', background: getGradeColor(health.grade), borderRadius: '4px' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
              <span>Cash Runway ({health.runwayMonths} months)</span>
              <span>{health.runwayScore}/35</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${(health.runwayScore / 35) * 100}%`, height: '100%', background: '#6366f1', borderRadius: '4px' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
              <span>Asset &amp; Savings Buffer</span>
              <span>{health.savingsScore}/25</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${(health.savingsScore / 25) * 100}%`, height: '100%', background: '#06b6d4', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Smart Intelligence Recommendations */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
          <Sparkles size={20} color="#8b5cf6" />
          <span>Smart Intelligence &amp; Insights</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {insights.map((insight) => (
            <div
              key={insight.id}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background:
                  insight.type === 'critical'
                    ? 'rgba(244, 63, 94, 0.1)'
                    : insight.type === 'warning'
                    ? 'rgba(245, 158, 11, 0.1)'
                    : 'rgba(99, 102, 241, 0.08)',
                border: `1px solid ${
                  insight.type === 'critical'
                    ? 'rgba(244, 63, 94, 0.25)'
                    : insight.type === 'warning'
                    ? 'rgba(245, 158, 11, 0.25)'
                    : 'rgba(99, 102, 241, 0.2)'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                {insight.type === 'critical' ? (
                  <AlertCircle size={15} color="#f43f5e" />
                ) : (
                  <Info size={15} color="#818cf8" />
                )}
                <span>{insight.title}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {insight.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
