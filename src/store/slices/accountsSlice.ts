import type { AccountBalance, CashEntry, CreditSettlementOverride } from '../../types';
import type { SliceCreator, AccountsSlice } from './types';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  defaultAccounts,
  scheduleAutoGistSync,
} from './common';
import {
  buildCreditDueEntries,
  getCreditSettlementMonth,
  isCardExpenseForAccount,
  isLumpCreditDueForAccount,
} from '../../engine/creditCards';
import { formatMoney } from '../../engine/dateUtils';

export const createAccountsSlice: SliceCreator<AccountsSlice> = (set, get) => ({
  accounts: loadStorage<Record<string, AccountBalance>>(STORAGE_KEYS.accounts, defaultAccounts),
  creditDues: loadStorage<Record<string, Record<string, number>>>(STORAGE_KEYS.creditDues, {}),
  creditDueMonths: loadStorage<Record<string, string[]>>(STORAGE_KEYS.creditDueMonths, {}),
  creditSettlementOverrides: loadStorage<Record<string, CreditSettlementOverride>>(
    STORAGE_KEYS.creditSettlementOverrides,
    {}
  ),

  updateAccountBalance: (accountKey, newBalance) => {
    const accName = get().accounts[accountKey]?.name || accountKey.toUpperCase();
    return get().runTransaction(`Update ${accName} Balance`, () => {
      const accounts = { ...get().accounts };
      if (accounts[accountKey]) {
        accounts[accountKey] = { ...accounts[accountKey], balance: Math.round(newBalance * 100) / 100 };
        saveStorage(STORAGE_KEYS.accounts, accounts);
        set({ accounts });
        scheduleAutoGistSync(get);
      }
    });
  },

  transferAccountFunds: (fromAccountKey, toAccountKey, amount, note) => {
    const fromAcc = get().accounts[fromAccountKey];
    const toAcc = get().accounts[toAccountKey];
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!fromAcc || !toAcc || amt <= 0 || fromAccountKey === toAccountKey) return false;
    const label = note || `Transfer ${formatMoney(amt)} from ${fromAcc.name} to ${toAcc.name}`;
    get().runTransaction(label, () => {
      const accounts = { ...get().accounts };
      accounts[fromAccountKey] = {
        ...accounts[fromAccountKey],
        balance: Math.round((Number(accounts[fromAccountKey].balance || 0) - amt) * 100) / 100,
      };
      accounts[toAccountKey] = {
        ...accounts[toAccountKey],
        balance: Math.round((Number(accounts[toAccountKey].balance || 0) + amt) * 100) / 100,
      };
      saveStorage(STORAGE_KEYS.accounts, accounts);
      set({ accounts });
      scheduleAutoGistSync(get);
    });
    return true;
  },

  updateCreditSettlementOverride: (id, override) => {
    return get().runTransaction('Update Credit Settlement', () => {
      const next = { ...get().creditSettlementOverrides };
      if (Object.keys(override).length === 0) delete next[id];
      else next[id] = { ...next[id], ...override };
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, next);
      set({ creditSettlementOverrides: next });
      scheduleAutoGistSync(get);
    });
  },

  recalculateCreditSettlement: (id) => {
    const current = get().creditSettlementOverrides;
    const next = { ...current };
    const existingOverride = current[id];
    delete next[id];
    if (existingOverride?.date) next[id] = { date: existingOverride.date };
    const parts = id.split('-');
    const accountKey = parts[2];
    const monthKey = parts.length === 5 ? `${parts[3]}-${parts[4]}` : '';
    const allExpenses = [...get().entries, ...get().archivedEntries].filter(
      (entry) => entry.type === 'expense'
    );
    const actual = (entry: CashEntry) =>
      get().entryActuals[entry.id] !== undefined
        ? Number(get().entryActuals[entry.id]) || 0
        : Number(entry.actualAmount) || 0;
    const cardExpenses = allExpenses.filter((entry) => {
      const effective = get().entryActualDates[entry.id]
        ? { ...entry, actualDate: get().entryActualDates[entry.id] }
        : entry;
      return (
        isCardExpenseForAccount(effective, accountKey) &&
        getCreditSettlementMonth(effective, next) === monthKey
      );
    });
    const lumpEntries = allExpenses.filter(
      (entry) =>
        isLumpCreditDueForAccount(entry, accountKey) &&
        entry.id !== id &&
        entry.date.slice(0, 7) === monthKey
    );
    const monthData = get().creditDues[accountKey] || {};
    const calculatedAmount =
      Number(monthData[monthKey] || 0) +
      cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0) +
      lumpEntries.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0);
    const generated = buildCreditDueEntries({
      accounts: get().accounts,
      creditDues: get().creditDues,
      cashEntries: get().entries,
      archivedEntries: get().archivedEntries,
      entryActuals: get().entryActuals,
      entryActualDates: get().entryActualDates,
      creditSettlementOverrides: next,
    }).find((entry) => entry.id === id);
    if (generated) {
      return {
        ...generated,
        amount: calculatedAmount,
        calculatedAmount,
        cardSpendTotal: cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0),
        cardExpenseCount: cardExpenses.length,
      };
    }

    if (parts.length !== 5) return undefined;
    const [year, month] = monthKey.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const account = Object.entries(get().accounts).find(([key]) => key.toLowerCase() === accountKey)?.[1];
    const day = Math.min(Number(account?.maturityDay) || (accountKey === 'cib' ? 15 : lastDay), lastDay);
    return {
      id,
      date: existingOverride?.date || `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      category: `${account?.name || accountKey.toUpperCase()} Credit Due`,
      account: accountKey,
      type: 'expense',
      amount: calculatedAmount,
      creditType: accountKey,
      isCreditSettlement: true,
      source: 'recurring credit',
      tag: 'Credit',
      calculatedAmount,
      cardExpenseCount: cardExpenses.length,
      cardSpendTotal: cardExpenses.reduce((sum, entry) => sum + (actual(entry) > 0 ? actual(entry) : Number(entry.amount) || 0), 0),
      isClosed: existingOverride?.isClosed ?? false,
    };
  },
});
