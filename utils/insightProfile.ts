export interface AnsweredQuestion {
  tag: string;
  answeredAt: string; // ISO date
}

export interface MonthlyBehaviorSnapshot {
  month: string;        // YYYY-MM
  savingsRate: number;
  totalExpenses: number;
  topCategories: string[]; // top 3 categoryId by spend
  scoreValue: number | null;
}

export interface CategoryTrend {
  category: string;
  averageMonthly: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  lastUpdated: string; // YYYY-MM
}

export interface InsightProfile {
  answeredQuestions: Record<string, AnsweredQuestion>;
  dismissedQuestions: Record<string, string>; // id → ISO date
  monthlySnapshots?: MonthlyBehaviorSnapshot[];
  categoryTrends?: CategoryTrend[];
  correctionHistory?: Array<{
    merchantKey: string;
    fromCategory: string;
    toCategory: string;
    correctedAt: string;
  }>;
  lastProfileUpdate?: string; // YYYY-MM of last updateProfileAfterMonth call
}

export const EMPTY_PROFILE: InsightProfile = {
  answeredQuestions: {},
  dismissedQuestions: {},
  monthlySnapshots: [],
  categoryTrends: [],
  correctionHistory: [],
};
