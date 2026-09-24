import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { calculateForecast, detectDeficits } from '../../engine/forecast';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { AlertCircle, Clock, CheckCircle } from 'lucide-react';

export const DeficitsView: React.FC = () => {
  const { accounts, entries, salaryPattern, installments } = useBudgetStore();

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const currentYm = DateUtils.currentYearMonth();
  const salaryEntries = buildSalaryEntries(salaryPattern, currentYm, 4);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = [...entries, ...salaryEntries, ...installmentEntries];

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);
  const deficits = detectDeficits(forecast);

  const today = DateUtils.todayString();
  const overdueEntries = entries.filter((e) => e.date && e.date < today && e.type === 'expense');

  return (
    <section className="view" id="deficits" style={{ display: 'block' }}>
      <div className="content-grid salary-layout">
        {/* Forecast Deficit Timeline */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Forecast deficit timeline</h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Exact months balance turns negative until income recovers it
            </span>
          </div>

          <div id="deficitForecastList" className="stack-list" style={{ marginTop: '12px' }}>
            {!deficits.hasDeficit ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '8px' }}>
                <CheckCircle size={28} color="var(--green)" style={{ margin: '0 auto 8px' }} />
                <strong>No cashflow deficits projected</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Your forecast maintains positive liquidity across the projected horizon.</p>
              </div>
            ) : (
              deficits.deficitPeriods.map((period, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(192, 61, 53, 0.08)',
                    border: '1px solid rgba(192, 61, 53, 0.25)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={20} color="var(--red)" />
                    <div>
                      <strong style={{ display: 'block', color: 'var(--red)', fontSize: '14px' }}>
                        Deficit: -{formatMoney(period.maxDeficit)}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Span: {DateUtils.formatDisplayDate(period.startDate)} to {DateUtils.formatDisplayDate(period.endDate)} (~{period.shortfallDays} days)
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-danger">Unresolved</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Overdue & Unpaid */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Overdue &amp; unpaid</h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Past their scheduled date without recorded payment
            </span>
          </div>

          <div id="deficitOverdueList" className="stack-list" style={{ marginTop: '12px' }}>
            {overdueEntries.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '8px' }}>
                <Clock size={28} color="var(--muted)" style={{ margin: '0 auto 8px' }} />
                <span>No overdue entries found</span>
              </div>
            ) : (
              overdueEntries.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-soft)',
                    marginBottom: '6px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13px', display: 'block' }}>{entry.category}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Due: {DateUtils.formatDisplayDate(entry.date)} · Account: {entry.account.toUpperCase()}
                    </span>
                  </div>
                  <strong style={{ color: 'var(--red)', fontFamily: 'var(--font-heading)' }}>
                    {formatMoney(entry.amount)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
