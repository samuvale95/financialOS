export type CategoryId =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'health'
  | 'home'
  | 'travel'
  | 'education'
  | 'salary'
  | 'freelance'
  | 'investment'
  | 'subscriptions'
  | 'utilities'
  | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  type: 'expense' | 'income' | 'both';
}

export const CATEGORIES: Record<CategoryId, Category> = {
  food: {
    id: 'food',
    label: 'Alimentari',
    icon: 'fast-food',
    color: '#FF9500',
    bgColor: 'rgba(255,149,0,0.15)',
    type: 'expense',
  },
  transport: {
    id: 'transport',
    label: 'Trasporti',
    icon: 'car',
    color: '#4FC3F7',
    bgColor: 'rgba(79,195,247,0.15)',
    type: 'expense',
  },
  shopping: {
    id: 'shopping',
    label: 'Shopping',
    icon: 'bag',
    color: '#FF6B9D',
    bgColor: 'rgba(255,107,157,0.15)',
    type: 'expense',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Svago',
    icon: 'game-controller',
    color: '#BF5AF2',
    bgColor: 'rgba(191,90,242,0.15)',
    type: 'expense',
  },
  health: {
    id: 'health',
    label: 'Salute',
    icon: 'medkit',
    color: '#30D158',
    bgColor: 'rgba(48,209,88,0.15)',
    type: 'expense',
  },
  home: {
    id: 'home',
    label: 'Casa',
    icon: 'home',
    color: '#FF9F0A',
    bgColor: 'rgba(255,159,10,0.15)',
    type: 'expense',
  },
  travel: {
    id: 'travel',
    label: 'Viaggi',
    icon: 'airplane',
    color: '#64D2FF',
    bgColor: 'rgba(100,210,255,0.15)',
    type: 'expense',
  },
  education: {
    id: 'education',
    label: 'Istruzione',
    icon: 'school',
    color: '#FFD60A',
    bgColor: 'rgba(255,214,10,0.15)',
    type: 'expense',
  },
  salary: {
    id: 'salary',
    label: 'Stipendio',
    icon: 'briefcase',
    color: '#00D68F',
    bgColor: 'rgba(0,214,143,0.15)',
    type: 'income',
  },
  freelance: {
    id: 'freelance',
    label: 'Freelance',
    icon: 'laptop',
    color: '#00D68F',
    bgColor: 'rgba(0,214,143,0.15)',
    type: 'income',
  },
  investment: {
    id: 'investment',
    label: 'Investimenti',
    icon: 'trending-up',
    color: '#6C63FF',
    bgColor: 'rgba(108,99,255,0.15)',
    type: 'both',
  },
  subscriptions: {
    id: 'subscriptions',
    label: 'Abbonamenti',
    icon: 'repeat',
    color: '#FF6B6B',
    bgColor: 'rgba(255,107,107,0.15)',
    type: 'expense',
  },
  utilities: {
    id: 'utilities',
    label: 'Bollette',
    icon: 'flash',
    color: '#FFB347',
    bgColor: 'rgba(255,179,71,0.15)',
    type: 'expense',
  },
  other: {
    id: 'other',
    label: 'Altro',
    icon: 'ellipsis-horizontal',
    color: '#8F95A3',
    bgColor: 'rgba(143,149,163,0.15)',
    type: 'both',
  },
};

export const EXPENSE_CATEGORIES = Object.values(CATEGORIES).filter(
  (c) => c.type === 'expense' || c.type === 'both'
);

export const INCOME_CATEGORIES = Object.values(CATEGORIES).filter(
  (c) => c.type === 'income' || c.type === 'both'
);
