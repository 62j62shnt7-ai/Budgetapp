import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney } from '../../engine/dateUtils';

interface ExpenseMixSectionProps {
  expenseMixOpen: boolean;
  setExpenseMixOpen: (open: boolean) => void;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
}

export const ExpenseMixSection: React.FC<ExpenseMixSectionProps> = ({
  expenseMixOpen,
  setExpenseMixOpen,
  expensesByCategory,
  totalExpenses,
}) => {
  const sortedCategories = Object.entries(expensesByCategory).sort(
    ([, amountA], [, amountB]) => amountB - amountA
  );

  return (
    <section className="panel collapsible-panel cashflow-collapsible-panel">
      <div
        className="panel-heading"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpenseMixOpen(!expenseMixOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={expenseMixOpen}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpenseMixOpen(!expenseMixOpen)}
      >
        <h3 style={{ margin: 0 }}>Expense mix</h3>
        <button className="ghost-button icon-button collapse-toggle-btn" type="button" aria-label={expenseMixOpen ? 'Collapse' : 'Expand'}>
          {expenseMixOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expenseMixOpen && (
        <div className="collapsible-content" style={{ marginTop: '12px' }}>
          {sortedCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
              No expenses in selected period.
            </div>
          ) : (
            sortedCategories.map(([cat, amt]) => {
              const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
              return (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span>{cat}</span>
                    <strong>
                      {formatMoney(amt)} ({pct}%)
                    </strong>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: 'var(--line, rgba(0,0,0,0.08))',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--red, #c03d35)',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
