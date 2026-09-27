import React, { useState, useEffect, useMemo } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney, DateUtils } from '../../engine/dateUtils';
import { getCurrencyRate, formatNativeCurrency } from '../../engine/currency';
import type { CashEntry } from '../../types';

interface DeductAccountModalProps {
  isOpen: boolean;
  entry: CashEntry | null;
  actualAmount: number;
  onClose: () => void;
}

export const DeductAccountModal: React.FC<DeductAccountModalProps> = ({
  isOpen,
  entry,
  actualAmount,
  onClose,
}) => {
  const {
    accounts,
    entries,
    archivedEntries,
    storageAssets,
    rates,
    depositToStorageAsset,
    addStorageAsset,
    updateAccountBalance,
    updateEntry,
  } = useBudgetStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('cib');
  const [tag, setTag] = useState('');
  const [settlementMode, setSettlementMode] = useState<'foreign' | 'convert_egp'>('foreign');
  const [foreignDestination, setForeignDestination] = useState<string>('storage:hsbc_usd');
  const [customFxRate, setCustomFxRate] = useState<string>('');
  const [customEgpAmount, setCustomEgpAmount] = useState<string>('');

  const isIncome = entry?.type === 'income';
  const currency = (entry?.currency || 'EGP').toUpperCase();
  const isForeign = currency !== 'EGP';
  const defaultRate = entry?.fxRateAtEntry || (isForeign ? getCurrencyRate(rates, currency) : 1) || 48.5;

  // Calculate foreign native amount added
  const foreignNativeAmount = isForeign
    ? Math.round((actualAmount / defaultRate) * 100) / 100
    : actualAmount;

  const tagSuggestions = useMemo(() => {
    const baseSuggestions = [
      'Food',
      'Groceries',
      'Credit',
      'Loan',
      'Installment',
      'Rent',
      'Salary',
      'Bills',
      'Kids',
      'Part-Time',
      'Maintenance',
      'Electricity',
      'Internet',
      'Water',
      'Fuel',
    ];
    const extractedTags = [
      ...entries.map((e) => e.tag),
      ...entries.flatMap((e) => (e.draws || []).map((d) => d.tag)),
      ...archivedEntries.map((e) => e.tag),
      ...archivedEntries.flatMap((e) => (e.draws || []).map((d) => d.tag)),
    ].filter((t): t is string => Boolean(t && t.trim()));

    return Array.from(new Set([...baseSuggestions, ...extractedTags])).sort((a, b) => a.localeCompare(b));
  }, [entries, archivedEntries]);

  useEffect(() => {
    if (entry) {
      setSelectedAccountId(accounts[entry.account || ''] ? entry.account! : 'cib');
      setTag(entry.tag || entry.subcategory || '');
      setCustomFxRate(String(defaultRate));
      setCustomEgpAmount(String(actualAmount));
      const defaultForeignDest = currency === 'EUR' ? 'storage:hsbc_eur' : 'storage:hsbc_usd';
      setForeignDestination(defaultForeignDest);
      setSettlementMode(isForeign ? 'foreign' : 'convert_egp');
    }
  }, [entry, isOpen, actualAmount]);

  if (!isOpen || !entry) return null;

  const handleForeignAmountChange = (val: string) => {
    setCustomFxRate(val);
    const r = Number(val) || defaultRate;
    setCustomEgpAmount(String(Math.round(foreignNativeAmount * r)));
  };

  const handleSaveWithoutDeposit = () => {
    const trimmedTag = tag.trim();
    const currentEntry =
      entries.find((e) => e.id === entry.id) ||
      archivedEntries.find((e) => e.id === entry.id) ||
      entry;

    let updatedDraws = currentEntry.draws ? [...currentEntry.draws] : [];
    if (updatedDraws.length > 0) {
      const lastIndex = updatedDraws.length - 1;
      updatedDraws[lastIndex] = {
        ...updatedDraws[lastIndex],
        tag: trimmedTag,
      };
    } else if (actualAmount > 0) {
      updatedDraws = [
        {
          id: `draw-${Date.now()}-0`,
          date: entry.actualDate || entry.date || DateUtils.todayString(),
          amount: actualAmount,
          tag: trimmedTag,
          account: entry.account || 'cash',
        },
      ];
    }

    updateEntry(entry.id, {
      tag: trimmedTag,
      draws: updatedDraws,
    });

    onClose();
  };

  const handleDepositAndSave = () => {
    const trimmedTag = tag.trim();
    let accountName = '';

    if (isForeign && isIncome && settlementMode === 'foreign') {
      // 1. Keep in Foreign Currency -> Deposit to Storage
      if (foreignDestination.startsWith('storage:existing-')) {
        const assetId = foreignDestination.replace('storage:existing-', '');
        depositToStorageAsset(assetId, foreignNativeAmount);
        const existing = storageAssets.find((a) => a.id === assetId);
        if (existing) {
          accountName = existing.name;
        }
      } else if (foreignDestination === 'storage:hsbc_usd') {
        const existing = storageAssets.find(
          (a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'USD'
        );
        if (existing) {
          depositToStorageAsset(existing.id, foreignNativeAmount);
        } else {
          addStorageAsset({
            name: 'HSBC USD Account',
            category: 'Currency',
            quantity: foreignNativeAmount,
            unit: 'USD',
            buyPrice: Number(customFxRate) || defaultRate,
            rate: Number(customFxRate) || defaultRate,
            rateSource: 'currency:USD',
            currency: 'EGP',
            locationType: 'bank',
            location: 'hsbc',
            locationLabel: 'HSBC Foreign Account',
          });
        }
        accountName = 'HSBC USD Account';
      } else if (foreignDestination === 'storage:cash_usd') {
        const existing = storageAssets.find(
          (a) => a.name.toLowerCase().includes('cash') && a.unit.toUpperCase() === 'USD'
        );
        if (existing) {
          depositToStorageAsset(existing.id, foreignNativeAmount);
        } else {
          addStorageAsset({
            name: 'USD Cash in Hand',
            category: 'Currency',
            quantity: foreignNativeAmount,
            unit: 'USD',
            buyPrice: Number(customFxRate) || defaultRate,
            rate: Number(customFxRate) || defaultRate,
            rateSource: 'currency:USD',
            currency: 'EGP',
            locationType: 'cash',
            location: 'cash',
            locationLabel: 'Physical Cash',
          });
        }
        accountName = 'USD Cash in Hand';
      } else if (foreignDestination === 'storage:hsbc_eur') {
        const existing = storageAssets.find(
          (a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'EUR'
        );
        if (existing) {
          depositToStorageAsset(existing.id, foreignNativeAmount);
        } else {
          addStorageAsset({
            name: 'HSBC EUR Account',
            category: 'Currency',
            quantity: foreignNativeAmount,
            unit: 'EUR',
            buyPrice: Number(customFxRate) || defaultRate,
            rate: Number(customFxRate) || defaultRate,
            rateSource: 'currency:EUR',
            currency: 'EGP',
            locationType: 'bank',
            location: 'hsbc',
            locationLabel: 'HSBC Foreign Account',
          });
        }
        accountName = 'HSBC EUR Account';
      }
    } else {
      // 2. Deposit or Deduct from Operating EGP Account
      const acc = accounts[selectedAccountId];
      if (acc) {
        const effectiveEgp = Number(customEgpAmount) || actualAmount;
        const currentBal = acc.balance || 0;
        const newBal = isIncome ? currentBal + effectiveEgp : currentBal - effectiveEgp;
        updateAccountBalance(selectedAccountId, newBal);
        accountName = acc.name;
      }
    }

    const currentEntry =
      entries.find((e) => e.id === entry.id) ||
      archivedEntries.find((e) => e.id === entry.id) ||
      entry;

    let updatedDraws = currentEntry.draws ? [...currentEntry.draws] : [];
    if (updatedDraws.length > 0) {
      const lastIndex = updatedDraws.length - 1;
      updatedDraws[lastIndex] = {
        ...updatedDraws[lastIndex],
        tag: trimmedTag,
        ...(accountName ? { account: accountName } : {}),
      };
    } else if (actualAmount > 0) {
      updatedDraws = [
        {
          id: `draw-${Date.now()}-0`,
          date: entry.actualDate || entry.date || DateUtils.todayString(),
          amount: actualAmount,
          tag: trimmedTag,
          account: accountName || entry.account || 'cash',
        },
      ];
    }

    updateEntry(entry.id, {
      tag: trimmedTag,
      ...(accountName ? { account: accountName } : {}),
      draws: updatedDraws,
    });

    onClose();
  };

  return (
    <dialog
      open
      className="native-dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ display: 'block', zIndex: 1000 }}
    >
      <div className="dialog-heading">
        <h3>{isIncome ? 'Deposit Payment' : 'Adjust Account Balance'}</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
      </div>

      <p style={{ margin: '12px 0 8px', fontSize: '14px', lineHeight: '1.5' }}>
        {isIncome ? (
          <>
            Recorded income of{' '}
            <strong>
              {isForeign ? `${formatNativeCurrency(foreignNativeAmount, currency)} (≈ ${formatMoney(actualAmount)})` : formatMoney(actualAmount)}
            </strong>{' '}
            for <em>{entry.category}</em>.
          </>
        ) : (
          <>
            Deduct <strong>{formatMoney(actualAmount)}</strong> for <em>{entry.category}</em> from your account balance?
          </>
        )}
      </p>

      {/* Decision: Keep in Foreign Currency vs Convert to EGP */}
      {isForeign && isIncome && (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>
            Choose Currency &amp; Destination:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className={`ghost-button ${settlementMode === 'foreign' ? 'active-filter' : ''}`}
              onClick={() => setSettlementMode('foreign')}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: settlementMode === 'foreign' ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--line)',
                background: settlementMode === 'foreign' ? 'var(--primary-soft, rgba(59,130,246,0.1))' : 'var(--surface-soft)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px' }}>💵 Keep in {currency}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Storage Reserves (Bank / Cash)
              </div>
            </button>

            <button
              type="button"
              className={`ghost-button ${settlementMode === 'convert_egp' ? 'active-filter' : ''}`}
              onClick={() => setSettlementMode('convert_egp')}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: settlementMode === 'convert_egp' ? '2px solid var(--green, #16a34a)' : '1px solid var(--line)',
                background: settlementMode === 'convert_egp' ? 'var(--green-soft, rgba(22,163,74,0.1))' : 'var(--surface-soft)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px' }}>💱 Convert to EGP</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Operating Bank Account
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 1. Storage Foreign Destination */}
      {isForeign && isIncome && settlementMode === 'foreign' && (
        <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
          <label style={{ marginTop: 0 }}>
            <span>Foreign Storage Destination</span>
            <select value={foreignDestination} onChange={(e) => setForeignDestination(e.target.value)}>
              <option value="storage:hsbc_usd">🏦 HSBC USD Account (Foreign Bank)</option>
              <option value="storage:cash_usd">💵 USD Cash in Hand (Physical Cash)</option>
              {currency === 'EUR' && (
                <option value="storage:hsbc_eur">🏦 HSBC EUR Account (Foreign Bank)</option>
              )}
              {storageAssets
                .filter((a) => a.unit.toUpperCase() === currency)
                .map((a) => (
                  <option key={a.id} value={`storage:existing-${a.id}`}>
                    📁 {a.name} ({a.quantity} {a.unit}) · {a.locationType === 'cash' ? 'Cash' : 'Bank'}
                  </option>
                ))}
            </select>
          </label>
          <small style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
            ✓ Will add +{formatNativeCurrency(foreignNativeAmount, currency)} to your Storage tab balance.
          </small>
        </div>
      )}

      {/* 2. Operating Account Destination */}
      {((!isForeign && isIncome) || !isIncome || settlementMode === 'convert_egp') && (
        <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
          {isForeign && isIncome && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <label style={{ margin: 0 }}>
                <span>FX Rate</span>
                <input
                  type="number"
                  step="0.01"
                  value={customFxRate}
                  onChange={(e) => handleForeignAmountChange(e.target.value)}
                />
              </label>
              <label style={{ margin: 0 }}>
                <span>Total Converted EGP</span>
                <input
                  type="number"
                  step="1"
                  value={customEgpAmount}
                  onChange={(e) => setCustomEgpAmount(e.target.value)}
                />
              </label>
            </div>
          )}
          <label style={{ marginTop: 0 }}>
            <span>Select Operating Account</span>
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              {Object.entries(accounts).map(([id, a]) => (
                <option key={id} value={id}>
                  {a.name} (Current: {formatMoney(a.balance)})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label style={{ marginTop: '4px' }}>
        <span>Subcategory / Tag <small style={{ color: 'var(--muted)', fontSize: '12px' }}>(Optional)</small></span>
        <input
          type="text"
          list="deductTagSuggestions"
          placeholder="e.g. Job Payout, Client Wire, Salary, Groceries"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </label>
      <datalist id="deductTagSuggestions">
        {tagSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="dialog-actions" style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button className="ghost-button" type="button" onClick={handleSaveWithoutDeposit}>
          Don't {isIncome ? 'deposit' : 'deduct'}
        </button>
        <button className="primary-button" type="button" onClick={handleDepositAndSave}>
          {isIncome ? 'Deposit & Save' : 'Deduct & Save'}
        </button>
      </div>
    </dialog>
  );
};
