import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney } from '../../engine/dateUtils';

interface ExpenseMixSectionProps {
  expenseMixOpen: boolean;
  setExpenseMixOpen: (open: boolean) => void;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  onSelectCategory?: (category: string) => void;
  selectedCategory?: string;
}

export const ExpenseMixSection: React.FC<ExpenseMixSectionProps> = ({
  expenseMixOpen,
  setExpenseMixOpen,
  expensesByCategory,
  totalExpenses,
  onSelectCategory,
  selectedCategory,
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
        <span className="collapse-toggle-btn" aria-hidden="true">
          {expenseMixOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
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
              const isSelected = selectedCategory === cat;
              return (
                <div
                  key={cat}
                  className={onSelectCategory ? 'history-summary-clickable-row' : undefined}
                  style={{
                    marginBottom: '10px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    cursor: onSelectCategory ? 'pointer' : 'default',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    border: isSelected ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                  }}
                  onClick={() => onSelectCategory?.(cat)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onSelectCategory) {
                      e.preventDefault();
                      onSelectCategory(cat);
                    }
                  }}
                  role={onSelectCategory ? 'button' : undefined}
                  tabIndex={onSelectCategory ? 0 : undefined}
                  title={onSelectCategory ? `Click to filter entries by category: ${cat}` : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>{cat}</span>
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
