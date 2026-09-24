// ==========================================================================
// Jobs Calculation Engine (ASF, IRQ, Part-Time Jobs)
// ==========================================================================
import type { JobItem, RatesData } from '../types';
import { getCurrencyRate } from './currency';

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
  const currency = (job.currency || 'USD').toUpperCase();
  const fxRate = currency === 'EGP' ? 1 : getCurrencyRate(rates, currency);

  const daysWorked = Array.isArray(job.daysWorked)
    ? job.daysWorked
    : Array.isArray(job.logs)
    ? job.logs
    : [];

  const expenses = Array.isArray(job.expenses) ? job.expenses : [];
  const payments = Array.isArray(job.payments) ? job.payments : [];

  const totalDays = daysWorked.reduce((sum, d) => sum + (Number(d.units) || 1), 0);
  const totalLoggedHours = daysWorked.reduce((sum, d) => sum + (Number(d.hours) || 0), 0);

  let grossFee = 0;
  if (type === 'daily_rate' || job.rateType === 'daily') {
    const rate = Number(job.dailyRate) || Number(job.rateAmount) || 0;
    grossFee = rate * totalDays;
  } else if (job.rateType === 'hourly') {
    const rate = Number(job.rateAmount) || 0;
    grossFee = rate * totalLoggedHours;
  } else {
    grossFee = Number(job.lumpSumAmount) || Number(job.rateAmount) || 0;
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

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingBalance = Math.max(0, Math.round((totalInvoice - totalPaid) * 100) / 100);
  const percentPaid = totalInvoice > 0 ? Math.min(100, Math.round((totalPaid / totalInvoice) * 100)) : (totalPaid > 0 ? 100 : 0);

  let computedStatus: 'active' | 'invoiced' | 'partial' | 'paid' = (job.status as any) || 'active';
  if (totalPaid >= totalInvoice && totalInvoice > 0 && job.status !== 'active') {
    computedStatus = 'paid';
  } else if (totalPaid > 0 && remainingBalance > 0 && job.status !== 'active' && job.status !== 'invoiced') {
    computedStatus = 'partial';
  } else if (job.status === 'paid') {
    computedStatus = 'paid';
  } else if (job.status === 'invoiced') {
    computedStatus = 'invoiced';
  } else if (job.status === 'partial') {
    computedStatus = 'partial';
  } else {
    computedStatus = 'active';
  }

  const totalInvoiceEgp = Math.round(totalInvoice * fxRate);
  const netEarningsEgp = Math.round(netEarnings * fxRate);
  const grossFeeEgp = Math.round(grossFee * fxRate);
  const billableExpensesEgp = Math.round(billableExpenses * fxRate);
  const totalPaidEgp = Math.round(totalPaid * fxRate);
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

export function formatJobCurrency(value: number, currencyCode: string = 'USD'): string {
  const curr = currencyCode.toUpperCase();
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: curr === 'EGP' ? 0 : 2,
    minimumFractionDigits: curr === 'EGP' ? 0 : 2,
  }).format(value);

  return `${formatted} ${curr}`;
}
