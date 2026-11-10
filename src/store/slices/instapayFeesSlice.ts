import type { InstaPayFeeConfig } from '../../types';
import { calculateInstaPayFee, DEFAULT_INSTAPAY_FEE_CONFIG, isValidInstaPayFeeConfig, normalizeInstaPayFeeConfig } from '../../engine/instapayFees';
import type { InstaPayFeesSlice, SliceCreator } from './types';
import { STORAGE_KEYS, loadStorage, saveStorage, scheduleAutoDriveSync } from './common';

export const createInstaPayFeesSlice: SliceCreator<InstaPayFeesSlice> = (set, get) => ({
  instapayFeeConfig: normalizeInstaPayFeeConfig(
    loadStorage<unknown>(STORAGE_KEYS.instapayFeeConfig, DEFAULT_INSTAPAY_FEE_CONFIG)
  ),

  updateInstaPayFeeConfig: (config: InstaPayFeeConfig) => {
    if (!isValidInstaPayFeeConfig(config)) {
      throw new Error('Invalid InstaPay fee configuration.');
    }
    const nextConfig = normalizeInstaPayFeeConfig(config);
    return get().runTransaction('Update InstaPay fee settings', () => {
      saveStorage(STORAGE_KEYS.instapayFeeConfig, nextConfig);
      set({ instapayFeeConfig: nextConfig });
      scheduleAutoDriveSync(get);
    });
  },

  recordInstaPayDeduction: ({ entryId, principalAmount, accountKey, date, tag }) => {
    const principal = Math.round(Number(principalAmount) * 100) / 100;
    if (!Number.isFinite(principal) || principal <= 0) throw new Error('InstaPay transfer amount must be positive.');
    const feeAmount = calculateInstaPayFee(principal, get().instapayFeeConfig);
    const totalDeducted = Math.round((principal + feeAmount) * 100) / 100;

    return get().runTransaction('Record InstaPay Deduction', () => {
      const state = get();
      const archived = state.archivedEntries.some((entry) => entry.id === entryId);
      const sourceEntries = archived ? state.archivedEntries : state.entries;
      const index = sourceEntries.findIndex((entry) => entry.id === entryId);
      const entry = sourceEntries[index];
      const account = state.accounts[accountKey];
      if (!entry || !account) throw new Error('InstaPay deduction entry or bank account was not found.');

      const actualTotal = Math.round(Number(state.entryActuals[entryId] ?? entry.actualAmount ?? principal) * 100) / 100;
      const priorPrincipal = Math.max(0, Math.round((actualTotal - principal) * 100) / 100);
      const draws = [...(entry.draws || [])];
      const lastIndex = draws.length - 1;
      const last = draws[lastIndex];
      const lastIsCurrentPayment = Boolean(last)
        && Math.round((Number(last.amount) || 0) * 100) / 100 === principal
        && !last.paymentMethod
        && last.instapayFeeAmount === undefined;

      if (lastIsCurrentPayment) {
        draws[lastIndex] = {
          ...last,
          date: last.date || date,
          tag: tag ?? last.tag,
          account: accountKey,
          paymentMethod: 'instapay',
          instapayFeeAmount: feeAmount,
          instapayFeeBaseAmount: principal,
          instapayFeeRule: { ...state.instapayFeeConfig },
        };
      } else {
        const existingPrincipal = Math.round(draws.reduce((sum, draw) => sum + (Number(draw.amount) || 0), 0) * 100) / 100;
        const missingPriorPrincipal = Math.max(0, Math.round((priorPrincipal - existingPrincipal) * 100) / 100);
        if (missingPriorPrincipal > 0) {
          draws.push({
            id: `draw-${Date.now()}-prior`,
            date: entry.actualDate || entry.date,
            amount: missingPriorPrincipal,
            tag: entry.tag || '',
            account: entry.account || accountKey,
          });
        }
        draws.push({
          id: `draw-${Date.now()}-${draws.length}`,
          date,
          amount: principal,
          tag: tag ?? entry.tag ?? '',
          account: accountKey,
          paymentMethod: 'instapay',
          instapayFeeAmount: feeAmount,
          instapayFeeBaseAmount: principal,
          instapayFeeRule: { ...state.instapayFeeConfig },
        });
      }

      const updatedEntry = { ...entry, account: accountKey, tag: tag ?? entry.tag, draws };
      const updatedEntries = [...sourceEntries];
      updatedEntries[index] = updatedEntry;
      const updatedAccounts = {
        ...state.accounts,
        [accountKey]: { ...account, balance: Math.round((Number(account.balance || 0) - totalDeducted) * 100) / 100 },
      };
      if (archived) {
        saveStorage(STORAGE_KEYS.archivedEntries, updatedEntries);
        set({ archivedEntries: updatedEntries, accounts: updatedAccounts });
      } else {
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries, accounts: updatedAccounts });
      }
      saveStorage(STORAGE_KEYS.accounts, updatedAccounts);
      scheduleAutoDriveSync(get);
      return { feeAmount, totalDeducted };
    });
  },

  refundInstaPayPayments: ({ entryId, refunds }) => {
    return get().runTransaction('Reverse InstaPay Deduction', () => {
      const accounts = { ...get().accounts };
      let totalRefunded = 0;
      for (const refund of refunds) {
        const principal = Math.max(0, Math.round((Number(refund.principalAmount) || 0) * 100) / 100);
        const fee = Math.max(0, Math.round((Number(refund.feeAmount) || 0) * 100) / 100);
        const account = accounts[refund.accountKey];
        if (!account) throw new Error(`Bank account not found while reversing payment ${entryId}.`);
        const refundAmount = Math.round((principal + fee) * 100) / 100;
        accounts[refund.accountKey] = {
          ...account,
          balance: Math.round((Number(account.balance || 0) + refundAmount) * 100) / 100,
        };
        totalRefunded = Math.round((totalRefunded + refundAmount) * 100) / 100;
      }
      saveStorage(STORAGE_KEYS.accounts, accounts);
      set({ accounts });
      scheduleAutoDriveSync(get);
      return totalRefunded;
    });
  },
});
