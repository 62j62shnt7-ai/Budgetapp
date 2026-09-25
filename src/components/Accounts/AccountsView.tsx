import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { ArrowRightLeft } from 'lucide-react';

const accountOrder = ['cib', 'hsbc'] as const;

export const AccountsView: React.FC = () => {
  const { accounts, updateAccountBalance } = useBudgetStore();

  const [transferFrom, setTransferFrom] = useState<string>('cib');
  const [transferTo, setTransferTo] = useState<string>('hsbc');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const totalOpening = Object.values(accounts).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const displayedAccounts = accountOrder.flatMap((id) =>
    accounts[id] ? [[id, accounts[id]] as const] : []
  );

  const handleBalanceChange = (id: string, newBalance: number) => {
    updateAccountBalance(id, newBalance);
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) return;
    if (transferFrom === transferTo) return;

    const fromAcc = accounts[transferFrom];
    const toAcc = accounts[transferTo];
    if (!fromAcc || !toAcc) return;

    updateAccountBalance(transferFrom, (fromAcc.balance || 0) - amt);
    updateAccountBalance(transferTo, (toAcc.balance || 0) + amt);

    setTransferSuccess(`Successfully transferred ${formatMoney(amt)} from ${fromAcc.name} to ${toAcc.name}`);
    setTransferAmount('');
    setTimeout(() => setTransferSuccess(null), 4000);
  };

  return (
    <section className="view" id="accounts" style={{ display: 'block' }}>
      <div className="content-grid">
        {/* Account Settings Panel */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Account Settings</h3>
          </div>
          <div id="accountsList" className="stack-list" style={{ marginTop: '12px' }}>
            {displayedAccounts.map(([id, acc]) => (
              <div
                key={id}
                className="list-row account-row-card"
              >
                <div className="account-info">
                  <span className="account-badge">🏦</span>
                  <div>
                    <strong className="account-title">{acc.name}</strong>
                    <span className="account-subtitle">Liquid Account</span>
                  </div>
                </div>
                <div className="account-balance-input-wrap">
                  <span className="account-currency-prefix">EGP</span>
                  <input
                    type="number"
                    className="form-input account-balance-input"
                    value={acc.balance}
                    onChange={(e) => handleBalanceChange(id, Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Transfer & Note Panel */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Quick Transfer</h3>
          </div>
          <form onSubmit={handleTransfer} className="quick-transfer-form">
            <div className="quick-transfer-row">
              <label className="transfer-field">
                <span className="field-label-text">From Account</span>
                <select className="form-select" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                  {Object.entries(accounts).map(([id, a]) => (
                    <option key={id} value={id}>{a.name} ({formatMoney(a.balance)})</option>
                  ))}
                </select>
              </label>
              <label className="transfer-field">
                <span className="field-label-text">To Account</span>
                <select className="form-select" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  {Object.entries(accounts).map(([id, a]) => (
                    <option key={id} value={id}>{a.name} ({formatMoney(a.balance)})</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="transfer-field">
              <span className="field-label-text">Amount (EGP)</span>
              <input
                className="form-input"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 5000"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                required
              />
            </label>
            <button className="primary-button transfer-submit-btn" type="submit">
              <ArrowRightLeft size={15} style={{ marginRight: '6px' }} />
              <span>Transfer Funds</span>
            </button>
            {transferSuccess && (
              <div className="transfer-success-msg">
                ✓ {transferSuccess}
              </div>
            )}
          </form>

          <div className="summary-block" style={{ marginTop: '16px', borderTop: '1px dashed var(--line)', paddingTop: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Manual expense note</span>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '4px 0 0' }}>
              Add credit card payments as regular expenses from the cash flow tab.
              Use the "+ Expense" button in topbar to log them manually.
            </p>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-heading">
          <h3 style={{ margin: 0 }}>Quick Summary</h3>
        </div>
        <div className="summary-block" style={{ padding: '16px 0 0' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Combined Starting Balance</span>
          <strong id="totalOpeningBalance" style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>
            {formatMoney(totalOpening)}
          </strong>
          <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0 }}>
            Aggregated sum of all registered bank accounts and cash in hand.
          </p>
        </div>
      </section>
    </section>
  );
};
