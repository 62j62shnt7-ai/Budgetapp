import React, { useState, useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface RateModalProps {
  isOpen: boolean;
  rateType?: 'currency' | 'gold';
  onClose: () => void;
}

export const RateModal: React.FC<RateModalProps> = ({ isOpen, rateType = 'currency', onClose }) => {
  const { rates, updateRates } = useBudgetStore();

  const [selectedItemName, setSelectedItemName] = useState<string>('');
  const [sell, setSell] = useState<string>('');
  const [buy, setBuy] = useState<string>('');

  const items = rateType === 'currency' ? rates.currencies : rates.gold;

  useEffect(() => {
    if (items.length > 0) {
      setSelectedItemName(items[0].name);
      setSell(String(items[0].sell));
      setBuy(String(items[0].buy));
    }
  }, [rateType, isOpen]);

  const handleItemSelect = (name: string) => {
    setSelectedItemName(name);
    const found = items.find((i) => i.name === name);
    if (found) {
      setSell(String(found.sell));
      setBuy(String(found.buy));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sellVal = Number(sell);
    const buyVal = Number(buy);
    if (!selectedItemName || !sellVal || !buyVal) return;

    const copy = JSON.parse(JSON.stringify(rates));
    const now = new Date().toISOString();
    if (rateType === 'currency') {
      const idx = copy.currencies.findIndex((c: any) => c.name === selectedItemName);
      if (idx !== -1) {
        copy.currencies[idx].sell = sellVal;
        copy.currencies[idx].buy = buyVal;
        copy.currenciesLastFetched = now;
        if (!copy.goldLastFetched && copy.lastFetched) {
          copy.goldLastFetched = copy.lastFetched;
        }
      }
    } else {
      const idx = copy.gold.findIndex((g: any) => g.name === selectedItemName);
      if (idx !== -1) {
        copy.gold[idx].sell = sellVal;
        copy.gold[idx].buy = buyVal;
        copy.goldLastFetched = now;
        if (!copy.currenciesLastFetched && copy.lastFetched) {
          copy.currenciesLastFetched = copy.lastFetched;
        }
      }
    }
    copy.lastFetched = now;

    updateRates(copy, true);
    onClose();
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="rateForm">
        <div className="dialog-heading">
          <h3>Update {rateType === 'currency' ? 'Currency' : 'Gold'} Rate</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        <label>
          Item
          <select value={selectedItemName} onChange={(e) => handleItemSelect(e.target.value)}>
            {items.map((i) => (
              <option key={i.name} value={i.name}>{i.name}</option>
            ))}
          </select>
        </label>

        <label>
          Sell Rate (EGP)
          <input
            name="sell"
            type="number"
            step="0.01"
            required
            value={sell}
            onChange={(e) => setSell(e.target.value)}
          />
        </label>

        <label>
          Buy Rate (EGP)
          <input
            name="buy"
            type="number"
            step="0.01"
            required
            value={buy}
            onChange={(e) => setBuy(e.target.value)}
          />
        </label>

        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save rate
          </button>
        </div>
      </form>
    </dialog>
  );
};
