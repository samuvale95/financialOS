import type { CategoryId } from '../constants/categories';
import { categorize, getMerchantKey, extractBrand } from './categorizer';

/**
 * Priority order used by resolveCategory.
 * Higher-priority sources earlier in the array override lower ones.
 *
 * P1 merchantRule — exact normalised merchant key stored by the user
 * P2 brandRule    — brand-level rule (e.g. "esselunga" → groceries)
 * P3 localRules   — keyword rules from categorize() in categorizer.ts
 * P4 aiCategory   — category produced by Gemini / OpenAI during parsing
 * P5 fallback     — 'other'
 */
export const RESOLUTION_PRIORITY = [
  'merchantRule',
  'brandRule',
  'localRules',
  'aiCategory',
  'fallback_other',
] as const;

export type ResolutionSource = (typeof RESOLUTION_PRIORITY)[number];

export function resolveCategory(
  tx: { description: string; merchant?: string; aiCategory?: CategoryId },
  merchantRules: Record<string, CategoryId>,
  brandRules: Record<string, CategoryId>,
): CategoryId {
  // P1: exact merchant-key rule
  const key = getMerchantKey(tx);
  if (merchantRules[key]) return merchantRules[key];

  // P2: brand-level rule (only when brand is long enough to be meaningful)
  const brand = extractBrand(tx);
  if (brand.length >= 4 && brandRules[brand]) return brandRules[brand];

  // P3: keyword rules from categorizer
  const local = categorize(tx.description);
  if (local !== 'other') return local;

  // P4: AI-provided category (trusted only when local rules have no opinion)
  if (tx.aiCategory) return tx.aiCategory;

  // P5: fallback
  return 'other';
}
