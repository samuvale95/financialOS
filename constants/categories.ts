export type CategoryId =
  | 'groceries'
  | 'restaurants'
  | 'food'
  | 'fuel'
  | 'public_transport'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'sports'
  | 'health'
  | 'pharmacy'
  | 'home'
  | 'rent'
  | 'utilities'
  | 'insurance'
  | 'subscriptions'
  | 'travel'
  | 'education'
  | 'beauty'
  | 'pets'
  | 'taxes'
  | 'salary'
  | 'freelance'
  | 'investment'
  | 'transfer'
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
  groceries: {
    id: 'groceries',
    label: 'Supermercato',
    icon: 'cart',
    color: '#34C759',
    bgColor: 'rgba(52,199,89,0.15)',
    type: 'expense',
  },
  restaurants: {
    id: 'restaurants',
    label: 'Ristoranti & Bar',
    icon: 'restaurant',
    color: '#FF9500',
    bgColor: 'rgba(255,149,0,0.15)',
    type: 'expense',
  },
  food: {
    id: 'food',
    label: 'Alimentari',
    icon: 'fast-food',
    color: '#FF6B35',
    bgColor: 'rgba(255,107,53,0.15)',
    type: 'expense',
  },
  fuel: {
    id: 'fuel',
    label: 'Carburante',
    icon: 'flame',
    color: '#636366',
    bgColor: 'rgba(99,99,102,0.15)',
    type: 'expense',
  },
  public_transport: {
    id: 'public_transport',
    label: 'Trasporti Pubblici',
    icon: 'bus',
    color: '#4FC3F7',
    bgColor: 'rgba(79,195,247,0.15)',
    type: 'expense',
  },
  transport: {
    id: 'transport',
    label: 'Trasporti',
    icon: 'car',
    color: '#5E9BF0',
    bgColor: 'rgba(94,155,240,0.15)',
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
  sports: {
    id: 'sports',
    label: 'Sport & Fitness',
    icon: 'barbell',
    color: '#FF3B30',
    bgColor: 'rgba(255,59,48,0.15)',
    type: 'expense',
  },
  health: {
    id: 'health',
    label: 'Salute',
    icon: 'heart',
    color: '#30D158',
    bgColor: 'rgba(48,209,88,0.15)',
    type: 'expense',
  },
  pharmacy: {
    id: 'pharmacy',
    label: 'Farmacia',
    icon: 'medkit',
    color: '#00C7BE',
    bgColor: 'rgba(0,199,190,0.15)',
    type: 'expense',
  },
  rent: {
    id: 'rent',
    label: 'Affitto & Mutuo',
    icon: 'key',
    color: '#5856D6',
    bgColor: 'rgba(88,86,214,0.15)',
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
  utilities: {
    id: 'utilities',
    label: 'Bollette',
    icon: 'flash',
    color: '#FFB347',
    bgColor: 'rgba(255,179,71,0.15)',
    type: 'expense',
  },
  insurance: {
    id: 'insurance',
    label: 'Assicurazioni',
    icon: 'shield-checkmark',
    color: '#32ADE6',
    bgColor: 'rgba(50,173,230,0.15)',
    type: 'expense',
  },
  subscriptions: {
    id: 'subscriptions',
    label: 'Abbonamenti',
    icon: 'repeat',
    color: '#FF6B6B',
    bgColor: 'rgba(255,107,107,0.15)',
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
  beauty: {
    id: 'beauty',
    label: 'Bellezza & Cura',
    icon: 'color-wand',
    color: '#FF4D94',
    bgColor: 'rgba(255,77,148,0.15)',
    type: 'expense',
  },
  pets: {
    id: 'pets',
    label: 'Animali',
    icon: 'paw',
    color: '#A0845C',
    bgColor: 'rgba(160,132,92,0.15)',
    type: 'expense',
  },
  taxes: {
    id: 'taxes',
    label: 'Tasse & Imposte',
    icon: 'document-text',
    color: '#8F95A3',
    bgColor: 'rgba(143,149,163,0.15)',
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
  transfer: {
    id: 'transfer',
    label: 'Giroconto',
    icon: 'swap-horizontal',
    color: '#5E9BF0',
    bgColor: 'rgba(94,155,240,0.15)',
    type: 'both',
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
