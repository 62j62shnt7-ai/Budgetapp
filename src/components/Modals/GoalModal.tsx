import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoalModal: React.FC<GoalModalProps> = ({ isOpen, onClose }) => {
  const { addSavingsGoal } = useBudgetStore();
  const [name, setName] = useState<string>('');
  const [target, setTarget] = useState<string>('');
  const [current, setCurrent] = useState<string>('0');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmt = Number(target);
    if (!name.trim() || !targetAmt || targetAmt <= 0) return;
    addSavingsGoal({
      name: name.trim(),
      target: targetAmt,
      current: Number(current) || 0,
    });
    setName('');
    setTarget('');
    setCurrent('0');
    onClose();
  };

  return (
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <form onSubmit={handleSubmit} className="entry-form" id="goalForm">
        <div className="dialog-heading">
          <h3>Add Savings Goal</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <label>
          Goal Name
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Emergency Reserve, Vacation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Target Amount (EGP)
          <input
            name="target"
            type="number"
            step="100"
            min="0"
            required
            placeholder="e.g. 50000"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label>
          Current Saved (EGP)
          <input
            name="current"
            type="number"
            step="100"
            min="0"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <div className="dialog-actions" style={{ marginTop: '16px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save goal
          </button>
        </div>
      </form>
    </dialog>
  );
};
