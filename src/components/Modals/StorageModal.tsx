import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface StorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StorageModal: React.FC<StorageModalProps> = ({ isOpen, onClose }) => {
  const { addStorageAsset, rates } = useBudgetStore();

  const [name, setName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<string>('grams');
  const [rateSource, setRateSource] = useState<string>('manual');
  const [rate, setRate] = useState<string>('');

  if (!isOpen) return null;

  const handleRateSourceChange = (src: string) => {
    setRateSource(src);
    if (src.startsWith('currency:')) {
      const cName = src.replace('currency:', '');
      const found = rates.currencies.find((c) => c.name.toLowerCase() === cName.toLowerCase());
      if (found) setRate(String(found.sell));
    } else if (src.startsWith('gold:')) {
      const gName = src.replace('gold:', '');
      const found = rates.gold.find((g) => g.name.toLowerCase() === gName.toLowerCase());
      if (found) setRate(String(found.sell));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    const rateVal = Number(rate);
    if (!name.trim() || !qty || qty <= 0 || !rateVal || rateVal <= 0) return;

    addStorageAsset({
      name: name.trim(),
      category: rateSource.startsWith('gold:') ? 'Gold' : rateSource.startsWith('currency:') ? 'Currency' : 'Reserve',
      quantity: qty,
      unit: unit.trim() || 'units',
      buyPrice: rateVal,
      currency: 'EGP',
      rateSource,
      rate: rateVal,
    } as any);

    setName('');
    setQuantity('1');
    setUnit('grams');
    setRateSource('manual');
    setRate('');
    onClose();
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="storageForm">
        <div className="dialog-heading">
          <h3>Add storage asset</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <label>
          Asset name
          <input
            name="name"
            type="text"
            required
            placeholder="USD, Gold 21, Savings, Silver..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Quantity
          <input
            name="quantity"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Unit
          <input
            name="unit"
            type="text"
            placeholder="grams, dollars, euros, coins"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label>
          Rate source
          <select value={rateSource} onChange={(e) => handleRateSourceChange(e.target.value)}>
            <option value="manual">Manual entry</option>
            <optgroup label="Currencies">
              {rates.currencies.map((c) => (
                <option key={c.name} value={`currency:${c.name}`}>
                  {c.name} ({c.sell})
                </option>
              ))}
            </optgroup>
            <optgroup label="Gold karats">
              {rates.gold.map((g) => (
                <option key={g.name} value={`gold:${g.name}`}>
                  {g.name} ({g.sell})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Rate (EGP per unit)
          <input
            name="rate"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="e.g. 50.00"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save asset
          </button>
        </div>
      </form>
    </dialog>
  );
};
