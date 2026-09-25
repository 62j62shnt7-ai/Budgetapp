// ==========================================================================
// Core Domain Models & Complete TypeScript Interfaces
// ==========================================================================

export type EntryType = 'income' | 'expense';

export interface EntryDraw {
  date: string;
  amount: number;
  note?: string;
  tag?: string;
  account?: string;
}

export interface CashEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: EntryType;
  category: string;
  subcategory?: string;
  account: string;
  tag?: string;
  note?: string;
  isRecurring?: boolean;
  frequency?: string;
  creditType?: string; // 'cib' | 'hsbc' | ''
  source?: string;
  isDraw?: boolean;
  isClosed?: boolean;
  keepOngoing?: boolean;
  draws?: EntryDraw[];
  settlementDate?: string;
  creditSettlementDate?: string;
  calculatedAmount?: number;
  baseDue?: number;
  cardSpendTotal?: number;
  cardExpenseCount?: number;
  isCreditSettlement?: boolean;
  isCustomized?: boolean;
  linkedInflowId?: string;
  archivedAt?: string;
  currency?: string;
  actualAmount?: number;
  actualDate?: string;
  loanId?: string;
  initialAmount?: number;
}

export interface SalaryPayment {
  monthOffset: number; // 0, 1, 2
  day: number;
  amount: number;
}

export interface AccountBalance {
  name: string;
  balance: number;
  maturityDay: number;
}

export interface CurrencyRate {
  name: string;
  sell: number;
  buy: number;
}

export interface GoldRate {
  name: string;
  sell: number;
  buy: number;
}

export interface RatesData {
  currencies: CurrencyRate[];
  gold: GoldRate[];
}

export interface Installment {
  id: string;
  loanId?: string;
  name: string;
  amount: number;
  day?: number;
  totalMonths: number;
  remainingMonths: number;
  startMonth: string; // YYYY-MM
  frequency?: number;
  account?: string;
  tag?: string;
  initialAmount?: number;
}

export interface StorageAsset {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  buyPrice: number;
  currentPrice?: number;
  currency: string;
  notes?: string;
  rate?: number;
  rateSource?: string;
}


export interface JobDayLog {
  id?: string;
  date: string;
  units?: number;
  hours?: number;
  rate?: number;
  note?: string;
}

export interface JobPayment {
  id: string;
  date: string;
  amount: number;
  currency?: string;
  account?: string;
  settlementAccount?: string;
  syncToBudget?: boolean;
  paymentNote?: string;
  note?: string;
}

export interface JobExpense {
  id: string;
  date: string;
  title?: string;
  description?: string;
  amount: number;
  currency?: string;
  isReimbursable?: boolean;
  receiptNote?: string;
  note?: string;
}

export interface JobItem {
  id: string;
  title: string;
  client?: string;
  startDate?: string;
  endDate?: string;
  currency: string;
  type?: 'daily_rate' | 'lumpsum' | 'hourly' | 'fixed';
  dailyRate?: number;
  lumpSumAmount?: number;
  rateType?: 'daily' | 'hourly' | 'fixed';
  rateAmount?: number;
  status?: 'active' | 'invoiced' | 'partial' | 'paid' | 'completed' | 'paused';
  notes?: string;
  daysWorked?: JobDayLog[];
  logs?: JobDayLog[];
  payments?: JobPayment[];
  expenses?: JobExpense[];
}

export interface DeficitPeriod {
  startDate: string;
  endDate: string;
  maxDeficit: number;
  isResolved: boolean;
  shortfallDays: number;
}

export interface DeficitSummary {
  hasDeficit: boolean;
  totalPeriods: number;
  worstDeficit: number;
  deficitPeriods: DeficitPeriod[];
  forecastMonths: number;
}

export interface MonthlyForecast {
  month: string; // YYYY-MM
  balance: number;
  income: number;
  expense: number;
  net: number;
}

export interface HealthScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  deficitScore: number;
  runwayScore: number;
  budgetScore: number;
  savingsScore: number;
  summaryNote: string;
  runwayMonths: number;
  label?: string;
  tone?: string;
  hardScoreCap?: number;
}

export interface SmartInsight {
  id: string;
  type: 'critical' | 'warning' | 'positive' | 'tip';
  title: string;
  message: string;
  actionText?: string;
}
