import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { isCreditCardExpense, calculateCreditSettlementDate, getCreditCycleHint } from '../../engine/creditCards';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { CreditCard, Calendar } from 'lucide-react';

export const CreditDuesView: React.FC = () => {
  const { entries } = useBudgetStore();

  const creditEntries = entries.filter((e) => isCreditCardExpense(e));

  // Group by account
  const cibExpenses = creditEntries.filter(
    (e) => (e.creditType || e.account || '').toLowerCase().includes('cib')
  );
  const hsbcExpenses = creditEntries.filter(
    (e) => (e.creditType || e.account || '').toLowerCase().includes('hsbc')
  );

  const cibTotal = cibExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const hsbcTotal = hsbcExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const today = DateUtils.todayString();
  const cibNextDue = calculateCreditSettlementDate(today, 'cib');
  const hsbcNextDue = calculateCreditSettlementDate(today, 'hsbc');

  return (
    <div>
      {/* Rules Explanations Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        {/* CIB Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <CreditCard size={18} color="#06b6d4" />
              <span>CIB Credit Card</span>
            </div>
            <div className="badge badge-cyan">Cycle: 15th</div>
          </div>

          <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>
            {formatMoney(cibTotal)}
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {getCreditCycleHint(today, 'cib')}
          </p>

          <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={14} color="#06b6d4" />
            <span>Next Settlement Due: <strong>{DateUtils.formatDisplayDate(cibNextDue)}</strong></span>
          </div>
        </div>

        {/* HSBC Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <CreditCard size={18} color="#f43f5e" />
              <span>HSBC Credit Card</span>
            </div>
            <div className="badge badge-danger">Cycle: End of Month</div>
          </div>

          <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>
            {formatMoney(hsbcTotal)}
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {getCreditCycleHint(today, 'hsbc')}
          </p>

          <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={14} color="#f43f5e" />
            <span>Next Settlement Due: <strong>{DateUtils.formatDisplayDate(hsbcNextDue)}</strong></span>
          </div>
        </div>
      </div>

      {/* Credit Card Purchases & Due Dates */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
          Credit Card Purchases &amp; Settlement Horizons
        </div>

        {creditEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>
            No credit card expenses currently logged. When you log an expense under CIB or HSBC, it automatically appears here and shifts cash outflow to its exact settlement due date!
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Purchase Date</th>
                  <th>Category</th>
                  <th>Card</th>
                  <th>Amount</th>
                  <th>Settlement Due Date</th>
                </tr>
              </thead>
              <tbody>
                {creditEntries.map((e) => {
                  const cardType = e.creditType || e.account || 'cib';
                  const due = calculateCreditSettlementDate(e.date, cardType);
                  return (
                    <tr key={e.id}>
                      <td>{DateUtils.formatDisplayDate(e.date)}</td>
                      <td style={{ fontWeight: 600 }}>{e.category}</td>
                      <td>
                        <span className={`badge ${cardType.toLowerCase().includes('hsbc') ? 'badge-danger' : 'badge-cyan'}`}>
                          {cardType.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                        {formatMoney(e.amount)}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>
                        {DateUtils.formatDisplayDate(due)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
