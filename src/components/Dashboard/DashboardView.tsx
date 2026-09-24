import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { MetricCards } from './MetricCards';
import { DeficitBanner } from './DeficitBanner';
import { HealthCard } from './HealthCard';
import { calculateForecast, detectDeficits } from '../../engine/forecast';
import { computeFinancialHealthScore, generateSmartInsights } from '../../engine/healthScore';
import { computeTotalStorageValue } from '../../engine/currency';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { CreditCard, ArrowUpRight, ArrowDownLeft, Edit2, Check } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    accounts,
    entries,
    salaryPattern,
    installments,
    rates,
    storageAssets,
    updateAccountBalance,
    setActiveTab,
  } = useBudgetStore();

  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [tempBalance, setTempBalance] = useState<number>(0);

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const storageTotal = computeTotalStorageValue(storageAssets, rates);

  const currentYm = DateUtils.currentYearMonth();
  const salaryEntries = buildSalaryEntries(salaryPattern, currentYm, 4);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = [...entries, ...salaryEntries, ...installmentEntries];

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);
  const deficits = detectDeficits(forecast);
  const health = computeFinancialHealthScore(forecast, deficits, totalCash, storageTotal);
  const insights = generateSmartInsights(forecast, deficits, totalCash, storageTotal);

  const lowestForecastBalance =
    forecast.length > 0
      ? forecast.reduce((min, f) => (f.balance < min ? f.balance : min), forecast[0].balance)
      : totalCash;

  const handleSaveBalance = (accKey: string) => {
    updateAccountBalance(accKey, tempBalance);
    setEditingAccount(null);
  };

  const recentEntries = entries.slice(0, 5);

  return (
    <div>
      <DeficitBanner deficits={deficits} />

      <MetricCards
        totalCash={totalCash}
        storageTotal={storageTotal}
        lowestForecastBalance={lowestForecastBalance}
        runwayMonths={health.runwayMonths}
      />

      <HealthCard health={health} insights={insights} />

      {/* Account Balances & Quick Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <CreditCard size={18} color="#6366f1" />
              <span>Active Account Balances</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(accounts).map(([key, acc]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Cycle Cutoff: Day {acc.maturityDay}
                  </div>
                </div>

                {editingAccount === key ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '110px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      value={tempBalance}
                      onChange={(e) => setTempBalance(Number(e.target.value))}
                      autoFocus
                    />
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.35rem 0.6rem' }}
                      onClick={() => handleSaveBalance(key)}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                      {formatMoney(acc.balance)}
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem', border: 'none' }}
                      onClick={() => {
                        setEditingAccount(key);
                        setTempBalance(acc.balance);
                      }}
                      title="Edit Balance"
                    >
                      <Edit2 size={13} color="var(--text-muted)" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Recent Activity</span>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
              onClick={() => setActiveTab('entries')}
            >
              View All
            </button>
          </div>

          {recentEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No transactions recorded yet. Click &ldquo;New Entry&rdquo; to add your first transaction.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentEntries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    background: 'var(--bg-surface-elevated)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        background: e.type === 'income' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                        color: e.type === 'income' ? '#10b981' : '#f43f5e',
                      }}
                    >
                      {e.type === 'income' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {e.category} {e.subcategory ? `· ${e.subcategory}` : ''}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {DateUtils.formatDisplayDate(e.date)} {e.tag ? `• ${e.tag}` : ''}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontWeight: 700,
                      fontFamily: 'var(--font-heading)',
                      color: e.type === 'income' ? '#10b981' : 'var(--text-main)',
                    }}
                  >
                    {e.type === 'income' ? '+' : '-'}{formatMoney(e.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
