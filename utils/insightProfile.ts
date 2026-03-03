export interface AnsweredQuestion {
  tag: string;
  answeredAt: string; // ISO date
}

export interface InsightProfile {
  answeredQuestions: Record<string, AnsweredQuestion>;
  dismissedQuestions: Record<string, string>; // id → ISO date
}

export const EMPTY_PROFILE: InsightProfile = {
  answeredQuestions: {},
  dismissedQuestions: {},
};
