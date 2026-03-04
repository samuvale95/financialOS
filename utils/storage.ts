import * as FileSystem from 'expo-file-system/legacy';
import type { Transaction, StoredBudget, Asset, Goal, BankAccount, OnboardingData, Subscription } from '../types';
import type { CategoryId } from '../constants/categories';
import type { InsightProfile } from './insightProfile';
import { EMPTY_PROFILE } from './insightProfile';

const BASE = FileSystem.documentDirectory!;

const PATHS = {
  transactions: `${BASE}financialOS_transactions.json`,
  budgets: `${BASE}financialOS_budgets.json`,
  assets: `${BASE}financialOS_assets.json`,
  goals: `${BASE}financialOS_goals.json`,
  accounts: `${BASE}financialOS_accounts.json`,
  subscriptions: `${BASE}financialOS_subscriptions.json`,
  merchantRules: `${BASE}financialOS_merchantRules.json`,
  onboarding: `${BASE}financialOS_onboarding.json`,
  insightProfile: `${BASE}financialOS_insightProfile.json`,
};

async function loadJSON<T>(path: string): Promise<T[]> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function saveJSON<T>(path: string, data: T[]): Promise<void> {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
}

async function loadJSONObject<T>(path: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJSONObject<T>(path: string, data: T): Promise<void> {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
}

export const loadTransactions = () => loadJSON<Transaction>(PATHS.transactions);
export const saveTransactions = (data: Transaction[]) => saveJSON(PATHS.transactions, data);

export const loadStoredBudgets = () => loadJSON<StoredBudget>(PATHS.budgets);
export const saveStoredBudgets = (data: StoredBudget[]) => saveJSON(PATHS.budgets, data);

export const loadAssets = () => loadJSON<Asset>(PATHS.assets);
export const saveAssets = (data: Asset[]) => saveJSON(PATHS.assets, data);

export const loadGoals = () => loadJSON<Goal>(PATHS.goals);
export const saveGoals = (data: Goal[]) => saveJSON(PATHS.goals, data);

export const loadAccounts = () => loadJSON<BankAccount>(PATHS.accounts);
export const saveAccounts = (data: BankAccount[]) => saveJSON(PATHS.accounts, data);

export const loadSubscriptions = () => loadJSON<Subscription>(PATHS.subscriptions);
export const saveSubscriptions = (data: Subscription[]) => saveJSON(PATHS.subscriptions, data);

export const loadOnboardingData = () =>
  loadJSONObject<OnboardingData>(PATHS.onboarding, { completed: false });
export const saveOnboardingData = (data: OnboardingData) =>
  saveJSONObject(PATHS.onboarding, data);

export const loadInsightProfile = () =>
  loadJSONObject<InsightProfile>(PATHS.insightProfile, EMPTY_PROFILE);
export const saveInsightProfile = (data: InsightProfile) =>
  saveJSONObject(PATHS.insightProfile, data);

export const loadMerchantRules = () =>
  loadJSONObject<Record<string, CategoryId>>(PATHS.merchantRules, {});
export const saveMerchantRules = (data: Record<string, CategoryId>) =>
  saveJSONObject(PATHS.merchantRules, data);

/** Cancella tutti i file JSON dell'app (usato dal reset developer). */
export async function clearAllData(): Promise<void> {
  await Promise.all(
    Object.values(PATHS).map((path) =>
      FileSystem.deleteAsync(path, { idempotent: true })
    )
  );
}
