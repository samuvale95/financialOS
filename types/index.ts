import type { CategoryId } from '../constants/categories';

export interface TransactionSplit {
  categoryId: CategoryId;
  amount: number;
}

export interface Transaction {
  id: string;
  date: string; // ISO date string
  amount: number; // negative = expense, positive = income
  description: string;
  category: CategoryId;
  merchant?: string;
  note?: string;
  accountId?: string;
  transferToAccountId?: string;
  isTransfer?: boolean;
  splits?: TransactionSplit[];
  tags?: string[];
}

export interface Budget {
  id: string;
  category: CategoryId;
  limit: number;
  spent: number;
  period: 'monthly';
}

export interface StoredBudget {
  id: string;
  category: CategoryId;
  limit: number;
  period: 'monthly';
}

export interface Asset {
  id: string;
  name: string;
  ticker: string;
  type: 'etf' | 'stock' | 'crypto' | 'bond' | 'cash';
  quantity: number;
  currentPrice: number;
  purchasePrice: number;
  color: string;
  sparkline: number[]; // last 7 data points
  priceLastUpdated?: string; // ISO datetime for 24h cache
}

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'annual';

export interface Subscription {
  id: string;
  name: string;
  emoji?: string;
  amount: number;
  frequency: SubscriptionFrequency;
  nextDueDate: string; // ISO date string
  category: CategoryId;
  color: string;
  active: boolean;
}

export interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'tip' | 'alert';
  title: string;
  body: string;
  action?: string;
  icon: string;
  category?: CategoryId;
}

export interface Goal {
  id: string;
  title: string;
  emoji: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string; // ISO date string
  color: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
}

export interface MonthSummary {
  netWorth: number;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountLabel: string;
  balance: number;
  lastUpdated: string;
}

// ── Onboarding enums ──────────────────────────────────────────────────────────

export type OnboardingGoalId =
  | 'risparmio'
  | 'casa'
  | 'pensione'
  | 'emergenza'
  | 'viaggio'
  | 'istruzione';

export type EffortLevel = 'leggero' | 'moderato' | 'intenso';

export type IncomeType = 'salary' | 'freelance' | 'rent' | 'dividends' | 'pension' | 'other';

export type FamilyStatus = 'single' | 'partner' | 'married' | 'separated' | 'widowed';

export type HousingType = 'owner' | 'renter' | 'family' | 'other';

export type WorkType = 'employee' | 'freelance' | 'entrepreneur' | 'retired' | 'student' | 'other';

export type IncomeStability = 'stable' | 'variable' | 'seasonal';

// ── Onboarding data models ────────────────────────────────────────────────────

export interface IncomeSource {
  id: string;
  type: IncomeType;
  label: string;
  amount: number;
  frequency: 'monthly' | 'annual';
}

export interface UserProfile {
  name?: string;
  birthYear?: number;
  region?: string;
  familyStatus: FamilyStatus;
  householdSize: number;
  dependents: number;
}

export interface HousingInfo {
  type: HousingType;
  monthlyCost: number;
}

export interface WorkInfo {
  type: WorkType;
  sector?: string;
  stability: IncomeStability;
}

export interface OnboardingData {
  completed: boolean;
  completedAt?: string;
  monthlyIncome?: number;
  goals?: OnboardingGoalId[];
  incomeSources?: IncomeSource[];
  mainGoal?: OnboardingGoalId;
  effortLevel?: EffortLevel;
  userProfile?: UserProfile;
  housingInfo?: HousingInfo;
  workInfo?: WorkInfo;
}
