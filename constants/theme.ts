export const Colors = {
  bg: {
    primary: '#0A0B0F',
    secondary: '#12141A',
    card: '#1A1D26',
    elevated: '#20243A',
    overlay: 'rgba(10,11,15,0.6)',
  },
  accent: {
    primary: '#6C63FF',
    secondary: '#8B82FF',
    glow: 'rgba(108,99,255,0.2)',
  },
  semantic: {
    success: '#00D68F',
    successDim: 'rgba(0,214,143,0.15)',
    warning: '#FFB347',
    warningDim: 'rgba(255,179,71,0.15)',
    danger: '#FF6B6B',
    dangerDim: 'rgba(255,107,107,0.15)',
    info: '#4FC3F7',
    infoDim: 'rgba(79,195,247,0.15)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#8F95A3',
    muted: '#4A5166',
    accent: '#6C63FF',
  },
  border: {
    default: 'rgba(255,255,255,0.06)',
    subtle: 'rgba(255,255,255,0.04)',
    accent: 'rgba(108,99,255,0.3)',
  },
} as const;

export const Gradients = {
  netWorth: ['#6C63FF', '#4FC3F7'] as [string, string],
  income: ['#00D68F', '#00A36C'] as [string, string],
  expense: ['#FF6B6B', '#CC4444'] as [string, string],
  accent: ['#6C63FF', '#8B82FF'] as [string, string],
  cardShine: ['transparent', 'rgba(255,255,255,0.04)'] as [string, string],
  darkCard: ['#1A1D26', '#12141A'] as [string, string],
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500' as const, lineHeight: 14 },
} as const;

export const Touch = {
  xs: 32,
  sm: 40,
  md: 44,
  lg: 48,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 16,
  },
  glow: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;
