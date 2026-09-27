import type { CashEntry } from '../types';
import { formatMoney } from '../engine/dateUtils';
import { formatNativeCurrency } from '../engine/currency';

export interface RecurringCandidateGroup {
  key: string;
  name: string;
  category: string;
  subcategory?: string;
  amount: number;
  currency?: string;
  amountFormatted: string;
  type: 'income' | 'expense';
  account?: string;
  entryIds: string[];
  entries: CashEntry[];
  isFullyLinked: boolean;
  existingSeriesId?: string;
  earliestDate: string;
  latestDate: string;
  estimatedFrequency: string;
}

/**
 * Normalizes an entry's title/category for grouping
 */
export function normalizeEntryKey(entry: CashEntry): string {
  const normCategory = (entry.category || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const normSubcategory = (entry.subcategory || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const primaryName = normSubcategory && normSubcategory !== normCategory ? `${normCategory} - ${normSubcategory}` : normCategory;
  const normType = entry.type || 'expense';
  const normAmount = Number(entry.amount || 0);
  const normCurr = (entry.currency || 'EGP').toUpperCase();
  return `${normType}::${primaryName}::${normAmount}::${normCurr}`;
}

/**
 * Estimates frequency (e.g., Monthly, Bi-weekly, Weekly) based on date intervals
 */
function estimateFrequency(dates: string[]): string {
  if (dates.length < 2) return 'Single';
  const sorted = [...dates].sort();
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1]).getTime();
    const d2 = new Date(sorted[i]).getTime();
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) intervals.push(diffDays);
  }
  if (intervals.length === 0) return 'Variable';
  const avgDays = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
  if (avgDays >= 25 && avgDays <= 35) return 'Monthly';
  if (avgDays >= 80 && avgDays <= 100) return 'Quarterly';
  if (avgDays >= 12 && avgDays <= 16) return 'Bi-weekly';
  if (avgDays >= 6 && avgDays <= 8) return 'Weekly';
  if (avgDays >= 350 && avgDays <= 375) return 'Annual';
  return `Every ~${Math.round(avgDays)} days`;
}

/**
 * Scans a list of cash entries and detects candidate recurring groups based on matching name & amount.
 * Only scans active unactualized forecast entries (ignores history/actualized entries).
 */
export function detectRecurringCandidateGroups(
  entries: CashEntry[],
  entryActuals: Record<string, number> = {}
): RecurringCandidateGroup[] {
  const map = new Map<string, CashEntry[]>();

  (entries || []).forEach((entry) => {
    // Ignore dynamic installment occurrences or opening balance records
    if (entry.source === 'installment' || entry.id.startsWith('installment-') || entry.source === 'starting balance') {
      return;
    }
    // Ignore historical / actualized records
    const actual = entryActuals[entry.id] ?? (entry.actualAmount !== undefined && entry.actualAmount !== null ? Number(entry.actualAmount) || 0 : (entry.isClosed ? Number(entry.amount) || 0 : 0));
    if (actual > 0 || entry.isClosed) {
      return;
    }
    const key = normalizeEntryKey(entry);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  });

  const groups: RecurringCandidateGroup[] = [];

  map.forEach((groupedEntries, key) => {
    // Only consider groups with 2 or more occurrences
    if (groupedEntries.length < 2) return;

    const first = groupedEntries[0];
    const isForeign = (first.currency || 'EGP').toUpperCase() !== 'EGP';
    const amountFormatted = isForeign
      ? `${formatNativeCurrency(first.originalAmount || first.amount, first.currency!)} (≈ ${formatMoney(first.amount)})`
      : formatMoney(first.amount);

    const sortedEntries = [...groupedEntries].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sortedEntries.map((e) => e.date);
    const seriesIds = new Set(sortedEntries.map((e) => e.seriesId).filter(Boolean));
    const isFullyLinked = seriesIds.size === 1 && sortedEntries.every((e) => Boolean(e.seriesId));
    const existingSeriesId = seriesIds.size === 1 ? Array.from(seriesIds)[0] : undefined;

    const displayName = first.subcategory && first.subcategory !== first.category
      ? `${first.category} (${first.subcategory})`
      : first.category;

    groups.push({
      key,
      name: displayName,
      category: first.category,
      subcategory: first.subcategory,
      amount: Number(first.amount || 0),
      currency: first.currency,
      amountFormatted,
      type: first.type || 'expense',
      account: first.account,
      entryIds: sortedEntries.map((e) => e.id),
      entries: sortedEntries,
      isFullyLinked,
      existingSeriesId,
      earliestDate: dates[0],
      latestDate: dates[dates.length - 1],
      estimatedFrequency: estimateFrequency(dates),
    });
  });

  // Sort: unlinked candidates first, then by count descending
  return groups.sort((a, b) => {
    if (a.isFullyLinked !== b.isFullyLinked) {
      return a.isFullyLinked ? 1 : -1;
    }
    return b.entries.length - a.entries.length;
  });
}

/**
 * Links given entry IDs to a unified seriesId and marks isRecurring = true
 */
export function linkEntriesToSeries(
  entries: CashEntry[],
  entryIds: string[],
  customSeriesId?: string
): { updatedEntries: CashEntry[]; seriesId: string; modifiedCount: number } {
  const idSet = new Set(entryIds);
  const targetEntries = entries.filter((e) => idSet.has(e.id));
  const existingSeries = targetEntries.find((e) => e.seriesId)?.seriesId;
  const seriesId = customSeriesId || existingSeries || `series-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let modifiedCount = 0;
  const updatedEntries = entries.map((entry) => {
    if (idSet.has(entry.id)) {
      if (entry.seriesId !== seriesId || !entry.isRecurring) {
        modifiedCount++;
        return {
          ...entry,
          seriesId,
          isRecurring: true,
        };
      }
    }
    return entry;
  });

  return { updatedEntries, seriesId, modifiedCount };
}

/**
 * Unlinks entries from a seriesId
 */
export function unlinkEntriesFromSeries(
  entries: CashEntry[],
  seriesId: string
): { updatedEntries: CashEntry[]; modifiedCount: number } {
  let modifiedCount = 0;
  const updatedEntries = entries.map((entry) => {
    if (entry.seriesId === seriesId) {
      modifiedCount++;
      const next = { ...entry };
      delete next.seriesId;
      next.isRecurring = false;
      return next;
    }
    return entry;
  });

  return { updatedEntries, modifiedCount };
}
