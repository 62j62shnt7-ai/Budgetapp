import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface CapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CapModal: React.FC<CapModalProps> = ({ isOpen, onClose }) => {
  const { setCategoryCap } = useBudgetStore();
  const [category, setCategory] = useState<string>('');
  const [cap, setCap] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(cap);
    if (!category.trim() || !val || val <= 0) return;
    setCategoryCap(category.trim(), val);
    setCategory('');
    setCap('');
    onClose();
  };

  return (
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="capForm">
        <div className="dialog-heading">
          <h3>Set Category Budget Cap</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <label>
          Category
          <input
            name="category"
            type="text"
            list="expenseCategories"
            required
            placeholder="e.g. Home, Bills, Food"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label>
          Monthly Cap Limit (EGP)
          <input
            name="cap"
            type="number"
            step="100"
            min="0"
            required
            placeholder="e.g. 10000"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save cap
          </button>
        </div>
      </form>
    </dialog>
  );
};
