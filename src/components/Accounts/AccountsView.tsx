import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency, inferAssetLocation, storageValue } from '../../engine/currency';
import { ArrowRightLeft, Coins, Landmark, Banknote, Lock, Unlock } from 'lucide-react';
import { StorageTransferModal } from '../Modals/StorageTransferModal';
import { StorageFxModal } from '../Modals/StorageFxModal';

// Preferred display order; any other configured account is appended automatically.
const preferredAccountOrder = ['hsbc', 'cib'];

const AccountBalanceInput: React.FC<{
  accountName: string;
  initialBalance: number;
  onCommit: (val: number) => void;
}> = ({ accountName, initialBalance, onCommit }) => {
  const [val, setVal] = useState(String(initialBalance ?? 0));
  const [prevInitial, setPrevInitial] = useState(initialBalance);
  if (initialBalance !== prevInitial) {
    setPrevInitial(initialBalance);
    setVal(String(initialBalance ?? 0));
  }

  const handleCommit = () => {
    const num = Number(val);
    if (!Number.isNaN(num) && num !== initialBalance) {
      onCommit(num);
    }
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      className="form-input account-balance-input"
      aria-label={`${accountName} balance in EGP`}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleCommit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

export const AccountsView: React.FC = () => {
  const { accounts, updateAccountBalance, transferAccountFunds, storageAssets, rates, navigateTo, instapayFeeConfig, updateInstaPayFeeConfig } = useBudgetStore(
    useShallow((state) => ({
      accounts: state.accounts,
      updateAccountBalance: state.updateAccountBalance,
      transferAccountFunds: state.transferAccountFunds,
      storageAssets: state.storageAssets,
      rates: state.rates,
      navigateTo: state.navigateTo,
      instapayFeeConfig: state.instapayFeeConfig,
      updateInstaPayFeeConfig: state.updateInstaPayFeeConfig,
    }))
  );

  const [transferFrom, setTransferFrom] = useState<string>('');
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [feeRatePercent, setFeeRatePercent] = useState(String(instapayFeeConfig.rate * 100));
  const [feeMinimum, setFeeMinimum] = useState(String(instapayFeeConfig.minimum));
  const [feeMaximum, setFeeMaximum] = useState(String(instapayFeeConfig.maximum));
  const [feeConfigMessage, setFeeConfigMessage] = useState('');
  const [instapayAdminUnlocked, setInstapayAdminUnlocked] = useState(false);
  const [previousFeeConfig, setPreviousFeeConfig] = useState(instapayFeeConfig);
  if (instapayFeeConfig !== previousFeeConfig) {
    setPreviousFeeConfig(instapayFeeConfig);
    setFeeRatePercent(String(instapayFeeConfig.rate * 100));
    setFeeMinimum(String(instapayFeeConfig.minimum));
    setFeeMaximum(String(instapayFeeConfig.maximum));
    setFeeConfigMessage('');
  }

  const [storageTransferOpen, setStorageTransferOpen] = useState(false);
  const [storageFxOpen, setStorageFxOpen] = useState(false);

  const totalOpening = Object.values(accounts).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const displayedAccounts: Array<readonly [string, (typeof accounts)[string]]> = [
    ...preferredAccountOrder.flatMap((id) => (accounts[id] ? [[id, accounts[id]] as const] : [])),
    ...Object.entries(accounts)
      .filter(([id]) => !preferredAccountOrder.includes(id))
      .map(([id, acc]) => [id, acc] as const),
  ];
  const accountIds = displayedAccounts.map(([id]) => id);
  // Resolve transfer endpoints against the accounts that actually exist so the
  // form never starts on a deleted/hardcoded account key.
  const activeFrom = transferFrom && accounts[transferFrom] ? transferFrom : accountIds[0] || '';
  const activeTo =
    transferTo && accounts[transferTo]
      ? transferTo
      : accountIds.find((id) => id !== activeFrom) || '';

  const cashForeignAssets = storageAssets.filter((a) => {
    const loc = inferAssetLocation(a);
    return loc.locationType === 'cash';
  });

  const handleBalanceChange = (id: string, newBalance: number) => {
    updateAccountBalance(id, newBalance);
  };

  const handleSaveInstaPayConfig = () => {
    const rate = Number(feeRatePercent) / 100;
    const minimum = Number(feeMinimum);
    const maximum = Number(feeMaximum);
    if (![rate, minimum, maximum].every(Number.isFinite) || rate < 0 || minimum < 0 || maximum < minimum) {
      setFeeConfigMessage('Enter valid nonnegative values, with the maximum at least the minimum.');
      return;
    }
    updateInstaPayFeeConfig({ rate, minimum, maximum, currency: 'EGP' });
    setFeeConfigMessage('Fee rule saved. It applies to new payments only.');
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) return;
    if (activeFrom === activeTo) return;

    const fromAcc = accounts[activeFrom];
    const toAcc = accounts[activeTo];
    if (!fromAcc || !toAcc) return;

    const success = transferAccountFunds(activeFrom, activeTo, amt);
    if (success) {
      setTransferSuccess(`Successfully transferred ${formatMoney(amt)} from ${fromAcc.name} to ${toAcc.name}`);
      setTransferAmount('');
      setTimeout(() => setTransferSuccess(null), 4000);
    }
  };

  return (
    <section className="view accounts-phase-three" id="accounts" style={{ display: 'block' }}>
      <div className="content-grid">
        {/* Account Settings Panel */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Account Settings</h3>
          </div>
          <div id="accountsList" className="stack-list" style={{ marginTop: '12px' }}>
            {displayedAccounts.map(([id, acc]) => {
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="list-row account-row-card">
                    <div className="account-info">
                      <span className="account-badge" aria-hidden="true">
                        <Landmark size={18} style={{ color: 'var(--brand-primary, #6366f1)' }} />
                      </span>
                      <div className="account-identity">
                        <strong
                          className="account-title history-summary-clickable-row"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigateTo('cashflow', { account: id })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigateTo('cashflow', { account: id });
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          title={`Click to view ${acc.name} entries in Cash Flow`}
                        >
                          {acc.name}
                        </strong>
                        <span className="account-subtitle">Liquid Operating Account</span>
                      </div>
                    </div>
                    <div className="account-balance-input-wrap">
                      <span className="account-currency-prefix">EGP</span>
                      <AccountBalanceInput
                        accountName={acc.name}
                        initialBalance={acc.balance}
                        onCommit={(val) => handleBalanceChange(id, val)}
                      />
                    </div>
                  </div>

                  {/* Associated foreign sub-accounts for any bank */}
                  {(() => {
                    const bankForeignAssets = storageAssets.filter((a) => {
                      const loc = inferAssetLocation(a);
                      return loc.location === id || (loc.locationType === 'bank' && a.name.toLowerCase().includes(id));
                    });
                    if (bankForeignAssets.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginLeft: '18px',
                          padding: '10px 14px',
                          background: 'var(--surface-soft)',
                          borderRadius: '8px',
                          borderLeft: '3px solid #2563eb',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                          {acc.name} Foreign Sub-Accounts (Reserves)
                        </span>
                        {bankForeignAssets.map((fAsset) => (
                          <div
                            key={fAsset.id}
                            className="history-summary-clickable-row"
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '13px',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              borderRadius: '4px',
                            }}
                            onClick={() => navigateTo('storage')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigateTo('storage');
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            title="Click to view and manage in Storage & Assets"
                          >
                            <span>{fAsset.name}</span>
                            <div>
                              <strong style={{ marginRight: '8px' }}>{formatNativeCurrency(fAsset.quantity, fAsset.unit)}</strong>
                              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                                (≈ {formatMoney(storageValue(fAsset, rates))})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Physical Cash Holdings Row if any */}
            {cashForeignAssets.length > 0 && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '10px 14px',
                  background: 'var(--surface-soft)',
                  borderRadius: '8px',
                  borderLeft: '3px solid #16a34a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  <Banknote size={13} style={{ color: 'var(--green)' }} /> Physical Cash Foreign Reserves
                </span>
                {cashForeignAssets.map((fAsset) => (
                  <div
                    key={fAsset.id}
                    className="history-summary-clickable-row"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '4px',
                    }}
                    onClick={() => navigateTo('storage')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigateTo('storage');
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    title="Click to view and manage in Storage & Assets"
                  >
                    <span>{fAsset.name}</span>
                    <div>
                      <strong style={{ marginRight: '8px' }}>{formatNativeCurrency(fAsset.quantity, fAsset.unit)}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                        (≈ {formatMoney(storageValue(fAsset, rates))})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Transfer & FX Panel */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Quick Transfer</h3>
          </div>
          <form onSubmit={handleTransfer} className="quick-transfer-form">
            <div className="quick-transfer-row">
              <label className="transfer-field">
                <span className="field-label-text">From Account</span>
                <select className="form-select" value={activeFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                  {Object.entries(accounts).map(([id, a]) => (
                    <option key={id} value={id}>{a.name} ({formatMoney(a.balance)})</option>
                  ))}
                </select>
              </label>
              <label className="transfer-field">
                <span className="field-label-text">To Account</span>
                <select className="form-select" value={activeTo} onChange={(e) => setTransferTo(e.target.value)}>
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
                inputMode="decimal"
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
              <span>Transfer EGP Funds</span>
            </button>
            {transferSuccess && (
              <div className="transfer-success-msg">
                ✓ {transferSuccess}
              </div>
            )}
          </form>

          {/* Foreign Currency Actions */}
          <div style={{ marginTop: '16px', borderTop: '1px dashed var(--line)', paddingTop: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
              Foreign Currency Operations
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className="ghost-button"
                style={{ fontSize: '12px', justifyContent: 'center', padding: '8px' }}
                onClick={() => setStorageTransferOpen(true)}
              >
                <ArrowRightLeft size={13} style={{ marginRight: '4px' }} />
                Move Cash / Bank
              </button>
              <button
                type="button"
                className="ghost-button"
                style={{ fontSize: '12px', justifyContent: 'center', padding: '8px' }}
                onClick={() => setStorageFxOpen(true)}
              >
                <Coins size={13} style={{ marginRight: '4px' }} />
                Sell FX to EGP
              </button>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="instapay-fee-settings-title">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <h3 id="instapay-fee-settings-title" style={{ margin: 0 }}>InstaPay Fee Rule</h3>
            <button
              type="button"
              className="ghost-button"
              aria-label="InstaPay Admin Mode"
              aria-pressed={instapayAdminUnlocked}
              onClick={() => setInstapayAdminUnlocked((unlocked) => !unlocked)}
            >
              {instapayAdminUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
              <span>Admin Mode: {instapayAdminUnlocked ? 'Unlocked' : 'Locked'}</span>
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '8px 0 12px' }}>
            This rule is used for new InstaPay deductions. Saved payments keep their original fee.
          </p>
          <div className="instapay-fee-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
            <label className="transfer-field">
              <span className="field-label-text">Rate (%)</span>
              <input className="form-input" aria-label="InstaPay fee rate percent" type="number" min="0" step="0.01" value={feeRatePercent} disabled={!instapayAdminUnlocked} onChange={(e) => setFeeRatePercent(e.target.value)} />
            </label>
            <label className="transfer-field">
              <span className="field-label-text">Minimum (EGP)</span>
              <input className="form-input" aria-label="InstaPay minimum fee EGP" type="number" min="0" step="0.01" value={feeMinimum} disabled={!instapayAdminUnlocked} onChange={(e) => setFeeMinimum(e.target.value)} />
            </label>
            <label className="transfer-field">
              <span className="field-label-text">Max fee (EGP)</span>
              <input className="form-input" aria-label="InstaPay maximum fee EGP" type="number" min="0" step="0.01" value={feeMaximum} disabled={!instapayAdminUnlocked} onChange={(e) => setFeeMaximum(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="primary-button" disabled={!instapayAdminUnlocked} onClick={handleSaveInstaPayConfig}>Save Fee Rule</button>
            {feeConfigMessage && <small role="status" style={{ color: 'var(--muted)' }}>{feeConfigMessage}</small>}
          </div>
        </section>

        <section className="panel account-summary-panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Quick Summary</h3>
          </div>
          <div className="summary-block" style={{ padding: '16px 0 0' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Combined Liquid Operating Balance</span>
            <strong id="totalOpeningBalance" style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>
              {formatMoney(totalOpening)}
            </strong>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0 }}>
              Aggregated sum of all registered EGP liquid bank accounts. Foreign currencies are tracked safely in the Storage tab.
            </p>
          </div>
        </section>
      </div>

      {/* Storage Modals */}
      <StorageTransferModal
        isOpen={storageTransferOpen}
        onClose={() => setStorageTransferOpen(false)}
      />
      <StorageFxModal
        isOpen={storageFxOpen}
        onClose={() => setStorageFxOpen(false)}
      />
    </section>
  );
};

