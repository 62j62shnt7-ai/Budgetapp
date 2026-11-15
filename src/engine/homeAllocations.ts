import type { CashEntry, EntryDraw, InstaPayFeeConfig } from '../types';
import { isCreditCardExpense, isCreditSettlementRow } from './creditCards';
import { DateUtils } from './dateUtils';
import { getEntryActualAmount } from './forecast';
import { calculateInstaPayFee } from './instapayFees';

interface HomePaymentPart {
  date: string;
  amount: number;
  requested: number;
  drawIndex?: number;
}

interface HomeAllocation {
  key: string;
  entryId: string;
  date: string;
  category: string;
  amount: number;
}

export interface HomeAdjustment {
  month: string;
  capacity: number;
  total: number;
  payments: HomeAllocation[];
}

const round = (value: number) => Math.round(value * 100) / 100;
const principal = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? round(value) : 0;

function isDirectExpense(entry: CashEntry) {
  return entry.type === 'expense' && !entry.locked && !entry.conversionType &&
    !entry.excludeFromForecast && !isCreditCardExpense(entry) && !isCreditSettlementRow(entry);
}

export function isHomeExpense(entry: CashEntry) {
  return isDirectExpense(entry) && entry.category.trim().toLowerCase() === 'home';
}

export function getHomePlanAmount(entry: CashEntry) {
  return isHomeExpense(entry) && entry.isClosed && entry.initialAmount !== undefined
    ? entry.initialAmount : entry.amount;
}

export function projectHomeActuals(
  actuals: Record<string, number>,
  entries: CashEntry[],
  allocations: Map<string, HomeAdjustment[]>
) {
  const projected = { ...actuals };
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const adjustments = allocations.get(entry.id);
    if (!adjustments) continue;
    const allocated = adjustments.reduce((sum, row) => round(sum + row.total), 0);
    if (allocated > 0) {
      projected[entry.id] = Math.max(0, round(getEntryActualAmount(entry, actuals) - allocated));
    }
  }
  return projected;
}

function getPaymentParts(
  entry: CashEntry,
  actuals: Record<string, number>,
  dates: Record<string, string>
) {
  if (entry.draws?.length) {
    return entry.draws.map((draw, drawIndex) => ({
      date: draw.date,
      amount: principal(draw.amount),
      requested: principal(draw.paidFromHome),
      account: draw.account || entry.account,
      storageAssetId: draw.storageAssetId,
      drawIndex,
    }));
  }
  return [{
    date: dates[entry.id] || entry.actualDate || entry.date,
    amount: principal(getEntryActualAmount(entry, actuals)),
    requested: principal(entry.paidFromHome),
    account: entry.account,
    storageAssetId: entry.storageAssetId,
  }];
}

export function getHomePaymentParts(
  entry: CashEntry,
  actuals: Record<string, number>,
  dates: Record<string, string>
): HomePaymentPart[] {
  if (!isDirectExpense(entry) || isHomeExpense(entry)) return [];
  return getPaymentParts(entry, actuals, dates).filter((part) =>
    part.account?.trim().toLowerCase() === 'none' && !part.storageAssetId && part.amount > 0
  );
}

export function homePaymentKey(entryId: string, drawIndex?: number) {
  return JSON.stringify([entryId, drawIndex ?? null]);
}

export function splitHomePayment(
  payment: EntryDraw,
  homeAmount: number,
  bankAccount: string,
  feeRule?: InstaPayFeeConfig
): EntryDraw[] {
  const bankAmount = round(payment.amount - homeAmount);
  const homeDraw: EntryDraw = { ...payment, account: 'none', amount: homeAmount, paidFromHome: homeAmount };
  if (bankAmount === 0) return [homeDraw];
  const { id, ...paymentDetails } = payment;
  const bankDraw: EntryDraw = {
    ...paymentDetails,
    id: id ? `${id}-bank` : undefined,
    account: bankAccount,
    amount: bankAmount,
    ...(feeRule ? {
      paymentMethod: 'instapay',
      instapayFeeAmount: calculateInstaPayFee(bankAmount, feeRule),
      instapayFeeBaseAmount: bankAmount,
      instapayFeeRule: { ...feeRule },
    } : {}),
  };
  return [bankDraw, homeDraw];
}

export function buildHomeAllocations(
  entries: CashEntry[],
  actuals: Record<string, number> = {},
  dates: Record<string, string> = {}
) {
  const targets = new Map<string, { entryId: string; adjustment: HomeAdjustment }[]>();
  const seen = new Set<string>();
  const payments: HomeAllocation[] = [];

  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (isHomeExpense(entry)) {
      const months = new Map<string, number>();
      for (const part of getPaymentParts(entry, actuals, dates)) {
        const month = DateUtils.getMonthKey(part.date);
        if (month && part.amount > 0) months.set(month, round((months.get(month) ?? 0) + part.amount));
      }
      for (const [month, capacity] of months) {
        const monthTargets = targets.get(month) ?? [];
        monthTargets.push({ entryId: entry.id, adjustment: { month, capacity, total: 0, payments: [] } });
        targets.set(month, monthTargets);
      }
    } else {
      for (const part of getHomePaymentParts(entry, actuals, dates)) {
        if (part.requested <= 0) continue;
        payments.push({
          key: homePaymentKey(entry.id, part.drawIndex),
          entryId: entry.id,
          date: part.date,
          category: entry.category,
          amount: Math.min(part.amount, part.requested),
        });
      }
    }
  }

  for (const monthTargets of targets.values()) {
    monthTargets.sort((a, b) => b.adjustment.capacity - a.adjustment.capacity || a.entryId.localeCompare(b.entryId));
  }
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  for (const payment of payments) {
    let remaining = payment.amount;
    for (const { adjustment } of targets.get(DateUtils.getMonthKey(payment.date)) ?? []) {
      const amount = Math.min(remaining, round(adjustment.capacity - adjustment.total));
      if (amount <= 0) continue;
      adjustment.payments.push({ ...payment, amount });
      adjustment.total = round(adjustment.total + amount);
      remaining = round(remaining - amount);
      if (remaining <= 0) break;
    }
  }

  const result = new Map<string, HomeAdjustment[]>();
  for (const { entryId, adjustment } of Array.from(targets.values()).flat()) {
    const adjustments = result.get(entryId) ?? [];
    adjustments.push(adjustment);
    result.set(entryId, adjustments);
  }
  return result;
}

export function summarizeHomeAllocations(allocations: Map<string, HomeAdjustment[]>) {
  const months = new Map<string, HomeAdjustment>();
  for (const { month, capacity, total, payments } of Array.from(allocations.values()).flat()) {
    const summary = months.get(month) ?? { month, capacity: 0, total: 0, payments: [] };
    summary.capacity = round(summary.capacity + capacity);
    summary.total = round(summary.total + total);
    summary.payments.push(...payments);
    months.set(month, summary);
  }
  return months;
}

export function apportionHomeReduction(total: number, amounts: Record<string, number>) {
  const reductions = new Map<string, number>();
  let remaining = total;
  let remainingGross = Object.values(amounts).reduce((sum, amount) => round(sum + amount), 0);
  // Month-wide allocations do not identify a source tag.
  for (const [tag, amount] of Object.entries(amounts)) {
    if (remaining <= 0 || remainingGross <= 0) break;
    const reduction = Math.min(amount, remaining, round(remaining * amount / remainingGross));
    reductions.set(tag, reduction);
    remaining = round(remaining - reduction);
    remainingGross = round(remainingGross - amount);
  }
  return reductions;
}

export function indexHomeFunding(allocations: Map<string, HomeAdjustment[]>) {
  const payments = new Map<string, { homeEntryId: string; month: string; amount: number }>();
  const entries = new Map<string, Map<string, { homeEntryId: string; month: string; amount: number }>>();
  for (const [homeEntryId, adjustments] of allocations) {
    for (const { month, payments: allocatedPayments } of adjustments) {
      for (const payment of allocatedPayments) {
        const existing = payments.get(payment.key);
        payments.set(payment.key, {
          homeEntryId: existing?.homeEntryId ?? homeEntryId, month,
          amount: round((existing?.amount ?? 0) + payment.amount),
        });
        const months = entries.get(payment.entryId) ?? new Map();
        const monthAmount = months.get(month)?.amount ?? 0;
        months.set(month, { homeEntryId: months.get(month)?.homeEntryId ?? homeEntryId, month, amount: round(monthAmount + payment.amount) });
        entries.set(payment.entryId, months);
      }
    }
  }
  return { payments, entries };
}
