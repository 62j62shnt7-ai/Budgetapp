import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import type { StorageLocationType } from '../../types';

interface StorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StorageModal: React.FC<StorageModalProps> = ({ isOpen, onClose }) => {
  const { addStorageAsset, rates } = useBudgetStore();

  const [name, setName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<string>('USD');
  const [rateSource, setRateSource] = useState<string>('currency:USD');
  const [rate, setRate] = useState<string>(() => {
    const usd = rates.currencies.find((c) => c.name === 'USD');
    return usd ? String(usd.sell) : '48.5';
  });
  const [locationType, setLocationType] = useState<StorageLocationType>('bank');
  const [location, setLocation] = useState<string>('hsbc');

  if (!isOpen) return null;

  const handleRateSourceChange = (src: string) => {
    setRateSource(src);
    if (src.startsWith('currency:')) {
      const cName = src.replace('currency:', '');
      const found = rates.currencies.find((c) => c.name.toLowerCase() === cName.toLowerCase());
      if (found) {
        setRate(String(found.sell));
        setUnit(cName.toUpperCase());
      }
    } else if (src.startsWith('gold:')) {
      const gName = src.replace('gold:', '');
      const found = rates.gold.find((g) => g.name.toLowerCase() === gName.toLowerCase());
      if (found) {
        setRate(String(found.sell));
        setUnit(gName.toLowerCase().includes('coin') ? 'coins' : 'grams');
      }
    }
  };

  const applyPreset = (
    pName: string,
    pUnit: string,
    pSource: string,
    pLocType: StorageLocationType,
    pLoc: string
  ) => {
    setName(pName);
    setUnit(pUnit);
    setLocationType(pLocType);
    setLocation(pLoc);
    handleRateSourceChange(pSource);
  };

  const numericQty = Number(quantity) || 0;
  const numericRate = Number(rate) || 0;
  const projectedEgp = numericQty * numericRate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || numericQty <= 0 || numericRate <= 0) return;

    let locLabel = 'Storage';
    if (locationType === 'bank') locLabel = location === 'hsbc' ? 'HSBC Account' : location === 'cib' ? 'CIB Account' : `${location.toUpperCase()} Account`;
    else if (locationType === 'cash') locLabel = 'Physical Cash';
    else if (locationType === 'vault') locLabel = 'Physical Vault';

    addStorageAsset({
      name: name.trim(),
      category: rateSource.startsWith('gold:') ? 'Gold' : rateSource.startsWith('currency:') ? 'Currency' : 'Reserve',
      quantity: numericQty,
      unit: unit.trim() || 'units',
      buyPrice: numericRate,
      currency: 'EGP',
      rateSource,
      rate: numericRate,
      locationType,
      location,
      locationLabel: locLabel,
    });

    setName('');
    setQuantity('1');
    setUnit('USD');
    setRateSource('currency:USD');
    setLocationType('bank');
    setLocation('hsbc');
    onClose();
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="storageForm" style={{ maxWidth: '520px' }}>
        <div className="dialog-heading">
          <h3>Add Storage Holding / Reserve</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
            QUICK PRESETS
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('HSBC USD Account', 'USD', 'currency:USD', 'bank', 'hsbc')}
            >
              🏦 HSBC USD
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('HSBC EUR Account', 'EUR', 'currency:EUR', 'bank', 'hsbc')}
            >
              🏦 HSBC EUR
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('CIB USD Account', 'USD', 'currency:USD', 'bank', 'cib')}
            >
              🏦 CIB USD
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('CIB EUR Account', 'EUR', 'currency:EUR', 'bank', 'cib')}
            >
              🏦 CIB EUR
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('USD Cash (Wallet / Safe)', 'USD', 'currency:USD', 'cash', 'cash')}
            >
              💵 USD Cash
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('EUR Cash (Wallet / Safe)', 'EUR', 'currency:EUR', 'cash', 'cash')}
            >
              💵 EUR Cash
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('Gold 21k', 'grams', 'gold:Gold 21', 'vault', 'vault')}
            >
              🪙 Gold 21k
            </button>
            <button
              type="button"
              className="chip-button"
              onClick={() => applyPreset('Gold 24k Bar', 'grams', 'gold:Gold 24', 'vault', 'vault')}
            >
              🪙 Gold 24k
            </button>
          </div>
        </div>

        <label>
          Asset Name
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. HSBC USD Account, USD Cash, Gold 21k..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Custody / Where Held
            <select
              value={`${locationType}:${location}`}
              onChange={(e) => {
                const [lt, loc] = e.target.value.split(':') as [StorageLocationType, string];
                setLocationType(lt);
                setLocation(loc);
              }}
            >
              <option value="bank:hsbc">🏦 HSBC Bank Account</option>
              <option value="bank:cib">🏦 CIB Bank Account</option>
              <option value="cash:cash">💵 Physical Cash / Wallet</option>
              <option value="vault:vault">🔒 Physical Vault / Safe</option>
              <option value="other:other">📁 Other Storage</option>
            </select>
          </label>

          <label>
            Unit / Currency
            <input
              name="unit"
              type="text"
              placeholder="USD, EUR, grams, coins"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>
            Quantity / Balance
            <input
              name="quantity"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="e.g. 1500"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>

          <label>
            Rate Source
            <select value={rateSource} onChange={(e) => handleRateSourceChange(e.target.value)}>
              <option value="manual">Manual Rate</option>
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
        </div>

        <label>
          Rate (EGP per unit)
          <input
            name="rate"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="e.g. 48.50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>

        {/* Live Total Value Preview */}
        {projectedEgp > 0 && (
          <div
            style={{
              background: 'var(--surface-soft)',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              marginTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Estimated Value in EGP:</span>
            <strong style={{ fontSize: '1.1rem', color: 'var(--ink)' }}>{formatMoney(projectedEgp)}</strong>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save Asset
          </button>
        </div>
      </form>
    </dialog>
  );
};

