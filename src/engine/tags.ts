import type { CashEntry } from '../types';
import { isCreditCardExpense, isCreditSettlementRow } from './creditCards';

/**
 * Infer a human-friendly tag for an entry from its category/source/creditType.
 * Pure and dependency-free so both the store and engine modules (migration) can use it.
 */
export function inferTag(entry: Partial<CashEntry>): string {
  const asEntry = entry as CashEntry;
  const category = (entry.category || '').toLowerCase();
  const source = (entry.source || '').toLowerCase();
  const creditType = (entry.creditType || '').toLowerCase();
  const account = (entry.account || '').toLowerCase();
  const tag = (entry.tag || '').toLowerCase();

  // Credit swipes (card expenses on CIB, HSBC, or any credit card account/source)
  if (
    isCreditCardExpense(asEntry) ||
    creditType === 'cib_card' ||
    creditType === 'hsbc_card' ||
    source === 'credit card' ||
    source.includes('credit card') ||
    source.includes('card swipe') ||
    tag.includes('credit card') ||
    tag.includes('credit swipe') ||
    tag.includes('card spend')
  ) {
    return 'Credit Swipes';
  }

  // Credit settlements (CIB & HSBC credit dues, lump sums, recurring credit)
  if (
    isCreditSettlementRow(asEntry) ||
    creditType === 'cib' ||
    creditType === 'hsbc' ||
    category.includes('credit due') ||
    category.includes('settlement') ||
    source.includes('recurring credit') ||
    (account.includes('cib') && category.includes('credit') && !isCreditCardExpense(asEntry)) ||
    (account.includes('hsbc') && category.includes('credit') && !isCreditCardExpense(asEntry)) ||
    category.includes('cib credit') ||
    category.includes('hsbc credit') ||
    Boolean(entry.id && entry.id.startsWith('credit-settlement-'))
  ) {
    return 'Credit Settlement';
  }

  if (source.includes('loan') || category.includes('loan') || category.includes('repayment')) return 'Loan';
  if (source === 'salary' || category === 'salary' || category.includes('bonus')) return 'Salary';
  if (source.includes('part-time') || category.includes('freelance')) return 'Part-Time';
  if (/electric|mobile|phone|internet|wifi|gas|water|utility|bills/.test(category)) return 'Bills';
  if (/kids|school|tuition|nursery|course/.test(category)) return 'Kids';
  if (/food|grocer|supermarket|market|^home$/.test(category)) return 'Food';
  if (/fix|repair|maintenance/.test(category)) return 'Maintenance';
  if (/amazon|noon|shopping/.test(category)) return 'Shopping';
  if (/medical|pharmacy|doctor|hospital|medicine/.test(category)) return 'Medical';
  if (source === 'installment' || category.includes('installment')) return 'Installment';
  return '';
}

/**
 * Extract all unique, normalized tags for an entry (combining tag, subcategory, draws, and inferred credit roles).
 */
export function getEntryTags(entry: CashEntry): string[] {
  const tags: string[] = [];
  const pushTag = (t: string) => {
    const trimmed = t.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const normalized = (lower === 'credit' || lower === 'credit card' || lower === 'card spend')
      ? (isCreditSettlementRow(entry) ? 'Credit Settlement' : isCreditCardExpense(entry) ? 'Credit Swipes' : trimmed)
      : trimmed;
    if (!tags.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      tags.push(normalized);
    }
  };

  if (entry.tag && entry.tag.trim()) {
    entry.tag.split(',').forEach(pushTag);
  }
  if (entry.subcategory && entry.subcategory.trim()) {
    entry.subcategory.split(',').forEach(pushTag);
  }
  (entry.draws || []).forEach((draw) => {
    if (draw.tag && draw.tag.trim()) {
      draw.tag.split(',').forEach(pushTag);
    }
  });

  if (isCreditSettlementRow(entry)) {
    if (!tags.some((t) => t.toLowerCase() === 'credit settlement')) {
      tags.push('Credit Settlement');
    }
  } else if (isCreditCardExpense(entry)) {
    if (!tags.some((t) => t.toLowerCase() === 'credit swipes')) {
      tags.push('Credit Swipes');
    }
  }

  return tags;
}
