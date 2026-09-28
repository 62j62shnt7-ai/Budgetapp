import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatNativeCurrency } from '../../engine/currency';
import type { StorageAsset } from '../../types';
import { ArrowRightLeft } from 'lucide-react';

interface StorageTransferModalProps {
  isOpen: boolean;
  initialFromAsset?: StorageAsset | null;
  onClose: () => void;
}

export const StorageTransferModal: React.FC<StorageTransferModalProps> = ({
  isOpen,
  initialFromAsset,
  onClose,
}) => {
  const { storageAssets, transferStorageAsset } = useBudgetStore();

  const [fromAssetId, setFromAssetId] = useState<string>(() => initialFromAsset?.id || storageAssets[0]?.id || '');
  const [toAssetId, setToAssetId] = useState<string>(() => {
    const other = storageAssets.find((a) => a.id !== (initialFromAsset?.id || storageAssets[0]?.id));
    return other?.id || '';
  });
  const [amount, setAmount] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const fromAsset = storageAssets.find((a) => a.id === fromAssetId);
  const toAsset = storageAssets.find((a) => a.id === toAssetId);

  const handleFromChange = (newFromId: string) => {
    setFromAssetId(newFromId);
    if (toAssetId === newFromId) {
      const other = storageAssets.find((a) => a.id !== newFromId);
      if (other) setToAssetId(other.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      setErrorMsg('Please enter a valid transfer amount.');
      return;
    }
    if (!fromAsset || !toAsset) {
      setErrorMsg('Please select valid origin and destination holdings.');
      return;
    }
    if ((Number(fromAsset.quantity) || 0) < numAmt) {
      setErrorMsg(`Insufficient balance in ${fromAsset.name}. Available: ${fromAsset.quantity} ${fromAsset.unit}`);
      return;
    }
    if ((fromAsset.unit || '').toLowerCase() !== (toAsset.unit || '').toLowerCase()) {
      setErrorMsg(
        `Cannot move ${fromAsset.unit || 'units'} into ${toAsset.unit || 'units'} 1:1. Sell the ${fromAsset.name} to EGP first, or transfer into a holding with the same unit.`
      );
      return;
    }

    const success = transferStorageAsset(fromAsset.id, toAsset.id, numAmt);
    if (success) {
      setAmount('');
      onClose();
    } else {
      setErrorMsg('Transfer could not be completed.');
    }
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" style={{ maxWidth: '480px' }}>
        <div className="dialog-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRightLeft size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Transfer Storage Holding</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px' }}>
          Move funds between accounts or cash holding (e.g. Deposit USD Cash into HSBC USD Account).
        </p>

        {errorMsg && (
          <div style={{ background: 'var(--danger-soft, #fee2e2)', color: 'var(--danger, #dc2626)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
            {errorMsg}
          </div>
        )}

        <label>
          From Holding (Origin)
          <select value={fromAssetId} onChange={(e) => handleFromChange(e.target.value)}>
            {storageAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({formatNativeCurrency(asset.quantity, asset.unit)})
              </option>
            ))}
          </select>
        </label>

        <label>
          To Holding (Destination)
          <select value={toAssetId} onChange={(e) => setToAssetId(e.target.value)}>
            {storageAssets
              .filter((asset) => asset.id !== fromAssetId)
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({formatNativeCurrency(asset.quantity, asset.unit)})
                </option>
              ))}
          </select>
        </label>

        <label>
          Amount to Transfer ({fromAsset?.unit || 'units'})
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder={`Max: ${fromAsset?.quantity || 0}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Complete Transfer
          </button>
        </div>
      </form>
    </dialog>
  );
};
