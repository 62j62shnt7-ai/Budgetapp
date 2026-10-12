import React, { useState, useMemo } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney, DateUtils } from '../../engine/dateUtils';
import { getCurrencyRateOr, formatNativeCurrency, getAccountNativeCurrency, convertAmountBetweenCurrencies, normalizeCurrencyCode } from '../../engine/currency';
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
    updateStorageAsset,
    updateAccountBalance,
    updateEntry,
    runTransaction,
    creditSettlementOverrides,
  } = useBudgetStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('hsbc');
  const [tag, setTag] = useState('');
  const [settlementMode, setSettlementMode] = useState<'foreign' | 'convert_egp'>('foreign');
  const [foreignDestination, setForeignDestination] = useState<string>('');
  const [customFxRate, setCustomFxRate] = useState<string>('');
  const [customEgpAmount, setCustomEgpAmount] = useState<string>('');

  const isIncome = entry?.type === 'income';
  const currency = normalizeCurrencyCode(entry?.currency) || 'EGP';
  const isForeign = currency !== 'EGP';
  const defaultRate = entry?.fxRateAtEntry || getCurrencyRateOr(rates, currency, 48.5);

  // Calculate foreign native amount added
  const foreignNativeAmount = isForeign
    ? Math.round((actualAmount / defaultRate) * 100) / 100
    : actualAmount;

  const targetStorageAsset = useMemo(() => {
    if (!isForeign || settlementMode !== 'foreign') return null;
    const assetId = foreignDestination.replace('storage:existing-', '').replace('storage:', '');
    return storageAssets.find((ast) => ast.id === assetId || ast.name.toLowerCase() === assetId.toLowerCase()) || null;
  }, [isForeign, settlementMode, foreignDestination, storageAssets]);

  const targetAssetUnit = targetStorageAsset
    ? (targetStorageAsset.unit || targetStorageAsset.currency || currency).toUpperCase()
    : currency;

  const targetAssetDeductAmount = useMemo(() => {
    if (!targetStorageAsset) return foreignNativeAmount;
    const targetCurr = getAccountNativeCurrency(targetStorageAsset.name, storageAssets);
    return convertAmountBetweenCurrencies(foreignNativeAmount, currency, targetCurr, rates);
  }, [targetStorageAsset, foreignNativeAmount, currency, rates, storageAssets]);

  const targetAccountLabel = useMemo(() => {
    if (isForeign && settlementMode === 'foreign') {
      return targetStorageAsset ? targetStorageAsset.name : 'Storage';
    }
    const acc = accounts[selectedAccountId];
    return acc ? acc.name : selectedAccountId.toUpperCase();
  }, [isForeign, settlementMode, targetStorageAsset, accounts, selectedAccountId]);

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

  const [prevDeductKey, setPrevDeductKey] = useState<string>('');
  const currentDeductKey = `${isOpen}-${entry?.id || ''}-${actualAmount}`;
  if (currentDeductKey !== prevDeductKey) {
    setPrevDeductKey(currentDeductKey);
    if (entry && isOpen) {
      const isSettlement = entry.id.startsWith('credit-settlement-');
      let defaultAccId = 'hsbc';

      if (isSettlement) {
        const parsedKey = (entry.id.split('-')[2] || entry.account || '').toLowerCase();
        const matched = Object.keys(accounts).find((k) => k.toLowerCase() === parsedKey);
        defaultAccId = matched || (accounts[entry.account || ''] ? entry.account! : (accounts['hsbc'] ? 'hsbc' : accounts['cib'] ? 'cib' : Object.keys(accounts)[0] || 'hsbc'));
      } else {
        const entryAccClean = (entry.account || '').trim();
        const entryAccLower = entryAccClean.toLowerCase();
        const matchedOperating = Object.keys(accounts).find((k) => k.toLowerCase() === entryAccLower);
        const matchedStorage = storageAssets.find(
          (a) => a.id === entryAccClean || a.name.toLowerCase() === entryAccLower
        );

        const isTargetingStorage = Boolean(
          matchedStorage ||
          entryAccLower.startsWith('storage:') ||
          ((entryAccLower.includes('cash') || entryAccLower.includes('storage')) && isForeign)
        );

        defaultAccId = matchedOperating || (accounts['hsbc'] ? 'hsbc' : accounts['cib'] ? 'cib' : Object.keys(accounts)[0] || 'hsbc');

        let defaultForeignDest = '';
        if (matchedStorage) {
          defaultForeignDest = `storage:${matchedStorage.id}`;
        } else {
          const matchedByCurrency = storageAssets.find((a) => {
            const u = (a.unit || a.currency || '').toUpperCase();
            return u === currency || (currency === 'USD' && u === 'DOLLARS') || (currency === 'EUR' && u === 'EUROS');
          });
          if (matchedByCurrency) {
            defaultForeignDest = `storage:${matchedByCurrency.id}`;
          } else if (storageAssets.length > 0) {
            defaultForeignDest = `storage:${storageAssets[0].id}`;
          }
        }

        setSelectedAccountId(defaultAccId);
        setForeignDestination(defaultForeignDest);

        // If user chose a bank operating account in EntryModal, default to convert_egp.
        // If user chose a storage asset or foreign reserve in EntryModal, default to foreign.
        if (isForeign) {
          setSettlementMode(isTargetingStorage ? 'foreign' : 'convert_egp');
        } else {
          setSettlementMode('convert_egp');
        }
      }

      setTag(entry.tag || entry.subcategory || '');
      setCustomFxRate(String(defaultRate));
      setCustomEgpAmount(String(actualAmount));
    }
  }

  if (!isOpen || !entry) return null;

  const handleForeignAmountChange = (val: string) => {
    setCustomFxRate(val);
    const r = Number(val) || defaultRate;
    setCustomEgpAmount(String(Math.round(foreignNativeAmount * r)));
  };

  const handleSaveWithoutDeposit = () => {
    const trimmedTag = tag.trim();
    const isSettlement = entry.id.startsWith('credit-settlement-');
    const override = isSettlement ? creditSettlementOverrides[entry.id] : undefined;
    const currentEntry =
      entries.find((e) => e.id === entry.id) ||
      archivedEntries.find((e) => e.id === entry.id) ||
      entry;

    const baseDraws = (isSettlement && override?.draws && override.draws.length > 0)
      ? override.draws
      : (currentEntry.draws || []);
    let updatedDraws = [...baseDraws];

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
          account: entry.account || (isSettlement ? (entry.id.split('-')[2] || 'hsbc') : 'hsbc'),
        },
      ];
    }

    updateEntry(entry.id, {
      tag: trimmedTag,
      draws: updatedDraws,
      ...(isSettlement ? { isClosed: entry.isClosed ?? true } : {}),
    });

    onClose();
  };

  const handleDepositAndSave = () => {
    if (!entry) return;
    runTransaction(`${isIncome ? 'Deposit' : 'Deduct'} Account: ${entry.category || 'Entry'}`, () => {
      const trimmedTag = tag.trim();
      let accountName = '';

      if (isForeign && settlementMode === 'foreign') {
        // 1. Keep in Foreign Currency -> Deposit or Deduct from Storage
        const assetId = foreignDestination.replace('storage:existing-', '').replace('storage:', '');
        const existing = storageAssets.find((a) => a.id === assetId || a.name.toLowerCase() === assetId.toLowerCase());
        if (existing) {
          const targetCurr = getAccountNativeCurrency(existing.name, storageAssets);
          const targetAmount = convertAmountBetweenCurrencies(foreignNativeAmount, currency, targetCurr, rates);
          if (isIncome) {
            depositToStorageAsset(existing.id, targetAmount);
          } else {
            const nextQty = Math.max(0, (Number(existing.quantity) || 0) - targetAmount);
            updateStorageAsset(existing.id, { quantity: nextQty });
          }
          accountName = existing.name;
        } else if (isIncome) {
          addStorageAsset({
            name: `${currency} Holdings`,
            category: 'Currency',
            quantity: foreignNativeAmount,
            unit: currency,
            buyPrice: Number(customFxRate) || defaultRate,
            rate: Number(customFxRate) || defaultRate,
            rateSource: `currency:${currency}`,
            currency: 'EGP',
            locationType: 'vault',
            location: 'vault',
            locationLabel: 'Reserve Holding',
          });
          accountName = `${currency} Holdings`;
        }
      } else {
      // 2. Deposit or Deduct from Operating EGP Account
      const acc = accounts[selectedAccountId];
      if (acc) {
        const effectiveEgp = Number(customEgpAmount) || actualAmount;
        const currentBal = acc.balance || 0;
        const newBal = isIncome ? currentBal + effectiveEgp : currentBal - effectiveEgp;
        updateAccountBalance(selectedAccountId, newBal);
        accountName = selectedAccountId;
      }
    }

    const isSettlement = entry.id.startsWith('credit-settlement-');
    const override = isSettlement ? creditSettlementOverrides[entry.id] : undefined;
    const currentEntry =
      entries.find((e) => e.id === entry.id) ||
      archivedEntries.find((e) => e.id === entry.id) ||
      entry;

    const baseDraws = (isSettlement && override?.draws && override.draws.length > 0)
      ? override.draws
      : (currentEntry.draws || []);
    let updatedDraws = [...baseDraws];

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
          account: accountName || entry.account || (isSettlement ? (entry.id.split('-')[2] || 'hsbc') : 'hsbc'),
        },
      ];
    }

      updateEntry(entry.id, {
        tag: trimmedTag,
        ...(accountName ? { account: accountName } : {}),
        draws: updatedDraws,
        ...(isSettlement ? { isClosed: entry.isClosed ?? true } : {}),
      });
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
        <h3>{isIncome ? `Deposit to ${targetAccountLabel}` : `Deduct from ${targetAccountLabel}`}</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
      </div>

      <p style={{ margin: '12px 0 8px', fontSize: '14px', lineHeight: '1.5' }}>
        {isIncome ? (
          <>
            Deposit{' '}
            <strong>
              {isForeign && settlementMode === 'foreign' ? (
                targetStorageAsset && targetAssetUnit !== currency ? (
                  <>
                    {formatNativeCurrency(targetAssetDeductAmount, targetAssetUnit)}{' '}
                    <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
                      (≈ {formatNativeCurrency(foreignNativeAmount, currency)})
                    </span>
                  </>
                ) : (
                  formatNativeCurrency(targetAssetDeductAmount, currency)
                )
              ) : (
                formatMoney(Number(customEgpAmount) || actualAmount)
              )}
            </strong>{' '}
            for <em>{entry.category}</em> into <strong>{targetAccountLabel}</strong>?
          </>
        ) : (
          <>
            Deduct{' '}
            <strong>
              {isForeign && settlementMode === 'foreign' ? (
                targetStorageAsset && targetAssetUnit !== currency ? (
                  <>
                    {formatNativeCurrency(targetAssetDeductAmount, targetAssetUnit)}{' '}
                    <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
                      (≈ {formatNativeCurrency(foreignNativeAmount, currency)})
                    </span>
                  </>
                ) : (
                  formatNativeCurrency(targetAssetDeductAmount, currency)
                )
              ) : (
                formatMoney(Number(customEgpAmount) || actualAmount)
              )}
            </strong>{' '}
            for <em>{entry.category}</em> from <strong>{targetAccountLabel}</strong>?
          </>
        )}
      </p>

      {/* Decision: Keep in Foreign Currency vs Convert to EGP */}
      {isForeign && (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>
            {isIncome ? 'Choose Currency & Destination:' : 'Choose Source Currency & Account:'}
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
              <div style={{ fontWeight: 700, fontSize: '13px' }}>💵 {isIncome ? `Keep in ${currency}` : `Deduct from ${currency}`}</div>
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
              <div style={{ fontWeight: 700, fontSize: '13px' }}>💱 {isIncome ? 'Convert to EGP' : 'Deduct EGP Equivalent'}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Operating Bank Account
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 1. Storage Foreign Destination */}
      {isForeign && settlementMode === 'foreign' && (
        <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
          <label style={{ marginTop: 0 }}>
            <span>{isIncome ? 'Foreign Storage Destination' : 'Foreign Storage Source'}</span>
            <select value={foreignDestination} onChange={(e) => setForeignDestination(e.target.value)}>
              {storageAssets.map((a) => (
                <option key={a.id} value={`storage:${a.id}`}>
                  📁 {a.name} ({formatNativeCurrency(a.quantity, a.unit)})
                </option>
              ))}
            </select>
          </label>
          <small style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
            {targetStorageAsset && targetAssetUnit !== currency
              ? isIncome
                ? `✓ Will add +${formatNativeCurrency(targetAssetDeductAmount, targetAssetUnit)} to ${targetStorageAsset.name} (converted from ${formatNativeCurrency(foreignNativeAmount, currency)}).`
                : `✓ Will deduct -${formatNativeCurrency(targetAssetDeductAmount, targetAssetUnit)} from ${targetStorageAsset.name} (converted from ${formatNativeCurrency(foreignNativeAmount, currency)}).`
              : isIncome
                ? `✓ Will add +${formatNativeCurrency(targetAssetDeductAmount, currency)} to your Storage tab balance.`
                : `✓ Will deduct -${formatNativeCurrency(targetAssetDeductAmount, currency)} from your Storage tab balance.`}
          </small>
        </div>
      )}

      {/* 2. Operating Account Destination */}
      {((!isForeign) || settlementMode === 'convert_egp') && (
        <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '12px' }}>
          {isForeign && (
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
            <span>{isIncome ? 'Select Operating Account to Deposit' : 'Select Operating Account to Deduct'}</span>
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              {Object.entries(accounts)
                .sort(([idA], [idB]) => (idA === 'hsbc' ? -1 : idB === 'hsbc' ? 1 : 0))
                .map(([id, a]) => (
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
          {isIncome ? `Deposit to ${targetAccountLabel} & Save` : `Deduct from ${targetAccountLabel} & Save`}
        </button>
      </div>
    </dialog>
  );
};
