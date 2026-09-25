import React from 'react';
import { formatMoney } from '../../engine/dateUtils';

interface MonthlySummaryRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
}

interface HistorySummaryTabProps {
  totalLifetimeIncome: number;
  totalLifetimeExpenses: number;
  lifetimeNet: number;
  lifetimeSavingsRate: number;
  monthlySummaryRows: MonthlySummaryRow[];
}

export const HistorySummaryTab: React.FC<HistorySummaryTabProps> = ({
  totalLifetimeIncome,
  totalLifetimeExpenses,
  lifetimeNet,
  lifetimeSavingsRate,
  monthlySummaryRows,
}) => {
  return (
    <div className="history-tab-pane active" id="historySummaryPane">
      <div className="metrics-grid history-summary-grid" id="historyLifetimeSummary" style={{ marginBottom: '18px' }}>
        <article className="metric history-metric">
          <span>Lifetime Income</span>
          <strong id="historyLifetimeIncome" style={{ color: 'var(--green)' }}>
            {formatMoney(totalLifetimeIncome)}
          </strong>
          <small>Total realized income</small>
        </article>
        <article className="metric history-metric">
          <span>Lifetime Expenses</span>
          <strong id="historyLifetimeExpenses" style={{ color: 'var(--red)' }}>
            {formatMoney(totalLifetimeExpenses)}
          </strong>
          <small>Total realized expenses</small>
        </article>
        <article className="metric history-metric">
          <span>Lifetime Net</span>
          <strong id="historyLifetimeNet" style={{ color: lifetimeNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {lifetimeNet >= 0 ? '+' : ''}{formatMoney(lifetimeNet)}
          </strong>
          <small>Realized cash surplus</small>
        </article>
        <article className="metric history-metric">
          <span>Savings Rate</span>
          <strong id="historySavingsRate">{lifetimeSavingsRate}%</strong>
          <small>Net / Income ratio</small>
        </article>
      </div>

      <section className="panel history-table-panel">
        <div className="panel-heading">
          <h3 style={{ margin: 0 }}>Monthly income and expenses</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
          Monthly aggregated totals of all confirmed income and actual expenses.
        </p>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="number">Income</th>
                <th className="number">Expenses</th>
                <th className="number">Net</th>
                <th className="number">Savings Rate</th>
              </tr>
            </thead>
            <tbody id="historyTable">
              {monthlySummaryRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    No actual activity recorded yet. Actualize entries in Cash Flow to populate history.
                  </td>
                </tr>
              ) : (
                monthlySummaryRows.map((row) => {
                  const rateBadgeClass =
                    row.savingsRate >= 20 ? 'favorable' : row.savingsRate >= 0 ? 'neutral' : 'unfavorable';
                  return (
                    <tr key={row.month}>
                      <td><strong>{row.month}</strong></td>
                      <td className="number" style={{ color: 'var(--green)', fontWeight: 600 }}>
                        +{formatMoney(row.income)}
                      </td>
                      <td className="number" style={{ color: 'var(--red)', fontWeight: 600 }}>
                        -{formatMoney(row.expenses)}
                      </td>
                      <td
                        className="number"
                        style={{
                          fontWeight: 700,
                          color: row.net >= 0 ? 'var(--green)' : 'var(--red)',
                        }}
                      >
                        {row.net >= 0 ? '+' : ''}{formatMoney(row.net)}
                      </td>
                      <td className="number">
                        <span className={`variance-pill ${rateBadgeClass}`}>{row.savingsRate}%</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
