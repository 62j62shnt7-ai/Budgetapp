// ==========================================================================
// Jobs Calculation Engine (ASF, IRQ, Part-Time Jobs)
// ==========================================================================
import type { JobItem, RatesData } from '../types';
import { getCurrencyRate, normalizeCurrencyCode } from './currency';
export interface JobFinancials {
  type: string;
  currency: string;
  totalDays: number;
  grossFee: number;
  billableExpenses: number;
  deductibleExpenses: number;
  totalInvoice: number;
  netEarnings: number;
  totalPaid: number;
  remainingBalance: number;
  percentPaid: number;
  computedStatus: 'active' | 'invoiced' | 'partial' | 'paid';
  fxRate: number;
  /** True when the job's currency has no rate, so the `*Egp` fields are not meaningful. */
  fxRateMissing: boolean;
  totalInvoiceEgp: number;
  netEarningsEgp: number;
  grossFeeEgp: number;
  billableExpensesEgp: number;
  totalPaidEgp: number;
  remainingBalanceEgp: number;
  // Backward compatibility fields:
  grossEarned: number;
  grossEarnedEgp: number;
  netEarned: number;
  netEarnedEgp: number;
  unpaidBalance: number;
  unpaidBalanceEgp: number;
  totalPayments: number;
  totalExpenses: number;
  totalLoggedDays: number;
  totalLoggedHours: number;
  exchangeRate: number;
}

export function calculateJobFinancials(job: JobItem, rates: RatesData): JobFinancials {
  const type = job.type || (job.rateType === 'fixed' ? 'lumpsum' : 'daily_rate');
  const currency = normalizeCurrencyCode(job.currency) || 'USD';
  const resolvedRate = getCurrencyRate(rates, currency);
  // A currency the rate table does not know must not be treated as parity with
  // EGP: doing so understates every EGP figure by the whole exchange rate.
  // Fall back to 1 only so the *_Egp fields stay numeric, and flag it so the UI
  // can show that the EGP column is unreliable.
  const fxRateMissing = resolvedRate === null;
  const fxRate = resolvedRate === null ? 1 : resolvedRate;

  const daysWorked = Array.isArray(job.daysWorked)
    ? job.daysWorked
    : Array.isArray(job.logs)
    ? job.logs
    : [];

  const expenses = Array.isArray(job.expenses) ? job.expenses : [];
  const payments = Array.isArray(job.payments) ? job.payments : [];

  const totalDays = daysWorked.reduce((sum, d) => sum + (d.units !== undefined && d.units !== null ? Number(d.units) : 1), 0);
  const totalLoggedHours = daysWorked.reduce((sum, d) => sum + (Number(d.hours) || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  let grossFee = 0;
  if (type === 'daily_rate' || job.rateType === 'daily') {
    const defaultRate = Number(job.dailyRate) || Number(job.rateAmount) || 0;
    if (daysWorked.length > 0) {
      grossFee = daysWorked.reduce((sum, d) => {
        const logRate = d.rate !== undefined && d.rate !== null ? Number(d.rate) : defaultRate;
        const units = d.units !== undefined && d.units !== null ? Number(d.units) : 1;
        return sum + (logRate * units);
      }, 0);
    } else {
      grossFee = Number(job.lumpSumAmount) || Number(job.forecastAmount) || 0;
    }
  } else if (job.rateType === 'hourly') {
    const rate = Number(job.rateAmount) || 0;
    if (totalLoggedHours > 0) {
      grossFee = rate * totalLoggedHours;
    } else {
      grossFee = Number(job.forecastAmount) || 0;
    }
  } else {
    grossFee = Number(job.lumpSumAmount) || Number(job.rateAmount) || Number(job.forecastAmount) || 0;
  }

  let billableExpenses = 0;
  let deductibleExpenses = 0;
  expenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.isReimbursable !== false) {
      billableExpenses += amt;
    } else {
      deductibleExpenses += amt;
    }
  });

  const totalInvoice = grossFee + billableExpenses;
  const netEarnings = grossFee - deductibleExpenses;

  const remainingBalance = Math.max(0, Math.round((totalInvoice - totalPaid) * 100) / 100);
  const percentPaid = totalInvoice > 0 ? Math.min(100, Math.round((totalPaid / totalInvoice) * 100)) : (totalPaid > 0 ? 100 : 0);

  let computedStatus: 'active' | 'invoiced' | 'partial' | 'paid' = 'active';
  if (totalPaid >= totalInvoice && totalInvoice > 0) {
    computedStatus = 'paid';
  } else if (totalPaid > 0 && remainingBalance > 0) {
    computedStatus = 'partial';
  } else if (job.status === 'invoiced' || job.status === 'paid' || job.status === 'partial') {
    computedStatus = job.status;
  } else {
    computedStatus = 'active';
  }

  const recordedPaidEgp = payments.reduce((sum, p) => sum + (Number(p.egpAmount) || Math.round(Number(p.amount || 0) * fxRate)), 0);
  const totalPaidEgp = recordedPaidEgp > 0 ? recordedPaidEgp : Math.round(totalPaid * fxRate);
  const totalInvoiceEgp = Math.round(totalInvoice * fxRate);
  const netEarningsEgp = Math.round(netEarnings * fxRate);
  const grossFeeEgp = Math.round(grossFee * fxRate);
  const billableExpensesEgp = Math.round(billableExpenses * fxRate);
  const remainingBalanceEgp = Math.round(remainingBalance * fxRate);

  return {
    type,
    currency,
    totalDays,
    grossFee,
    billableExpenses,
    deductibleExpenses,
    totalInvoice,
    netEarnings,
    totalPaid,
    remainingBalance,
    percentPaid,
    computedStatus,
    fxRate,
    fxRateMissing,
    totalInvoiceEgp,
    netEarningsEgp,
    grossFeeEgp,
    billableExpensesEgp,
    totalPaidEgp,
    remainingBalanceEgp,
    // Aliases
    grossEarned: grossFee,
    grossEarnedEgp: grossFeeEgp,
    netEarned: netEarnings,
    netEarnedEgp: netEarningsEgp,
    unpaidBalance: remainingBalance,
    unpaidBalanceEgp: remainingBalanceEgp,
    totalPayments: totalPaid,
    totalExpenses: billableExpenses + deductibleExpenses,
    totalLoggedDays: totalDays,
    totalLoggedHours,
    exchangeRate: fxRate,
  };
}

// Built once per currency rather than per call: constructing an Intl.NumberFormat
// is expensive and this runs inside the Jobs list render loop.
const jobCurrencyFormatters = new Map<string, Intl.NumberFormat>();

function jobCurrencyFormatter(currency: string): Intl.NumberFormat {
  const cached = jobCurrencyFormatters.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: currency === 'EGP' ? 0 : 2,
    minimumFractionDigits: currency === 'EGP' ? 0 : 2,
  });
  jobCurrencyFormatters.set(currency, formatter);
  return formatter;
}

export function formatJobCurrency(value: number, currencyCode: string = 'USD'): string {
  const curr = normalizeCurrencyCode(currencyCode) || 'USD';
  return `${jobCurrencyFormatter(curr).format(value)} ${curr}`;
}
