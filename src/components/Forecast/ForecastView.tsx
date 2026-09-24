import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { calculateForecast } from '../../engine/forecast';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { ForecastChart } from './ForecastChart';
import { SpendSimulator } from './SpendSimulator';
import { TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export const ForecastView: React.FC = () => {
  const { accounts, entries, salaryPattern, installments } = useBudgetStore();

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const currentYm = DateUtils.currentYearMonth();
  const salaryEntries = buildSalaryEntries(salaryPattern, currentYm, 4);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = [...entries, ...salaryEntries, ...installmentEntries];

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);

  return (
    <div>
      {/* Chart Section */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem' }}>
            <TrendingUp size={18} color="#6366f1" />
            <span>12-Month Net Cashflow Trajectory</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Includes salary cycles, recurring bills &amp; card settlements
          </span>
        </div>

        <ForecastChart
          entries={allCandidateEntries}
          totalCash={totalCash}
          rangeMonths={12}
          mode="monthly"
        />
      </div>

      {/* Simulator Section */}
      <SpendSimulator baseForecast={forecast} />

      {/* Monthly Breakdown Table */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
          Monthly Cashflow Projections
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Inflows</th>
                <th>Outflows</th>
                <th>Net Monthly</th>
                <th>Projected Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((f) => {
                const isNegative = f.balance < 0;
                return (
                  <tr key={f.month}>
                    <td style={{ fontWeight: 600 }}>{DateUtils.formatDisplayDate(f.month)}</td>
                    <td style={{ color: '#10b981' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowDownLeft size={13} />
                        {formatMoney(f.income)}
                      </span>
                    </td>
                    <td style={{ color: '#f43f5e' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowUpRight size={13} />
                        {formatMoney(f.expense)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: f.net >= 0 ? '#10b981' : '#f43f5e' }}>
                      {f.net >= 0 ? '+' : ''}{formatMoney(f.net)}
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        fontFamily: 'var(--font-heading)',
                        color: isNegative ? '#f43f5e' : 'var(--text-main)',
                      }}
                    >
                      {formatMoney(f.balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
