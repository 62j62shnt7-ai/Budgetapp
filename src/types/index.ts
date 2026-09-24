// ==========================================================================
// Budget Control — Core Domain Models & Type Definitions
// ==========================================================================

export type EntryType = 'income' | 'expense';

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
  draws?: Array<{ date: string; amount: number; note?: string }>;
  settlementDate?: string;
  linkedInflowId?: string;
  archivedAt?: string;
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
  name: string;
  amount: number;
  totalMonths: number;
  remainingMonths: number;
  startMonth: string; // YYYY-MM
  frequency?: number;
  account?: string;
  tag?: string;
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
}

export interface CategoryCap {
  category: string;
  cap: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline?: string;
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
  savingsScore: number;
  summaryNote: string;
  runwayMonths: number;
}

export interface SmartInsight {
  id: string;
  type: 'critical' | 'warning' | 'positive' | 'tip';
  title: string;
  message: string;
  actionText?: string;
}
