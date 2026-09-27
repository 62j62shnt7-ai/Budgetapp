import React, { useState, useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency, resolveRateSourceValue } from '../../engine/currency';
import type { StorageAsset } from '../../types';
import { Coins } from 'lucide-react';

interface StorageFxModalProps {
  isOpen: boolean;
  initialAsset?: StorageAsset | null;
  onClose: () => void;
}

export const StorageFxModal: React.FC<StorageFxModalProps> = ({
  isOpen,
  initialAsset,
  onClose,
}) => {
  const { storageAssets, accounts, rates, convertStorageAssetToEgp } = useBudgetStore();

  const [assetId, setAssetId] = useState<string>(() => initialAsset?.id || storageAssets[0]?.id || '');
  const [foreignAmount, setForeignAmount] = useState<string>('');
  const [rate, setRate] = useState<string>('');
  const [targetAccount, setTargetAccount] = useState<string>('hsbc');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedAsset = storageAssets.find((a) => a.id === assetId);

  useEffect(() => {
    if (initialAsset) {
      setAssetId(initialAsset.id);
    }
  }, [initialAsset]);

  useEffect(() => {
    if (selectedAsset) {
      const liveRate = selectedAsset.rateSource
        ? resolveRateSourceValue(selectedAsset.rateSource, rates)
        : null;
      const initialRate = liveRate || selectedAsset.rate || selectedAsset.buyPrice || 0;
      setRate(String(initialRate));
    }
  }, [selectedAsset, rates]);

  if (!isOpen) return null;

  const numAmount = Number(foreignAmount) || 0;
  const numRate = Number(rate) || 0;
  const projectedEgp = Math.round(numAmount * numRate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedAsset) {
      setErrorMsg('Please select a storage asset to convert.');
      return;
    }
    if (numAmount <= 0 || numRate <= 0) {
      setErrorMsg('Please enter valid amount and exchange rate.');
      return;
    }
    if ((Number(selectedAsset.quantity) || 0) < numAmount) {
      setErrorMsg(`Insufficient quantity. Max available: ${selectedAsset.quantity} ${selectedAsset.unit}`);
      return;
    }

    const entryId = convertStorageAssetToEgp(selectedAsset.id, numAmount, targetAccount, numRate);
    if (entryId) {
      setForeignAmount('');
      onClose();
    } else {
      setErrorMsg('Conversion failed. Please verify your inputs.');
    }
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" style={{ maxWidth: '500px' }}>
        <div className="dialog-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Exchange / Sell to EGP</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px' }}>
          Sell foreign currency or gold and deposit the EGP proceeds directly into your liquid operating bank account.
        </p>

        {errorMsg && (
          <div style={{ background: 'var(--danger-soft, #fee2e2)', color: 'var(--danger, #dc2626)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
            {errorMsg}
          </div>
        )}

        <label>
          Asset to Convert / Sell
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {storageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} — Available: {formatNativeCurrency(asset.quantity, asset.unit)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Amount to Sell ({selectedAsset?.unit || 'units'})
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder={`Max: ${selectedAsset?.quantity || 0}`}
              value={foreignAmount}
              onChange={(e) => setForeignAmount(e.target.value)}
            />
          </label>

          <label>
            Exchange Rate (EGP/{selectedAsset?.unit || 'unit'})
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        </div>

        <label>
          Deposit EGP Proceeds To
          <select value={targetAccount} onChange={(e) => setTargetAccount(e.target.value)}>
            {Object.entries(accounts).map(([id, acc]) => (
              <option key={id} value={id}>
                🏦 {acc.name} Operating (Current: {formatMoney(acc.balance)})
              </option>
            ))}
          </select>
        </label>

        {/* Live Calculation Preview Box */}
        {projectedEgp > 0 && (
          <div
            style={{
              background: 'var(--surface-soft)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              marginTop: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Proceeds to receive:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--primary, #16a34a)' }}>
                +{formatMoney(projectedEgp)}
              </strong>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
              Deducts {numAmount} {selectedAsset?.unit} from {selectedAsset?.name} & adds {formatMoney(projectedEgp)} to {accounts[targetAccount]?.name || targetAccount.toUpperCase()} balance.
            </span>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Confirm Exchange
          </button>
        </div>
      </form>
    </dialog>
  );
};
