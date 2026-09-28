import type { CashEntry } from '../types';

/**
 * Infer a human-friendly tag for an entry from its category/source/creditType.
 * Pure and dependency-free so both the store and engine modules (migration) can use it.
 */
export function inferTag(entry: Partial<CashEntry>): string {
  const category = (entry.category || '').toLowerCase();
  const source = (entry.source || '').toLowerCase();
  const creditType = (entry.creditType || '').toLowerCase();
  if (creditType === 'cib' || creditType === 'hsbc' || category.includes('credit due')) return 'Credit';
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
