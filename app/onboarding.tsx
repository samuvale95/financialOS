import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Typography, Radius, Spacing, Touch } from '../constants/theme';
import { useData } from '../contexts/DataContext';
import { useSettings } from '../contexts/SettingsContext';
import { saveOnboardingData } from '../utils/storage';
import { calculateBudgets } from '../utils/budgetCalculator';
import type { BudgetContext } from '../utils/budgetCalculator';
import {
  searchCoinGecko, fetchCoinGeckoAsset,
  lookupTickerDirect, nextAssetColor,
} from '../utils/financialApi';
import { searchLocalAssets, looksLikeTicker } from '../constants/popularAssets';
import type { LocalAsset } from '../constants/popularAssets';
import { parseCSV } from '../utils/parsers';
import { parseExcel } from '../utils/excelParser';
import { parsePDF } from '../utils/pdfParser';
import { hasGemini, parseWithGemini } from '../utils/geminiParser';
import { sendImportNotification } from '../utils/notifications';
import { parseWithSmartParser } from '../utils/smartImportParser';
import { logImportEvent } from '../utils/importAnalytics';
import type { ImportModel, ImportTier, ImportStrategy } from '../utils/importAnalytics';
import { startLogSession, finishLogSession } from '../utils/importLogger';
import { ITALIAN_BANKS } from '../constants/italianBanks';
import type { ItalianBank } from '../constants/italianBanks';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../constants/categories';
import type { CategoryId } from '../constants/categories';
import { getMerchantKey } from '../utils/categorizer';
import type {
  BankAccount, OnboardingGoalId, EffortLevel, IncomeSource, IncomeType,
  StoredBudget, Asset, FamilyStatus, HousingType, WorkType, IncomeStability,
  LifestyleProfile, SportFrequency, TravelFrequency, DiningFrequency,
} from '../types';
import type { Transaction } from '../types';

// ── Local types ───────────────────────────────────────────────────────────────

interface PendingAccount { bankId: string; bankName: string; accountLabel: string; balance: number; }
interface PendingAsset extends Omit<Asset, 'id'> {}
interface ImportedFile {
  id: string;
  fileName: string;
  bankName: string;
  accountIndex: number | null; // index into WizardState.accounts; null = not assigned
  transactions: Omit<Transaction, 'id'>[];
}
interface CategoryInsight {
  id: string; name: string; icon: string;
  color: string; bgColor: string;
  monthlySpent: number; monthsCount: number; budget: number; percentOfIncome: number;
  status: 'ok' | 'warning' | 'over';
  topMerchants: { name: string; total: number; count: number }[];
  topTxs: { txKey: string; merchantKey: string; displayName: string; rawDescription: string; amount: number; date: string; category: CategoryId }[];
}

interface WizardState {
  step: number;
  // Step 1: Chi sei
  userName: string;
  birthYear: string;
  familyStatus: FamilyStatus | null;
  householdSize: number;
  dependents: number;
  // Step 2: Dove vivi
  region: string | null;
  housingType: HousingType | null;
  housingCost: string;
  // Step 3: Lavoro
  workType: WorkType | null;
  workSector: string | null;
  incomeStability: IncomeStability | null;
  // Step 4: Entrate
  incomeSources: IncomeSource[];
  // Step 5: Conti bancari
  accounts: PendingAccount[];
  // Step 6: Crypto
  hasCrypto: boolean | null;
  cryptoAssets: PendingAsset[];
  // Step 7: Investimenti
  hasInvestments: boolean | null;
  assets: PendingAsset[];
  // Step 7: Obiettivi & Impegno
  mainGoal: OnboardingGoalId | null;
  effortLevel: EffortLevel | null;
  // Step 9: Importa (multipli file)
  importedFiles: ImportedFile[];
  // Step 9: Budget edits
  budgetEdits: Record<string, string>;
  // Step 10: Merchant-level overrides (merchantKey → CategoryId), applied to all matching transactions
  merchantOverrides: Record<string, CategoryId>;
  // Step 2: Stile di vita
  lifestyleProfile: LifestyleProfile;
}

const INIT_STATE: WizardState = {
  step: 0, userName: '', birthYear: '',
  familyStatus: null, householdSize: 1, dependents: 0,
  region: null, housingType: null, housingCost: '',
  workType: null, workSector: null, incomeStability: null,
  incomeSources: [], accounts: [], hasCrypto: null, cryptoAssets: [], hasInvestments: null, assets: [],
  mainGoal: null, effortLevel: null, importedFiles: [], budgetEdits: {}, merchantOverrides: {},
  lifestyleProfile: {
    sportFrequency: 'occasional',
    travelFrequency: 'once_year',
    diningOutFrequency: 'sometimes',
    hobbies: [],
  },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PROGRESS_STEPS = 11; // steps 1–11 show progress indicator

const PHASES: { label: string; steps: readonly number[] }[] = [
  { label: 'Profilo',    steps: [1, 2] },
  { label: 'Casa',       steps: [3, 4, 5] },
  { label: 'Patrimonio', steps: [6, 7, 8] },
  { label: 'Obiettivi',  steps: [9] },
  { label: 'Analisi',    steps: [10, 11] },
];

const ITALIAN_REGIONS = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
  'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
];

const WORK_SECTORS = [
  'Tecnologia', 'Finanza & Banca', 'Sanità & Medicina', 'Istruzione',
  'Commercio & Retail', 'Industria & Manifattura', 'Edilizia',
  'Trasporti & Logistica', 'Turismo & Ristorazione', 'Servizi & Consulenza',
  'Pubblica Amministrazione', 'Arte & Media', 'Agricoltura', 'Altro',
];

const FAMILY_STATUS_OPTIONS: { id: FamilyStatus; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'partner', label: 'Convivente' },
  { id: 'married', label: 'Sposato/a' },
  { id: 'separated', label: 'Separato/a' },
  { id: 'widowed', label: 'Vedovo/a' },
];

const HOUSING_OPTIONS: { id: HousingType; label: string; emoji: string; desc: string }[] = [
  { id: 'owner', label: 'Proprietario/a', emoji: '🏠', desc: 'Casa di proprietà' },
  { id: 'renter', label: 'In affitto', emoji: '🔑', desc: 'Pago affitto mensile' },
  { id: 'family', label: 'Con la famiglia', emoji: '👨‍👩‍👦', desc: 'Vivo con i genitori/parenti' },
  { id: 'other', label: 'Altro', emoji: '🏢', desc: 'Altra situazione' },
];

const WORK_TYPE_OPTIONS: { id: WorkType; label: string; emoji: string }[] = [
  { id: 'employee', label: 'Dipendente', emoji: '👔' },
  { id: 'freelance', label: 'Freelance', emoji: '💼' },
  { id: 'entrepreneur', label: 'Imprenditore', emoji: '🏗' },
  { id: 'retired', label: 'Pensionato/a', emoji: '🏖' },
  { id: 'student', label: 'Studente', emoji: '📚' },
  { id: 'other', label: 'Altro', emoji: '❓' },
];

const STABILITY_OPTIONS: { id: IncomeStability; label: string; emoji: string; desc: string }[] = [
  { id: 'stable', label: 'Fisso mensile', emoji: '📅', desc: 'Stipendio sempre uguale' },
  { id: 'variable', label: 'Variabile', emoji: '📊', desc: 'Cambia di mese in mese' },
  { id: 'seasonal', label: 'Stagionale', emoji: '🌊', desc: 'Concentrato in certi periodi' },
];

const INCOME_TYPES: { id: IncomeType; label: string; emoji: string }[] = [
  { id: 'salary', label: 'Stipendio', emoji: '💰' },
  { id: 'freelance', label: 'Freelance/P.IVA', emoji: '💼' },
  { id: 'rent', label: 'Affitti', emoji: '🏠' },
  { id: 'dividends', label: 'Dividendi', emoji: '📈' },
  { id: 'pension', label: 'Pensione', emoji: '🏖' },
  { id: 'other', label: 'Altro', emoji: '➕' },
];

const GOAL_OPTIONS: { id: OnboardingGoalId; label: string; emoji: string; desc: string }[] = [
  { id: 'risparmio', label: 'Risparmio', emoji: '💰', desc: 'Costruire un gruzzolo' },
  { id: 'casa', label: 'Casa', emoji: '🏠', desc: 'Acquistare o ristrutturare' },
  { id: 'pensione', label: 'Pensione', emoji: '🌅', desc: 'Prepararsi al futuro' },
  { id: 'emergenza', label: 'Fondo emergenza', emoji: '🛡', desc: '3-6 mesi di spese' },
  { id: 'viaggio', label: 'Viaggi', emoji: '✈️', desc: 'Finanziare esperienze' },
  { id: 'istruzione', label: 'Istruzione', emoji: '🎓', desc: 'Formazione e crescita' },
];

const EFFORT_OPTIONS: { id: EffortLevel; label: string; emoji: string; desc: string; saving: string }[] = [
  { id: 'leggero', label: 'Leggero', emoji: '😌', desc: 'Piccoli aggiustamenti senza rinunce', saving: '3–5%' },
  { id: 'moderato', label: 'Moderato', emoji: '💪', desc: 'Equilibrio tra risparmio e qualità di vita', saving: '15–20%' },
  { id: 'intenso', label: 'Intenso', emoji: '🔥', desc: 'Massimizzare il risparmio, obiettivo rapido', saving: '30%+' },
];

const SPORT_OPTIONS: { id: SportFrequency; label: string; emoji: string }[] = [
  { id: 'never', label: 'Mai', emoji: '😴' },
  { id: 'occasional', label: 'Raramente', emoji: '🚶' },
  { id: 'regular', label: '2-3x/settimana', emoji: '🏋️' },
  { id: 'intensive', label: 'Ogni giorno', emoji: '🏆' },
];

const TRAVEL_OPTIONS: { id: TravelFrequency; label: string; emoji: string }[] = [
  { id: 'never', label: 'Non viaggio', emoji: '🏠' },
  { id: 'once_year', label: '1 volta/anno', emoji: '✈️' },
  { id: 'few_times', label: '2-4 volte', emoji: '🌍' },
  { id: 'frequent', label: 'Spesso', emoji: '🧳' },
];

const DINING_OPTIONS: { id: DiningFrequency; label: string; emoji: string }[] = [
  { id: 'rarely', label: 'Cucino quasi sempre', emoji: '👨‍🍳' },
  { id: 'sometimes', label: '1-2x/settimana', emoji: '🍽️' },
  { id: 'often', label: '3-4x/settimana', emoji: '🍕' },
  { id: 'daily', label: 'Quasi ogni giorno', emoji: '🍱' },
];

const HOBBY_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'music', label: 'Musica', emoji: '🎵' },
  { id: 'cinema', label: 'Cinema', emoji: '🎬' },
  { id: 'reading', label: 'Lettura', emoji: '📚' },
  { id: 'photography', label: 'Fotografia', emoji: '📸' },
  { id: 'art', label: 'Arte', emoji: '🎨' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthlyAmount(s: IncomeSource): number {
  return s.frequency === 'annual' ? s.amount / 12 : s.amount;
}
function totalMonthlyIncome(sources: IncomeSource[]): number {
  return sources.reduce((sum, s) => sum + monthlyAmount(s), 0);
}
function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString('it-IT')}`;
}

function mergeImportedFiles(
  files: ImportedFile[],
  accountIds?: string[]
): Omit<Transaction, 'id'>[] {
  const seen = new Set<string>();
  const result: Omit<Transaction, 'id'>[] = [];
  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    const accountId = accountIds && file.accountIndex !== null ? accountIds[file.accountIndex] : undefined;
    for (const tx of file.transactions) {
      const key = `${tx.date}|${tx.amount}|${tx.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(accountId ? { ...tx, accountId } : tx);
      }
    }
  }
  return result;
}

function getCategoryInsights(
  txs: Omit<Transaction, 'id'>[] | null,
  budgets: StoredBudget[],
  income: number,
  merchantOverrides: Record<string, CategoryId> = {}
): CategoryInsight[] {
  if (!txs || txs.length === 0 || income <= 0) return [];

  const effectiveCatFor = (tx: Omit<Transaction, 'id'>) => {
    const mKey = getMerchantKey(tx as any);
    return merchantOverrides[mKey] ?? tx.category;
  };

  const spentByCategory: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.amount < 0) {
      const cat = effectiveCatFor(tx);
      spentByCategory[cat] = (spentByCategory[cat] || 0) + Math.abs(tx.amount);
    }
  }
  // Count distinct calendar months (YYYY-MM) for an accurate monthly average
  const months = Math.max(1, new Set(txs.map(t => t.date.slice(0, 7))).size);

  return budgets
    .map(b => {
      const total = spentByCategory[b.category] || 0;
      const monthly = total / months;
      const cat = CATEGORIES[b.category];

      // Top merchants for this category (respecting merchant overrides)
      const catTxs = (txs ?? []).filter(t => {
        if (t.amount >= 0) return false;
        return effectiveCatFor(t) === b.category;
      });
      const merchantMap = new Map<string, { total: number; count: number }>();
      for (const tx of catTxs) {
        const key = ((tx as any).merchant || tx.description).trim().slice(0, 35);
        const e = merchantMap.get(key) ?? { total: 0, count: 0 };
        merchantMap.set(key, { total: e.total + Math.abs(tx.amount), count: e.count + 1 });
      }
      const topMerchants = Array.from(merchantMap.entries())
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

      const topTxs = [...catTxs]
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 8)
        .map(t => {
          const txKey = `${t.date}|${t.amount}|${t.description}`;
          const mKey = getMerchantKey(t as any);
          return {
            txKey,
            merchantKey: mKey,
            displayName: ((t as any).merchant || t.description) as string,
            rawDescription: t.description,
            amount: Math.abs(t.amount),
            date: t.date,
            category: effectiveCatFor(t),
          };
        });

      return {
        id: b.category,
        name: cat?.label ?? b.category,
        icon: cat?.icon ?? 'cash',
        color: cat?.color ?? Colors.accent.primary,
        bgColor: cat?.bgColor ?? Colors.accent.glow,
        monthlySpent: Math.round(monthly),
        monthsCount: months,
        budget: b.limit,
        percentOfIncome: Math.round((monthly / income) * 100),
        status: monthly > b.limit * 1.2 ? 'over' as const : monthly > b.limit * 0.85 ? 'warning' as const : 'ok' as const,
        topMerchants,
        topTxs,
      };
    })
    .filter(i => i.monthlySpent > 0)
    .sort((a, b) => b.monthlySpent - a.monthlySpent);
}

function computeScore(state: WizardState, budgets: StoredBudget[]): number {
  let score = 35;
  const income = totalMonthlyIncome(state.incomeSources);
  const txs = mergeImportedFiles(state.importedFiles);

  if (txs.length > 0 && income > 0) {
    const months = Math.max(1, new Set(txs.map(t => t.date.slice(0, 7))).size);
    const monthlyExp = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0) / months;
    const savingsRate = income > 0 ? (income - monthlyExp) / income : 0;
    if (savingsRate >= 0.25) score += 25;
    else if (savingsRate >= 0.15) score += 18;
    else if (savingsRate >= 0.05) score += 10;
    else if (savingsRate >= 0) score += 3;
    else score -= 8;

    const insights = getCategoryInsights(txs, budgets, income, state.merchantOverrides);
    score += insights.filter(i => i.status === 'ok').length * 2;
    score -= insights.filter(i => i.status === 'over').length * 4;
  } else {
    score += 5;
  }
  const allAssets = [...state.assets, ...state.cryptoAssets];
  if (allAssets.length > 0) {
    score += 10;
    const types = new Set(allAssets.map(a => a.type));
    if (types.size >= 2) score += 5;
  }
  if (state.incomeSources.length >= 2) score += 10;
  else if (state.incomeSources.length === 1) score += 5;
  if (state.accounts.length > 0) score += 5;
  if (state.mainGoal && state.effortLevel) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreLabel(score: number): { label: string; color: string; description: string } {
  if (score >= 80) return { label: 'Eccellente', color: '#00D68F', description: 'Gestione finanziaria ottimale' };
  if (score >= 65) return { label: 'Buono', color: '#4FC3F7', description: 'Buona base, margini di crescita' };
  if (score >= 50) return { label: 'Nella media', color: '#FFB347', description: 'Alcune aree da migliorare' };
  if (score >= 35) return { label: 'Da migliorare', color: '#FF9500', description: 'Rivedere le abitudini di spesa' };
  return { label: 'Critico', color: '#FF6B6B', description: 'Attenzione urgente alle finanze' };
}

function generateTips(insights: CategoryInsight[], state: WizardState): string[] {
  const tips: string[] = [];
  const income = totalMonthlyIncome(state.incomeSources);
  const overCategories = insights.filter(i => i.status === 'over').slice(0, 2);
  for (const cat of overCategories) {
    tips.push(`${cat.name}: spendi ${fmtEur(cat.monthlySpent)}/mese (${cat.percentOfIncome}% del reddito). Budget consigliato: ${fmtEur(cat.budget)}/mese.`);
  }
  if (state.assets.length === 0 && tips.length < 3) {
    tips.push('Considera di iniziare a investire. ETF su indici globali come VWCE permettono di partire con piccole somme mensili.');
  }
  if (state.incomeSources.length === 1 && tips.length < 3) {
    tips.push('Una sola fonte di reddito è rischiosa. Valuta dividendi, affitti o attività freelance come reddito aggiuntivo.');
  }
  const totalBalance = state.accounts.reduce((s, a) => s + a.balance, 0);
  if (income > 0 && totalBalance < income * 3 && tips.length < 3) {
    const months = Math.round(totalBalance / income);
    tips.push(`Il tuo fondo emergenza copre circa ${months} ${months === 1 ? 'mese' : 'mesi'}. L'obiettivo è 3–6 mesi di spese.`);
  }
  if (tips.length === 0) {
    tips.push('Importa il tuo estratto conto dalla schermata "Importa" per ricevere analisi dettagliate sulle spese reali.');
    tips.push('Monitora settimanalmente le tue spese per categoria: piccole variazioni quotidiane fanno grande differenza.');
    tips.push('Automatizza i risparmi: imposta un bonifico automatico il giorno dello stipendio verso un conto separato.');
  }
  return tips.slice(0, 3);
}

function isStepValid(state: WizardState): boolean {
  switch (state.step) {
    case 0: return true;
    case 1: return state.familyStatus !== null;
    case 2: return true; // Lifestyle — always valid (all fields have defaults)
    case 3: return state.housingType !== null;
    case 4: return state.workType !== null && state.incomeStability !== null;
    case 5: return state.incomeSources.length > 0;
    case 6: return true;
    case 7: return state.hasCrypto !== null;
    case 8: return state.hasInvestments !== null;
    case 9: return state.mainGoal !== null && state.effortLevel !== null;
    case 10: return true;
    case 11: return true;
    default: return true;
  }
}

// ── Shared UI components ──────────────────────────────────────────────────────

function PhaseIndicator({ step }: { step: number }) {
  const currentIdx = PHASES.findIndex(p => p.steps.includes(step));
  return (
    <View style={ui.phaseRow}>
      {PHASES.map((phase, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <React.Fragment key={phase.label}>
            {i > 0 && (
              <View style={[ui.phaseConnector, isDone && ui.phaseConnectorDone]} />
            )}
            {isDone ? (
              <View style={ui.phaseDotDone}>
                <Ionicons name="checkmark" size={9} color="#fff" />
              </View>
            ) : isActive ? (
              <View style={ui.phasePillActive}>
                <Text style={ui.phasePillActiveText}>{phase.label}</Text>
              </View>
            ) : (
              <View style={ui.phaseDotFuture}>
                <Text style={ui.phaseDotNumText}>{i + 1}</Text>
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ChipRow<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={ui.chipRow}>
      {options.map(o => (
        <TouchableOpacity
          key={o.id}
          style={[ui.chip, value === o.id && ui.chipActive]}
          onPress={() => onChange(o.id)}
          activeOpacity={0.7}
        >
          <Text style={[ui.chipText, value === o.id && ui.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Stepper({
  label, sublabel, value, onChange, min = 0, max = 10,
}: {
  label: string; sublabel?: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <View style={ui.stepperRow}>
      <View style={{ flex: 1 }}>
        <Text style={ui.stepperLabel}>{label}</Text>
        {sublabel && <Text style={ui.stepperSublabel}>{sublabel}</Text>}
      </View>
      <View style={ui.stepperControls}>
        <TouchableOpacity
          style={[ui.stepperBtn, value <= min && ui.stepperBtnDisabled]}
          onPress={() => onChange(Math.max(min, value - 1))}
          activeOpacity={0.7}
          disabled={value <= min}
        >
          <Ionicons name="remove" size={18} color={value <= min ? Colors.text.muted : Colors.text.primary} />
        </TouchableOpacity>
        <Text style={ui.stepperValue}>{value}</Text>
        <TouchableOpacity
          style={[ui.stepperBtn, value >= max && ui.stepperBtnDisabled]}
          onPress={() => onChange(Math.min(max, value + 1))}
          activeOpacity={0.7}
          disabled={value >= max}
        >
          <Ionicons name="add" size={18} color={value >= max ? Colors.text.muted : Colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PrimaryBtn({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[ui.primaryBtn, disabled && ui.primaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={ui.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function GhostBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={ui.ghostBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={ui.ghostBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── BankPickerForm ────────────────────────────────────────────────────────────

function BankPickerForm({ onConfirm, onCancel }: {
  onConfirm: (acc: Omit<BankAccount, 'id'>) => void;
  onCancel: () => void;
}) {
  const [bankQuery, setBankQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<ItalianBank | null>(null);
  const [label, setLabel] = useState('');
  const [balanceStr, setBalanceStr] = useState('');
  const filteredBanks = useMemo(() => {
    if (!bankQuery) return ITALIAN_BANKS.slice(0, 8);
    const q = bankQuery.toLowerCase();
    return ITALIAN_BANKS.filter(b =>
      b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [bankQuery]);

  const canConfirm = selectedBank !== null && label.trim().length > 0 && balanceStr.length > 0;

  return (
    <View style={ui.pickerForm}>
      {!selectedBank ? (
        <>
          <TextInput
            style={ui.textInput}
            placeholder="Cerca la tua banca…"
            placeholderTextColor={Colors.text.muted}
            value={bankQuery}
            onChangeText={setBankQuery}
            autoFocus
          />
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filteredBanks.map(b => (
              <TouchableOpacity
                key={b.id}
                style={ui.bankRow}
                onPress={() => setSelectedBank(b)}
                activeOpacity={0.7}
              >
                <View style={[ui.bankBadge, { backgroundColor: b.color + '33' }]}>
                  <Text style={[ui.bankBadgeText, { color: b.color }]}>{b.shortName[0]}</Text>
                </View>
                <Text style={ui.bankRowName}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={ui.bankSelectedRow}>
            <View style={[ui.bankBadge, { backgroundColor: selectedBank.color + '33' }]}>
              <Text style={[ui.bankBadgeText, { color: selectedBank.color }]}>{selectedBank.shortName[0]}</Text>
            </View>
            <Text style={[ui.bankRowName, { flex: 1 }]}>{selectedBank.name}</Text>
            <TouchableOpacity onPress={() => setSelectedBank(null)}>
              <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={ui.textInput}
            placeholder='Label (es. "Conto corrente")'
            placeholderTextColor={Colors.text.muted}
            value={label}
            onChangeText={setLabel}
          />
          <TextInput
            style={ui.textInput}
            placeholder="Saldo attuale (€)"
            placeholderTextColor={Colors.text.muted}
            value={balanceStr}
            onChangeText={setBalanceStr}
            keyboardType="decimal-pad"
          />
        </>
      )}
      <View style={ui.pickerActions}>
        <GhostBtn label="Annulla" onPress={onCancel} />
        {selectedBank && (
          <PrimaryBtn
            label="Aggiungi"
            onPress={() => {
              if (!selectedBank || !canConfirm) return;
              Keyboard.dismiss();
              onConfirm({
                bankId: selectedBank.id, bankName: selectedBank.name,
                accountLabel: label.trim(),
                balance: parseFloat(balanceStr.replace(',', '.')) || 0,
                lastUpdated: new Date().toISOString(),
              });
            }}
            disabled={!canConfirm}
          />
        )}
      </View>
    </View>
  );
}

// ── AssetSearch ───────────────────────────────────────────────────────────────

type AssetSearchMode =
  | { mode: 'search' }
  | { mode: 'qty'; result: LocalAsset }
  | { mode: 'directLoading'; ticker: string }
  | { mode: 'manual' };

function AssetSearch({ assetType, onAdd }: {
  assetType: 'investment' | 'crypto';
  onAdd: (a: Omit<Asset, 'id'>) => void;
}) {
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<LocalAsset[]>(
    assetType === 'investment' ? searchLocalAssets('') : []
  );
  const [cryptoResults, setCryptoResults] = useState<{ id: string; name: string; ticker: string }[]>([]);
  const [cryptoSearching, setCryptoSearching] = useState(false);
  const [uiState, setUiState] = useState<AssetSearchMode>({ mode: 'search' });
  const [qty, setQty] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTicker, setManualTicker] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debRef.current) clearTimeout(debRef.current);
    if (assetType === 'investment') {
      setLocalResults(searchLocalAssets(text));
    } else {
      if (text.trim().length > 1) {
        debRef.current = setTimeout(async () => {
          setCryptoSearching(true);
          const res = await searchCoinGecko(text);
          setCryptoResults(res.map(r => ({ id: r.id, name: r.name, ticker: r.ticker })));
          setCryptoSearching(false);
        }, 500);
      } else {
        setCryptoResults([]);
      }
    }
  }, [assetType]);

  const handleDirectLookup = async (ticker: string) => {
    setUiState({ mode: 'directLoading', ticker });
    const fetched = await lookupTickerDirect(ticker.trim().toUpperCase());
    if (fetched) {
      const local: LocalAsset = {
        id: fetched.ticker, name: fetched.name, ticker: fetched.ticker,
        type: fetched.type === 'etf' ? 'etf' : fetched.type === 'bond' ? 'bond' : 'stock',
        tags: [],
      };
      setUiState({ mode: 'qty', result: local });
    } else {
      Alert.alert(
        'Ticker non trovato',
        `Impossibile trovare "${ticker}". Puoi inserire l'asset manualmente.`,
        [
          { text: 'Inserisci manualmente', onPress: () => { setManualTicker(ticker.trim().toUpperCase()); setUiState({ mode: 'manual' }); } },
          { text: 'Riprova', style: 'cancel', onPress: () => setUiState({ mode: 'search' }) },
        ]
      );
    }
  };

  const handleAddFromResult = async (result: LocalAsset, quantity: string) => {
    const qtyNum = parseFloat(quantity.replace(',', '.')) || 0;
    if (qtyNum <= 0) return;
    if (assetType === 'crypto') {
      try {
        const fetched = await fetchCoinGeckoAsset(result.id);
        onAdd({ name: fetched.name, ticker: fetched.ticker, type: 'crypto', quantity: qtyNum, currentPrice: fetched.currentPrice, purchasePrice: fetched.currentPrice, color: nextAssetColor(), sparkline: fetched.sparkline });
      } catch {
        onAdd({ name: result.name, ticker: result.ticker, type: 'crypto', quantity: qtyNum, currentPrice: 0, purchasePrice: 0, color: nextAssetColor(), sparkline: [] });
      }
    } else {
      const fetched = await lookupTickerDirect(result.ticker);
      if (fetched) {
        onAdd({ name: fetched.name, ticker: fetched.ticker, type: fetched.type, quantity: qtyNum, currentPrice: fetched.currentPrice, purchasePrice: fetched.currentPrice, color: nextAssetColor(), sparkline: fetched.sparkline });
      } else {
        onAdd({ name: result.name, ticker: result.ticker, type: result.type === 'etf' ? 'etf' : result.type === 'bond' ? 'bond' : 'stock', quantity: qtyNum, currentPrice: 0, purchasePrice: 0, color: nextAssetColor(), sparkline: [] });
        Alert.alert('Prezzo non disponibile', 'Asset aggiunto con prezzo 0. Aggiornalo in seguito dal Portfolio.');
      }
    }
    setUiState({ mode: 'search' }); setQty(''); setQuery('');
    setLocalResults(assetType === 'investment' ? searchLocalAssets('') : []);
  };

  if (uiState.mode === 'manual') {
    return (
      <View style={ui.manualForm}>
        <Text style={ui.sectionLabel}>Inserimento manuale</Text>
        <TextInput style={ui.textInput} placeholder="Nome (es. iShares MSCI World)" placeholderTextColor={Colors.text.muted} value={manualName} onChangeText={setManualName} />
        <TextInput style={ui.textInput} placeholder="Ticker (es. SWDA.MI)" placeholderTextColor={Colors.text.muted} value={manualTicker} onChangeText={setManualTicker} autoCapitalize="characters" />
        <TextInput style={ui.textInput} placeholder="Prezzo attuale (€) — opzionale" placeholderTextColor={Colors.text.muted} value={manualPrice} onChangeText={setManualPrice} keyboardType="decimal-pad" />
        <TextInput style={ui.textInput} placeholder="Quantità" placeholderTextColor={Colors.text.muted} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
        <View style={ui.rowActions}>
          <GhostBtn label="Annulla" onPress={() => setUiState({ mode: 'search' })} />
          <PrimaryBtn label="Aggiungi" onPress={() => {
            const price = parseFloat(manualPrice.replace(',', '.')) || 0;
            const qtyNum = parseFloat(qty.replace(',', '.')) || 0;
            if (!manualName.trim() || !manualTicker.trim() || qtyNum <= 0) return;
            Keyboard.dismiss();
            onAdd({ name: manualName.trim(), ticker: manualTicker.trim().toUpperCase(), type: assetType === 'crypto' ? 'crypto' : 'stock', quantity: qtyNum, currentPrice: price, purchasePrice: price, color: nextAssetColor(), sparkline: [] });
            setManualName(''); setManualTicker(''); setManualPrice(''); setQty('');
            setUiState({ mode: 'search' });
          }} />
        </View>
      </View>
    );
  }

  if (uiState.mode === 'directLoading') {
    return (
      <View style={ui.loadingRow}>
        <ActivityIndicator size="small" color={Colors.accent.primary} />
        <Text style={ui.loadingText}>Carico {uiState.ticker}…</Text>
      </View>
    );
  }

  if (uiState.mode === 'qty') {
    const r = uiState.result;
    return (
      <View style={ui.qtyForm}>
        <View style={ui.qtyResult}>
          <View style={{ flex: 1 }}>
            <Text style={ui.qtyName}>{r.name}</Text>
            <Text style={ui.qtyMeta}>{r.type.toUpperCase()} · {r.ticker}</Text>
          </View>
          <TouchableOpacity onPress={() => setUiState({ mode: 'search' })}>
            <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
          </TouchableOpacity>
        </View>
        <TextInput style={ui.textInput} placeholder={assetType === 'crypto' ? 'Quantità (es. 0.05)' : 'Numero di quote (es. 10)'} placeholderTextColor={Colors.text.muted} value={qty} onChangeText={setQty} keyboardType="decimal-pad" autoFocus />
        <View style={ui.rowActions}>
          <GhostBtn label="Annulla" onPress={() => { setUiState({ mode: 'search' }); setQty(''); }} />
          <PrimaryBtn label="Aggiungi" onPress={() => { Keyboard.dismiss(); handleAddFromResult(r, qty); }} disabled={(parseFloat(qty.replace(',', '.')) || 0) <= 0} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={ui.textInput}
        placeholder={assetType === 'investment' ? 'Cerca per nome o ticker (es. SWDA, Vanguard…)' : 'Cerca criptovaluta (es. Bitcoin, ETH…)'}
        placeholderTextColor={Colors.text.muted}
        value={query}
        onChangeText={handleQueryChange}
        autoCapitalize="none"
      />
      {/* Direct ticker lookup */}
      {assetType === 'investment' && query.trim().length > 1 && looksLikeTicker(query) && (
        <TouchableOpacity style={ui.directLookupRow} onPress={() => handleDirectLookup(query)} activeOpacity={0.7}>
          <Ionicons name="search" size={16} color={Colors.accent.primary} />
          <Text style={ui.directLookupText}>Cerca "{query.trim().toUpperCase()}" direttamente</Text>
        </TouchableOpacity>
      )}
      {/* Crypto searching */}
      {assetType === 'crypto' && cryptoSearching && (
        <View style={ui.searchingRow}>
          <ActivityIndicator size="small" color={Colors.accent.primary} />
          <Text style={ui.loadingText}>Ricerca in corso…</Text>
        </View>
      )}
      {/* Results */}
      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {(assetType === 'investment' ? localResults : cryptoResults.map(c => ({ id: c.id, name: c.name, ticker: c.ticker, type: 'crypto' as const, source: 'coingecko' as const, tags: [] }))).map(r => (
          <TouchableOpacity
            key={r.id}
            style={ui.resultRow}
            onPress={() => setUiState({ mode: 'qty', result: r as LocalAsset })}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={ui.resultName}>{r.name}</Text>
              <Text style={ui.resultMeta}>{r.type.toUpperCase()} · {r.ticker}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.text.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Manual entry fallback */}
      <TouchableOpacity style={ui.manualEntryRow} onPress={() => setUiState({ mode: 'manual' })} activeOpacity={0.7}>
        <Ionicons name="pencil-outline" size={14} color={Colors.text.muted} />
        <Text style={ui.manualEntryText}>Inserisci manualmente</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── IncomeForm ────────────────────────────────────────────────────────────────

function IncomeForm({ onAdd }: { onAdd: (s: IncomeSource) => void }) {
  const [type, setType] = useState<IncomeType>('salary');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<'monthly' | 'annual'>('monthly');
  return (
    <View style={ui.incomeForm}>
      <View style={ui.chipRow}>
        {INCOME_TYPES.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[ui.chip, type === t.id && ui.chipActive]}
            onPress={() => setType(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[ui.chipText, type === t.id && ui.chipTextActive]}>{t.emoji} {t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={ui.incomeRow}>
        <TextInput
          style={[ui.textInput, { flex: 1 }]}
          placeholder="Importo (€)"
          placeholderTextColor={Colors.text.muted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <TouchableOpacity
          style={ui.freqBtn}
          onPress={() => setFreq(f => f === 'monthly' ? 'annual' : 'monthly')}
          activeOpacity={0.7}
        >
          <Text style={ui.freqBtnText}>{freq === 'monthly' ? '/mese' : '/anno'}</Text>
        </TouchableOpacity>
      </View>
      <PrimaryBtn
        label="Aggiungi fonte"
        onPress={() => {
          const n = parseFloat(amount.replace(',', '.'));
          if (isNaN(n) || n <= 0) return;
          const t = INCOME_TYPES.find(x => x.id === type)!;
          onAdd({ id: `inc_${Date.now()}`, type, label: t.label, amount: n, frequency: freq });
          setAmount('');
        }}
        disabled={(parseFloat(amount.replace(',', '.')) || 0) <= 0}
      />
    </View>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

// ── Draft persistence ─────────────────────────────────────────────────────────

const DRAFT_FILE = FileSystem.documentDirectory + 'onboarding_draft_v1.json';

const STEP_NAMES: Record<number, string> = {
  0:  'Benvenuto',
  1:  'Profilo personale',
  2:  'Dove vivi',
  3:  'Situazione lavorativa',
  4:  'Entrate mensili',
  5:  'Conti bancari',
  6:  'Obiettivo principale',
  7:  'Stile di vita',
  8:  'Criptovalute',
  9:  'Investimenti',
  10: 'Budget',
  11: 'Import estratti conto',
  12: 'Riepilogo',
};

function getStepName(step: number): string {
  return STEP_NAMES[step] ?? `Step ${step}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { addAccount, addAsset, addTransactions, setBudgetLimit, setMerchantRule, addGoal } = useData();
  const { settings } = useSettings();
  const [state, setState] = useState<WizardState>(INIT_STATE);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [draftState, setDraftState] = useState<WizardState | null>(null);
  const [importing, setImporting] = useState<string | null>(null); // null = idle, string = current filename
  const [regionSearch, setRegionSearch] = useState('');
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  type TxDetail = { txKey: string; merchantKey: string; displayName: string; rawDescription: string; amount: number; date: string; category: CategoryId };
  const [selectedTxDetail, setSelectedTxDetail] = useState<TxDetail | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const set = useCallback((patch: Partial<WizardState>) =>
    setState(s => ({ ...s, ...patch })), []);

  // ── Draft: load on mount ──────────────────────────────────────────────────
  useEffect(() => {
    FileSystem.readAsStringAsync(DRAFT_FILE).then((raw) => {
      try {
        const parsed: WizardState = JSON.parse(raw);
        if (parsed.step > 0 && parsed.step < 13) {
          setDraftState(parsed);
          setShowResumeDialog(true);
        }
      } catch {
        FileSystem.deleteAsync(DRAFT_FILE, { idempotent: true }).catch(() => {});
      }
    }).catch(() => {/* no draft file — fine */});
  }, []);

  // ── Draft: save on every step change ─────────────────────────────────────
  useEffect(() => {
    if (state.step <= 0 || state.step >= 13) return;
    // Exclude large imported transaction data from the draft to keep storage small.
    // The user will re-import files from step 11.
    const draft = { ...state, importedFiles: [] };
    FileSystem.writeAsStringAsync(DRAFT_FILE, JSON.stringify(draft)).catch(() => {});
  }, [state.step]);

  const nextStep = useCallback(() => {
    Keyboard.dismiss();
    setState(s => {
      const next = { ...s, step: s.step + 1 };
      // Initialize budget edits when entering step 10
      if (next.step === 10 && Object.keys(next.budgetEdits).length === 0) {
        const income = totalMonthlyIncome(next.incomeSources);
        if (income > 0) {
          const ctx: BudgetContext = {
            householdSize: next.householdSize,
            housingType: next.housingType,
            housingMonthlyCost: parseFloat(next.housingCost.replace(',', '.')) || 0,
            region: next.region,
            dependents: next.dependents,
            lifestyleProfile: next.lifestyleProfile,
          };
          const budgets = calculateBudgets(income, next.mainGoal ? [next.mainGoal] : [], next.effortLevel ?? 'moderato', ctx);
          const edits: Record<string, string> = {};
          for (const b of budgets) edits[b.category] = String(b.limit);
          next.budgetEdits = edits;
        }
      }
      return next;
    });
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  }, []);

  const prevStep = useCallback(() => {
    Keyboard.dismiss();
    setState(s => ({ ...s, step: Math.max(0, s.step - 1) }));
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  }, []);

  const income = totalMonthlyIncome(state.incomeSources);

  const calculatedBudgets = useMemo<StoredBudget[]>(() => {
    if (income <= 0) return [];
    const ctx: BudgetContext = {
      householdSize: state.householdSize,
      housingType: state.housingType,
      housingMonthlyCost: parseFloat(state.housingCost.replace(',', '.')) || 0,
      region: state.region,
      dependents: state.dependents,
      lifestyleProfile: state.lifestyleProfile,
    };
    return calculateBudgets(income, state.mainGoal ? [state.mainGoal] : [], state.effortLevel ?? 'moderato', ctx);
  }, [income, state.householdSize, state.housingType, state.housingCost, state.region, state.dependents, state.mainGoal, state.effortLevel, state.lifestyleProfile]);

  const mergedTxs = useMemo(() => mergeImportedFiles(state.importedFiles), [state.importedFiles]);

  const categoryInsights = useMemo(() =>
    getCategoryInsights(mergedTxs.length > 0 ? mergedTxs : null, calculatedBudgets, income, state.merchantOverrides),
    [mergedTxs, calculatedBudgets, income, state.merchantOverrides]
  );
  const score = useMemo(() => computeScore(state, calculatedBudgets), [state, calculatedBudgets]);
  const sl = scoreLabel(score);
  const tips = useMemo(() => generateTips(categoryInsights, state), [categoryInsights, state]);

  const handleImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;

      const useCache = settings.developer?.useAiCache ?? false;
      const importStrategy = (settings.developer?.importStrategy ?? 'smart') as ImportStrategy;
      const baseParser = parseWithGemini;

      setImporting(res.assets.length > 1 ? `${res.assets.length} file in corso…` : (res.assets[0]?.name ?? 'file'));

      const parseAsset = async (asset: (typeof res.assets)[0]) => {
        const name = (asset.name ?? '').toLowerCase();
        const t0 = Date.now();
        console.log('[Onboarding Import] hasGemini:', hasGemini, '| strategia:', importStrategy, '| file:', asset.name);

        if (hasGemini) {
          startLogSession(asset.name ?? 'file', 'gemini-2.5-flash', importStrategy);
          let result;
          try {
            if (importStrategy === 'smart') {
              result = await parseWithSmartParser(asset.uri, asset.name ?? 'file', {
                useCache,
                fullAIParser: baseParser,
                onSchemaLearned: (bankName) =>
                  console.log('[Onboarding] nuovo schema salvato per:', bankName),
              });
            } else {
              const { getCachedResult, setCachedResult } = await import('../utils/aiParserCache');
              if (useCache) {
                const cached = await getCachedResult(asset.name ?? 'file');
                if (cached) {
                  result = { ...cached, _tier: 'L1_cache' as const };
                } else {
                  const raw = await baseParser(asset.uri, asset.name ?? 'file');
                  result = { ...raw, _tier: 'L3_full_ai' as const };
                  await setCachedResult(asset.name ?? 'file', result);
                }
              } else {
                const raw = await baseParser(asset.uri, asset.name ?? 'file');
                result = { ...raw, _tier: 'L3_full_ai' as const };
              }
            }
          } catch (err) {
            const elapsed = Date.now() - t0;
            const errMsg = err instanceof Error ? err.message : String(err);
            await finishLogSession([], elapsed, undefined, errMsg);
            throw err;
          }
          const elapsed = Date.now() - t0;
          const tier: ImportTier = result._tier ?? 'L3_full_ai';
          const model: ImportModel = tier === 'L1_cache' ? 'none' : 'gemini';
          await finishLogSession(result.transactions, elapsed, tier);
          logImportEvent({
            fileName: asset.name ?? 'file',
            strategy: importStrategy,
            tier,
            model,
            processingTimeMs: elapsed,
            transactionsExtracted: result.transactions.length,
            bankName: result.bankName,
          }).catch(() => {});
          return result;
        } else if (name.endsWith('.pdf')) {
          return await parsePDF(asset.uri);
        } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
          return parseCSV(await FileSystem.readAsStringAsync(asset.uri));
        } else {
          return await parseExcel(asset.uri);
        }
      };

      const outcomes = await Promise.allSettled(res.assets.map(parseAsset));

      let totalAdded = 0;
      let errors = 0;
      const newFiles: ImportedFile[] = [];

      outcomes.forEach((outcome, i) => {
        const asset = res.assets[i];
        if (outcome.status === 'fulfilled') {
          const result = outcome.value;
          if (result.transactions.length === 0) {
            Alert.alert('Nessuna transazione', `"${asset.name}" non contiene transazioni valide.`);
            return;
          }
          newFiles.push({
            id: `imp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            fileName: asset.name ?? 'file',
            bankName: result.bankName,
            accountIndex: null,
            transactions: result.transactions,
          });
          totalAdded += result.transactions.length;
        } else {
          errors++;
          const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          Alert.alert('Errore file', `"${asset.name}": ${msg.slice(0, 120)}`);
        }
      });

      if (newFiles.length > 0) {
        setState(s => ({ ...s, importedFiles: [...s.importedFiles, ...newFiles] }));
      }

      if (res.assets.length > 1 || errors > 0) {
        sendImportNotification(totalAdded, res.assets.length, errors).catch(() => {});
      }
    } finally {
      setImporting(null);
    }
  };

  const handleComplete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      const ts = Date.now();
      const accountIds = state.accounts.map((_, i) => `acc_${ts}_${i}`);
      for (let i = 0; i < state.accounts.length; i++) {
        addAccount({ ...state.accounts[i], lastUpdated: new Date().toISOString() }, accountIds[i]);
      }
      for (const a of [...state.cryptoAssets, ...state.assets]) addAsset(a);
      const finalBudgets = calculatedBudgets;
      for (const b of finalBudgets) {
        const override = state.budgetEdits[b.category];
        const limit = override !== undefined ? (parseInt(override, 10) || b.limit) : b.limit;
        setBudgetLimit(b.category, limit);
      }
      // Persist merchant overrides set during onboarding
      for (const [key, cat] of Object.entries(state.merchantOverrides)) {
        setMerchantRule(key, cat as CategoryId);
      }
      const mergedForSave = mergeImportedFiles(state.importedFiles, accountIds);
      if (mergedForSave.length > 0) addTransactions(mergedForSave);

      await FileSystem.deleteAsync(DRAFT_FILE, { idempotent: true }).catch(() => {});
      await saveOnboardingData({
        completed: true,
        completedAt: new Date().toISOString(),
        monthlyIncome: income,
        goals: state.mainGoal ? [state.mainGoal] : [],
        incomeSources: state.incomeSources,
        mainGoal: state.mainGoal ?? undefined,
        effortLevel: state.effortLevel ?? undefined,
        userProfile: {
          name: state.userName || undefined,
          birthYear: state.birthYear ? parseInt(state.birthYear, 10) : undefined,
          region: state.region ?? undefined,
          familyStatus: state.familyStatus ?? 'single',
          householdSize: state.householdSize,
          dependents: state.dependents,
        },
        housingInfo: state.housingType ? {
          type: state.housingType,
          monthlyCost: parseFloat(state.housingCost.replace(',', '.')) || 0,
        } : undefined,
        workInfo: state.workType ? {
          type: state.workType,
          sector: state.workSector ?? undefined,
          stability: state.incomeStability ?? 'stable',
        } : undefined,
        lifestyleProfile: state.lifestyleProfile,
      });
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Errore', 'Impossibile salvare i dati. Riprova.');
      setCompleting(false);
    }
  };

  // ── Step renderers ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (state.step) {

      // ── Step 0: Welcome ───────────────────────────────────────────────────
      case 0:
        return (
          <LinearGradient colors={['#1a1040', '#0A0B0F']} style={s.welcomeGradient}>
            <SafeAreaView style={s.welcomeSafe} edges={['top', 'bottom']}>
              <View style={s.welcomeContent}>
                <View style={s.welcomeIconWrap}>
                  <Ionicons name="bar-chart" size={48} color={Colors.accent.primary} />
                </View>
                <Text style={s.welcomeTitle}>FinancialOS</Text>
                <Text style={s.welcomeSubtitle}>La tua guida finanziaria personale</Text>
                <View style={s.welcomeFeatures}>
                  {[
                    { icon: 'analytics-outline', text: 'Analisi intelligente delle spese' },
                    { icon: 'wallet-outline', text: 'Budget personalizzati sul tuo profilo' },
                    { icon: 'trending-up-outline', text: 'Portfolio e investimenti in un posto' },
                  ].map(f => (
                    <View key={f.icon} style={s.welcomeFeatureRow}>
                      <Ionicons name={f.icon as never} size={20} color={Colors.accent.primary} />
                      <Text style={s.welcomeFeatureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.welcomeNote}>
                  L'onboarding richiede ~5 minuti. Più informazioni fornisci, più precisi saranno i tuoi budget.
                </Text>
              </View>
              <View style={s.welcomeActions}>
                <PrimaryBtn label="Inizia →" onPress={nextStep} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        );

      // ── Step 1: Chi sei ───────────────────────────────────────────────────
      case 1:
        return (
          <>
            <Text style={s.stepTitle}>Chi sei</Text>
            <Text style={s.stepSubtitle}>Useremo questi dati per proporti un budget realistico e per il tuo profilo fiscale</Text>

            <Text style={s.fieldLabel}>Nome (opzionale)</Text>
            <TextInput
              style={ui.textInput}
              placeholder="Come ti chiami?"
              placeholderTextColor={Colors.text.muted}
              value={state.userName}
              onChangeText={v => set({ userName: v })}
            />

            <Text style={s.fieldLabel}>Anno di nascita (opzionale)</Text>
            <TextInput
              style={ui.textInput}
              placeholder="es. 1990"
              placeholderTextColor={Colors.text.muted}
              value={state.birthYear}
              onChangeText={v => set({ birthYear: v })}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={s.fieldLabel}>Stato civile *</Text>
            <ChipRow
              options={FAMILY_STATUS_OPTIONS}
              value={state.familyStatus}
              onChange={v => set({ familyStatus: v })}
            />

            <View style={s.stepperSection}>
              <Stepper
                label="Componenti del nucleo familiare"
                sublabel="Includi te stesso/a"
                value={state.householdSize}
                onChange={v => set({ householdSize: v })}
                min={1}
                max={10}
              />
              <View style={ui.divider} />
              <Stepper
                label="Figli a carico"
                sublabel="Under 26 o non indipendenti"
                value={state.dependents}
                onChange={v => set({ dependents: v })}
                min={0}
                max={8}
              />
            </View>
          </>
        );

      // ── Step 2: Stile di vita ─────────────────────────────────────────────
      case 2:
        return (
          <>
            <Text style={s.stepTitle}>Stile di vita</Text>
            <Text style={s.stepSubtitle}>Sport, viaggi e ristoranti avranno budget calibrati sulle tue abitudini reali</Text>

            <Text style={s.fieldLabel}>Attività sportiva</Text>
            <View style={s.housingGrid}>
              {SPORT_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.housingCard, state.lifestyleProfile.sportFrequency === o.id && s.housingCardActive]}
                  onPress={() => set({ lifestyleProfile: { ...state.lifestyleProfile, sportFrequency: o.id } })}
                  activeOpacity={0.7}
                >
                  <Text style={s.housingEmoji}>{o.emoji}</Text>
                  <Text style={[s.housingLabel, state.lifestyleProfile.sportFrequency === o.id && s.housingLabelActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Viaggi all'anno</Text>
            <View style={s.housingGrid}>
              {TRAVEL_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.housingCard, state.lifestyleProfile.travelFrequency === o.id && s.housingCardActive]}
                  onPress={() => set({ lifestyleProfile: { ...state.lifestyleProfile, travelFrequency: o.id } })}
                  activeOpacity={0.7}
                >
                  <Text style={s.housingEmoji}>{o.emoji}</Text>
                  <Text style={[s.housingLabel, state.lifestyleProfile.travelFrequency === o.id && s.housingLabelActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Mangi fuori casa</Text>
            <View style={s.housingGrid}>
              {DINING_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.housingCard, state.lifestyleProfile.diningOutFrequency === o.id && s.housingCardActive]}
                  onPress={() => set({ lifestyleProfile: { ...state.lifestyleProfile, diningOutFrequency: o.id } })}
                  activeOpacity={0.7}
                >
                  <Text style={s.housingEmoji}>{o.emoji}</Text>
                  <Text style={[s.housingLabel, state.lifestyleProfile.diningOutFrequency === o.id && s.housingLabelActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Hobby (più risposte)</Text>
            <View style={ui.chipRow}>
              {HOBBY_OPTIONS.map(o => {
                const selected = state.lifestyleProfile.hobbies.includes(o.id);
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[ui.chip, selected && ui.chipActive]}
                    onPress={() => {
                      const hobbies = selected
                        ? state.lifestyleProfile.hobbies.filter(h => h !== o.id)
                        : [...state.lifestyleProfile.hobbies, o.id];
                      set({ lifestyleProfile: { ...state.lifestyleProfile, hobbies } });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[ui.chipText, selected && ui.chipTextActive]}>{o.emoji} {o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );

      // ── Step 3: Dove vivi ─────────────────────────────────────────────────
      case 3:
        return (
          <>
            <Text style={s.stepTitle}>Dove vivi</Text>
            <Text style={s.stepSubtitle}>Regione e abitazione incidono sul costo della vita — rendiamo i tuoi budget più precisi</Text>

            <Text style={s.fieldLabel}>Regione (opzionale)</Text>
            <TouchableOpacity
              style={[ui.textInput, s.regionPicker]}
              onPress={() => setShowRegionPicker(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={{ color: state.region ? Colors.text.primary : Colors.text.muted, ...Typography.body }}>
                {state.region ?? 'Seleziona la tua regione…'}
              </Text>
              <Ionicons name={showRegionPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.muted} />
            </TouchableOpacity>
            {showRegionPicker && (
              <View style={s.regionDropdown}>
                <TextInput
                  style={[ui.textInput, { marginBottom: 8 }]}
                  placeholder="Filtra regione…"
                  placeholderTextColor={Colors.text.muted}
                  value={regionSearch}
                  onChangeText={setRegionSearch}
                />
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {ITALIAN_REGIONS.filter(r => !regionSearch || r.toLowerCase().includes(regionSearch.toLowerCase())).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={s.regionOption}
                      onPress={() => { set({ region: r }); setShowRegionPicker(false); setRegionSearch(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.regionOptionText, state.region === r && { color: Colors.accent.primary }]}>{r}</Text>
                      {state.region === r && <Ionicons name="checkmark" size={16} color={Colors.accent.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Tipo di abitazione *</Text>
            <View style={s.housingGrid}>
              {HOUSING_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.housingCard, state.housingType === o.id && s.housingCardActive]}
                  onPress={() => set({ housingType: o.id })}
                  activeOpacity={0.7}
                >
                  <Text style={s.housingEmoji}>{o.emoji}</Text>
                  <Text style={[s.housingLabel, state.housingType === o.id && s.housingLabelActive]}>{o.label}</Text>
                  <Text style={s.housingDesc}>{o.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(state.housingType === 'renter' || state.housingType === 'owner') && (
              <>
                <Text style={[s.fieldLabel, { marginTop: 20 }]}>
                  {state.housingType === 'renter' ? 'Affitto mensile (€, opzionale)' : 'Rata mutuo mensile (€, opzionale)'}
                </Text>
                <TextInput
                  style={ui.textInput}
                  placeholder="es. 800"
                  placeholderTextColor={Colors.text.muted}
                  value={state.housingCost}
                  onChangeText={v => set({ housingCost: v })}
                  keyboardType="decimal-pad"
                />
              </>
            )}
          </>
        );

      // ── Step 4: Lavoro ────────────────────────────────────────────────────
      case 4:
        return (
          <>
            <Text style={s.stepTitle}>Lavoro & Stabilità</Text>
            <Text style={s.stepSubtitle}>La stabilità lavorativa determina la riserva di emergenza ideale e la tua deducibilità fiscale</Text>

            <Text style={s.fieldLabel}>Tipo di lavoro *</Text>
            <View style={s.workGrid}>
              {WORK_TYPE_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.workCard, state.workType === o.id && s.workCardActive]}
                  onPress={() => set({ workType: o.id })}
                  activeOpacity={0.7}
                >
                  <Text style={s.workEmoji}>{o.emoji}</Text>
                  <Text style={[s.workLabel, state.workType === o.id && s.workLabelActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Settore (opzionale)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sectorScroll}>
              {WORK_SECTORS.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[ui.chip, state.workSector === sec && ui.chipActive, { marginRight: 8 }]}
                  onPress={() => set({ workSector: state.workSector === sec ? null : sec })}
                  activeOpacity={0.7}
                >
                  <Text style={[ui.chipText, state.workSector === sec && ui.chipTextActive]}>{sec}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Stabilità del reddito *</Text>
            <View style={s.stabilityCards}>
              {STABILITY_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.stabilityCard, state.incomeStability === o.id && s.stabilityCardActive]}
                  onPress={() => set({ incomeStability: o.id })}
                  activeOpacity={0.7}
                >
                  <Text style={s.stabilityEmoji}>{o.emoji}</Text>
                  <Text style={[s.stabilityLabel, state.incomeStability === o.id && s.stabilityLabelActive]}>{o.label}</Text>
                  <Text style={s.stabilityDesc}>{o.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      // ── Step 5: Entrate ───────────────────────────────────────────────────
      case 5:
        return (
          <>
            <Text style={s.stepTitle}>Le tue entrate</Text>
            <Text style={s.stepSubtitle}>Il reddito complessivo è la base per calcolare percentuali di risparmio reali e tasse dovute</Text>

            {state.incomeSources.length > 0 && (
              <View style={s.incomeList}>
                {state.incomeSources.map(src => (
                  <View key={src.id} style={s.incomeItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.incomeItemLabel}>{src.label}</Text>
                      <Text style={s.incomeItemAmount}>{fmtEur(monthlyAmount(src))}/mese {src.frequency === 'annual' ? `(${fmtEur(src.amount)}/anno)` : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => set({ incomeSources: state.incomeSources.filter(x => x.id !== src.id) })}>
                      <Ionicons name="trash-outline" size={18} color={Colors.semantic.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={s.incomeTotalRow}>
                  <Text style={s.incomeTotalLabel}>Totale mensile netto</Text>
                  <Text style={s.incomeTotalAmount}>{fmtEur(income)}</Text>
                </View>
              </View>
            )}

            {showAddIncome ? (
              <View style={s.incomeBorder}>
                <IncomeForm onAdd={src => { set({ incomeSources: [...state.incomeSources, src] }); setShowAddIncome(false); }} />
                <GhostBtn label="Annulla" onPress={() => setShowAddIncome(false)} />
              </View>
            ) : (
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddIncome(true)} activeOpacity={0.7}>
                <Ionicons name="add-circle" size={20} color={Colors.accent.primary} />
                <Text style={s.addBtnText}>Aggiungi fonte di reddito</Text>
              </TouchableOpacity>
            )}
          </>
        );

      // ── Step 6: Conti bancari ─────────────────────────────────────────────
      case 6:
        return (
          <>
            <Text style={s.stepTitle}>I tuoi conti bancari</Text>
            <Text style={s.stepSubtitle}>I saldi compongono il tuo patrimonio netto visibile in Dashboard — puoi aggiungere o modificare in seguito</Text>

            {state.accounts.length > 0 && (
              <View style={s.accountList}>
                {state.accounts.map((acc, i) => (
                  <View key={i} style={s.accountItem}>
                    <View style={s.accountDot}>
                      <Text style={s.accountDotText}>{acc.bankName[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.accountName}>{acc.bankName}</Text>
                      <Text style={s.accountLabel}>{acc.accountLabel}</Text>
                    </View>
                    <Text style={s.accountBalance}>{fmtEur(acc.balance)}</Text>
                    <TouchableOpacity onPress={() => set({ accounts: state.accounts.filter((_, j) => j !== i) })}>
                      <Ionicons name="close-circle" size={18} color={Colors.text.muted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {showAddAccount ? (
              <View style={s.incomeBorder}>
                <BankPickerForm
                  onConfirm={acc => { set({ accounts: [...state.accounts, acc] }); setShowAddAccount(false); }}
                  onCancel={() => setShowAddAccount(false)}
                />
              </View>
            ) : (
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddAccount(true)} activeOpacity={0.7}>
                <Ionicons name="add-circle" size={20} color={Colors.accent.primary} />
                <Text style={s.addBtnText}>Aggiungi conto</Text>
              </TouchableOpacity>
            )}

            {state.accounts.length === 0 && (
              <Text style={s.skipHint}>Puoi saltare e aggiungere i conti in seguito dalle Impostazioni</Text>
            )}
          </>
        );

      // ── Step 7: Crypto ────────────────────────────────────────────────────
      case 7:
        return (
          <>
            <Text style={s.stepTitle}>Criptovalute</Text>
            <Text style={s.stepSubtitle}>Le crypto contribuiscono al patrimonio totale e al grafico di diversificazione del portfolio</Text>

            {state.hasCrypto === null && (
              <View style={s.yesNoCards}>
                <TouchableOpacity style={s.yesNoCard} onPress={() => set({ hasCrypto: true })} activeOpacity={0.7}>
                  <Text style={s.yesNoEmoji}>₿</Text>
                  <Text style={s.yesNoLabel}>Sì, ho crypto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.yesNoCard, s.yesNoCardNo]} onPress={() => set({ hasCrypto: false })} activeOpacity={0.7}>
                  <Text style={s.yesNoEmoji}>🚫</Text>
                  <Text style={s.yesNoLabel}>No, non ho crypto</Text>
                </TouchableOpacity>
              </View>
            )}

            {state.hasCrypto === false && (
              <View style={s.noInvestTip}>
                <Ionicons name="information-circle-outline" size={28} color={Colors.accent.primary} />
                <Text style={s.noInvestText}>Nessun problema! Puoi sempre aggiungere criptovalute in seguito dal Portfolio.</Text>
              </View>
            )}

            {state.hasCrypto === true && (
              <>
                {state.cryptoAssets.length > 0 && (
                  <View style={s.assetChips}>
                    {state.cryptoAssets.map((a, i) => (
                      <View key={i} style={[s.assetChip, { borderColor: a.color }]}>
                        <Text style={s.assetChipText}>{a.ticker} × {a.quantity}</Text>
                        <TouchableOpacity onPress={() => set({ cryptoAssets: state.cryptoAssets.filter((_, j) => j !== i) })}>
                          <Ionicons name="close" size={14} color={Colors.text.muted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={s.fieldLabel}>Cerca criptovaluta (opzionale, puoi aggiungere in seguito)</Text>
                <AssetSearch assetType="crypto" onAdd={a => set({ cryptoAssets: [...state.cryptoAssets, a] })} />
              </>
            )}
          </>
        );

      // ── Step 8: Investimenti ──────────────────────────────────────────────
      case 8:
        return (
          <>
            <Text style={s.stepTitle}>Investimenti</Text>
            <Text style={s.stepSubtitle}>Azioni, ETF e obbligazioni vengono monitorati automaticamente con prezzi aggiornati</Text>

            {state.hasInvestments === null && (
              <View style={s.yesNoCards}>
                <TouchableOpacity style={s.yesNoCard} onPress={() => set({ hasInvestments: true })} activeOpacity={0.7}>
                  <Text style={s.yesNoEmoji}>📈</Text>
                  <Text style={s.yesNoLabel}>Sì, ho investimenti</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.yesNoCard, s.yesNoCardNo]} onPress={() => set({ hasInvestments: false })} activeOpacity={0.7}>
                  <Text style={s.yesNoEmoji}>🚀</Text>
                  <Text style={s.yesNoLabel}>No, voglio iniziare</Text>
                </TouchableOpacity>
              </View>
            )}

            {state.hasInvestments === false && (
              <View style={s.noInvestTip}>
                <Ionicons name="bulb-outline" size={28} color={Colors.accent.primary} />
                <Text style={s.noInvestText}>Perfetto! Dopo l'onboarding ti daremo consigli su come iniziare con piccole somme mensili.</Text>
              </View>
            )}

            {state.hasInvestments === true && (
              <>
                {state.assets.length > 0 && (
                  <View style={s.assetChips}>
                    {state.assets.map((a, i) => (
                      <View key={i} style={[s.assetChip, { borderColor: a.color }]}>
                        <Text style={s.assetChipText}>{a.ticker} × {a.quantity}</Text>
                        <TouchableOpacity onPress={() => set({ assets: state.assets.filter((_, j) => j !== i) })}>
                          <Ionicons name="close" size={14} color={Colors.text.muted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={s.fieldLabel}>Aggiungi investimento (opzionale, puoi aggiungere in seguito)</Text>
                <AssetSearch assetType="investment" onAdd={a => set({ assets: [...state.assets, a] })} />
              </>
            )}
          </>
        );

      // ── Step 9: Obiettivi & Impegno ───────────────────────────────────────
      case 9:
        return (
          <>
            <Text style={s.stepTitle}>Obiettivi & Impegno</Text>
            <Text style={s.stepSubtitle}>Obiettivo e livello di impegno definiscono quanto risparmiare ogni mese in modo sostenibile</Text>

            <Text style={s.fieldLabel}>Qual è il tuo obiettivo principale? *</Text>
            <View style={s.goalGrid}>
              {GOAL_OPTIONS.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[s.goalCard, state.mainGoal === g.id && s.goalCardActive]}
                  onPress={() => set({ mainGoal: g.id })}
                  activeOpacity={0.7}
                >
                  <Text style={s.goalEmoji}>{g.emoji}</Text>
                  <Text style={[s.goalLabel, state.mainGoal === g.id && s.goalLabelActive]}>{g.label}</Text>
                  <Text style={s.goalDesc}>{g.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 24 }]}>Livello di impegno *</Text>
            <View style={s.effortCards}>
              {EFFORT_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.effortCard, state.effortLevel === o.id && s.effortCardActive]}
                  onPress={() => set({ effortLevel: o.id })}
                  activeOpacity={0.7}
                >
                  <View style={s.effortHeader}>
                    <Text style={s.effortEmoji}>{o.emoji}</Text>
                    <Text style={[s.effortLabel, state.effortLevel === o.id && s.effortLabelActive]}>{o.label}</Text>
                    <Text style={[s.effortSaving, { color: state.effortLevel === o.id ? Colors.accent.primary : Colors.text.muted }]}>{o.saving}</Text>
                  </View>
                  <Text style={s.effortDesc}>{o.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {state.mainGoal && state.effortLevel && income > 0 && (
              <View style={s.savingPreview}>
                <Ionicons name="save-outline" size={18} color={Colors.semantic.success} />
                <Text style={s.savingPreviewText}>
                  Con questo impegno puoi risparmiare circa{' '}
                  <Text style={{ color: Colors.semantic.success, fontWeight: '700' }}>
                    {fmtEur(calculatedBudgets.length > 0 ? income - calculatedBudgets.reduce((s, b) => s + b.limit, 0) : 0)}/mese
                  </Text>
                </Text>
              </View>
            )}

          </>
        );

      // ── Step 10: Importa estratti conto (multi-file) ─────────────────────
      case 10: {
        const totalRaw = state.importedFiles.reduce((s, f) => s + f.transactions.length, 0);
        const dedupRemoved = totalRaw - mergedTxs.length;
        return (
          <>
            <Text style={s.stepTitle}>Estratti conto</Text>
            <Text style={s.stepSubtitle}>
              Importa i tuoi estratti per trasformare dati grezzi in analisi e budget basati sulle spese reali
            </Text>

            {/* Imported files list */}
            {state.importedFiles.map((file, fi) => (
              <View key={file.id} style={s.importedCard}>
                <View style={s.importedCardTop}>
                  <Ionicons name="document-text" size={22} color={Colors.accent.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.importedTitle} numberOfLines={1}>{file.fileName}</Text>
                    <Text style={s.importedSub}>{file.bankName} · {file.transactions.length} transazioni</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setState(s => ({ ...s, importedFiles: s.importedFiles.filter(f => f.id !== file.id) }))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
                  </TouchableOpacity>
                </View>
                {state.accounts.length > 0 && (
                  <View style={s.accountChipRow}>
                    <Text style={s.accountChipLabel}>Conto:</Text>
                    <TouchableOpacity
                      style={[s.accountChip, file.accountIndex === null && s.accountChipActive]}
                      onPress={() => setState(s => ({
                        ...s,
                        importedFiles: s.importedFiles.map(f => f.id === file.id ? { ...f, accountIndex: null } : f),
                      }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.accountChipText, file.accountIndex === null && s.accountChipTextActive]}>Nessuno</Text>
                    </TouchableOpacity>
                    {state.accounts.map((acc, ai) => (
                      <TouchableOpacity
                        key={ai}
                        style={[s.accountChip, file.accountIndex === ai && s.accountChipActive]}
                        onPress={() => setState(s => ({
                          ...s,
                          importedFiles: s.importedFiles.map(f => f.id === file.id ? { ...f, accountIndex: ai } : f),
                        }))}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.accountChipText, file.accountIndex === ai && s.accountChipTextActive]} numberOfLines={1}>
                          {acc.accountLabel || acc.bankName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* Dedup info */}
            {dedupRemoved > 0 && (
              <View style={s.dedupNote}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.accent.primary} />
                <Text style={s.dedupNoteText}>
                  {dedupRemoved} transazioni duplicate rimosse · {mergedTxs.length} uniche totali
                </Text>
              </View>
            )}

            {/* Add file button */}
            {importing ? (
              <View style={s.importingRow}>
                <ActivityIndicator color={Colors.accent.primary} />
                <Text style={s.loadingText} numberOfLines={1}>
                  {importing}…
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={s.addFileBtn} onPress={handleImport} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={20} color={Colors.accent.primary} />
                <Text style={s.addFileBtnText}>
                  {state.importedFiles.length === 0 ? 'Seleziona file (anche più di uno)' : 'Aggiungi altri file'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={s.importNote}>
              <Ionicons name="lock-closed-outline" size={14} color={Colors.text.muted} />
              <Text style={s.importNoteText}>I dati rimangono solo sul tuo dispositivo</Text>
            </View>
          </>
        );
      }

      // ── Step 11: Analisi & Budget ─────────────────────────────────────────
      case 11:
        return (
          <>
            <Text style={s.stepTitle}>La tua analisi</Text>
            <Text style={s.stepSubtitle}>
              {mergedTxs.length > 0 ? `Basata su ${mergedTxs.length} transazioni importate e sul tuo profilo` : 'Basata sul tuo profilo — importa un estratto per analisi più precise'}
            </Text>

            {/* Score circle */}
            <View style={s.scoreSection}>
              <View style={[s.scoreCircle, { borderColor: sl.color }]}>
                <Text style={[s.scoreValue, { color: sl.color }]}>{score}</Text>
                <Text style={s.scoreMax}>/100</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.scoreLabel, { color: sl.color }]}>{sl.label}</Text>
                <Text style={s.scoreDesc}>{sl.description}</Text>
              </View>
            </View>

            {/* Category insights */}
            {categoryInsights.length > 0 && (
              <View style={s.insightsSection}>
                <Text style={s.sectionHeader}>📊 Analisi spese</Text>
                {categoryInsights.map(ci => {
                  const statusColor = ci.status === 'over' ? Colors.semantic.danger : ci.status === 'warning' ? Colors.semantic.warning : Colors.semantic.success;
                  const isExpanded = !!expandedCategories[ci.id];
                  const txsToShow = ci.topTxs;
                  return (
                    <View key={ci.id} style={s.insightRow}>
                      {/* Tappable header */}
                      <TouchableOpacity
                        style={s.insightHeader}
                        activeOpacity={0.7}
                        onPress={() => setExpandedCategories(p => ({ ...p, [ci.id]: !p[ci.id] }))}
                      >
                        <View style={s.insightLeft}>
                          <View style={[s.insightIconWrap, { backgroundColor: ci.bgColor }]}>
                            <Ionicons name={ci.icon as any} size={18} color={ci.color} />
                          </View>
                          <View>
                            <Text style={s.insightName}>{ci.name}</Text>
                            <Text style={s.insightMeta}>
                              {ci.percentOfIncome}% del reddito
                              {ci.monthsCount > 1 ? ` · media ${ci.monthsCount} mesi` : ''}
                            </Text>
                          </View>
                        </View>
                        <View style={s.insightRight}>
                          <Text style={[s.insightAmount, { color: statusColor }]}>
                            {fmtEur(ci.monthlySpent)}/m
                          </Text>
                          <Text style={s.insightBudget}>budget {fmtEur(ci.budget)}</Text>
                        </View>
                        {ci.status !== 'ok' ? (
                          <Ionicons
                            name={ci.status === 'over' ? 'alert-circle' : 'warning'}
                            size={16}
                            color={statusColor}
                            style={{ marginLeft: 6 }}
                          />
                        ) : (
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={Colors.text.muted}
                            style={{ marginLeft: 6 }}
                          />
                        )}
                      </TouchableOpacity>

                      {/* Expanded: transaction list — tap to open detail/reclassify modal */}
                      {isExpanded && txsToShow.length > 0 && (
                        <View style={[s.insightDetail, { borderLeftColor: statusColor }]}>
                          <Text style={s.insightDetailHeader}>TRANSAZIONI (tocca per dettaglio)</Text>
                          {txsToShow.map((t, i) => {
                            const txCat = CATEGORIES[t.category];
                            return (
                              <TouchableOpacity
                                key={i}
                                style={s.insightTxRow}
                                onPress={() => setSelectedTxDetail(t)}
                                activeOpacity={0.7}
                              >
                                <View style={s.insightTxInfo}>
                                  <Text style={s.insightDetailName} numberOfLines={1}>{t.displayName}</Text>
                                  <Text style={s.insightTxDate}>{t.date.slice(0, 7)}</Text>
                                </View>
                                <Text style={s.insightDetailVal}>€{t.amount.toFixed(0)}</Text>
                                <View style={[s.txCatChip, { backgroundColor: txCat?.bgColor ?? Colors.accent.glow }]}>
                                  <Ionicons name={(txCat?.icon ?? 'help') as any} size={11} color={txCat?.color ?? Colors.accent.primary} />
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* For over/warning, also show merchants when NOT expanded */}
                      {!isExpanded && ci.status !== 'ok' && ci.topMerchants.length > 0 && (
                        <View style={[s.insightDetail, { borderLeftColor: statusColor }]}>
                          {ci.topMerchants.slice(0, 2).map(m => (
                            <View key={m.name} style={s.insightDetailRow}>
                              <Text style={s.insightDetailName} numberOfLines={1}>{m.name}</Text>
                              <Text style={s.insightDetailVal}>€{m.total.toFixed(0)} · {m.count}×</Text>
                            </View>
                          ))}
                          <TouchableOpacity onPress={() => setExpandedCategories(p => ({ ...p, [ci.id]: true }))} activeOpacity={0.7}>
                            <Text style={s.insightShowMore}>Vedi tutte le transazioni →</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Tips */}
            <View style={s.tipsSection}>
              <Text style={s.sectionHeader}>💡 Consigli per te</Text>
              {tips.map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipBullet}><Text style={s.tipBulletText}>{i + 1}</Text></View>
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            {/* Editable budgets */}
            {calculatedBudgets.length > 0 && (
              <View style={s.budgetSection}>
                <Text style={s.sectionHeader}>📋 Budget mensili</Text>
                <Text style={s.budgetNote}>Calcolati sul tuo profilo — modificali liberamente</Text>
                {income > 0 && (
                  <View style={s.residuoBar}>
                    <Text style={s.residuoLabel}>Reddito: {fmtEur(income)}</Text>
                    <Text style={[s.residuoValue, {
                      color: income - Object.values(state.budgetEdits).reduce((s, v) => s + (parseInt(v, 10) || 0), 0) >= 0
                        ? Colors.semantic.success : Colors.semantic.danger
                    }]}>
                      Residuo: {fmtEur(income - Object.values(state.budgetEdits).reduce((s, v) => s + (parseInt(v, 10) || 0), 0))}
                    </Text>
                  </View>
                )}
                {calculatedBudgets.map(b => {
                  const cat = CATEGORIES[b.category];
                  return (
                    <View key={b.id} style={s.budgetRow}>
                      <View style={[s.budgetIconWrap, { backgroundColor: cat?.bgColor ?? Colors.accent.glow }]}>
                        <Ionicons name={(cat?.icon ?? 'cash') as any} size={16} color={cat?.color ?? Colors.accent.primary} />
                      </View>
                      <Text style={s.budgetName}>{cat?.label ?? b.category}</Text>
                      <View style={s.budgetInputWrap}>
                        <Text style={s.budgetEur}>€</Text>
                        <TextInput
                          style={s.budgetInput}
                          value={state.budgetEdits[b.category] ?? String(b.limit)}
                          onChangeText={v => set({ budgetEdits: { ...state.budgetEdits, [b.category]: v.replace(/[^0-9]/g, '') } })}
                          keyboardType="number-pad"
                        />
                        <Text style={s.budgetPer}>/m</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        );

      // ── Step 12: Tutto pronto ────────────────────────────────────────────
      case 12:
        return (
          <View style={s.doneContent}>
            <View style={s.doneIcon}>
              <Ionicons name="checkmark-circle" size={80} color={Colors.semantic.success} />
            </View>
            <Text style={s.doneTitle}>
              {state.userName ? `Tutto pronto, ${state.userName}!` : 'Tutto pronto!'}
            </Text>
            <Text style={s.doneSubtitle}>Il tuo profilo finanziario è configurato</Text>
            <View style={s.summaryCards}>
              {state.accounts.length > 0 && (
                <View style={s.summaryCard}>
                  <Ionicons name="wallet-outline" size={22} color={Colors.accent.primary} />
                  <Text style={s.summaryCardValue}>{state.accounts.length} {state.accounts.length === 1 ? 'conto' : 'conti'}</Text>
                  <Text style={s.summaryCardLabel}>{fmtEur(state.accounts.reduce((s, a) => s + a.balance, 0))}</Text>
                </View>
              )}
              {calculatedBudgets.length > 0 && (
                <View style={s.summaryCard}>
                  <Ionicons name="pie-chart-outline" size={22} color={Colors.accent.primary} />
                  <Text style={s.summaryCardValue}>{calculatedBudgets.length} budget</Text>
                  <Text style={s.summaryCardLabel}>configurati</Text>
                </View>
              )}
              {(state.cryptoAssets.length + state.assets.length) > 0 && (
                <View style={s.summaryCard}>
                  <Ionicons name="trending-up-outline" size={22} color={Colors.accent.primary} />
                  <Text style={s.summaryCardValue}>{state.cryptoAssets.length + state.assets.length} asset</Text>
                  <Text style={s.summaryCardLabel}>in portfolio</Text>
                </View>
              )}
              {mergedTxs.length > 0 && (
                <View style={s.summaryCard}>
                  <Ionicons name="analytics-outline" size={22} color={Colors.semantic.success} />
                  <Text style={s.summaryCardValue}>{mergedTxs.length} tx</Text>
                  <Text style={s.summaryCardLabel}>importate</Text>
                </View>
              )}
            </View>
            <View style={{ width: '100%' }}>
              <PrimaryBtn
                label={completing ? 'Salvataggio…' : 'Entra nell\'app →'}
                onPress={handleComplete}
                disabled={completing}
              />
            </View>
          </View>
        );

      default: return null;
    }
  };

  // ── Resume dialog ─────────────────────────────────────────────────────────
  if (showResumeDialog && draftState) {
    const pct = Math.round((draftState.step / 12) * 100);
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.resumeDialog}>
          <View style={s.resumeIconWrap}>
            <Ionicons name="bookmark" size={32} color={Colors.accent.primary} />
          </View>
          <Text style={s.resumeTitle}>Continua da dove eri rimasto</Text>
          <Text style={s.resumeMessage}>
            Hai completato il {pct}% del profilo (step {draftState.step} di 12).
          </Text>

          <View style={s.resumeSummary}>
            <Text style={s.resumeLabel}>Ultimo step completato</Text>
            <Text style={s.resumeValue}>{getStepName(draftState.step)}</Text>
            <View style={s.resumeProgressBar}>
              <View style={[s.resumeProgressFill, { width: `${pct}%` as any }]} />
            </View>
          </View>

          <View style={s.resumeActions}>
            <TouchableOpacity
              style={s.resumeBtnSecondary}
              activeOpacity={0.7}
              onPress={() => {
                FileSystem.deleteAsync(DRAFT_FILE, { idempotent: true }).catch(() => {});
                setShowResumeDialog(false);
                setDraftState(null);
              }}
            >
              <Text style={s.resumeBtnSecondaryText}>Ricomincia da capo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.resumeBtnPrimary}
              activeOpacity={0.8}
              onPress={() => {
                setState(draftState);
                setShowResumeDialog(false);
              }}
            >
              <Text style={s.resumeBtnPrimaryText}>Continua →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Welcome step: full screen ─────────────────────────────────────────────
  if (state.step === 0) return renderStep() as React.ReactElement;

  // ── Done step: centered ───────────────────────────────────────────────────
  if (state.step === 12) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.contentDone} showsVerticalScrollIndicator={false}>
          {renderStep()}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Standard steps 1–9 ───────────────────────────────────────────────────
  const showProgress = state.step >= 1 && state.step <= PROGRESS_STEPS;
  const valid = isStepValid(state);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={prevStep} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        {showProgress && (
          <PhaseIndicator step={state.step} />
        )}
        <View style={s.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Bottom actions */}
        <View style={s.bottomActions}>
          <PrimaryBtn
            label={state.step === 11 ? 'Conferma →' : 'Avanti →'}
            onPress={nextStep}
            disabled={!valid}
          />
          {(state.step === 6 || state.step === 7 || state.step === 8 || state.step === 10) && (
            <GhostBtn label="Salta questo passo" onPress={nextStep} />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Transaction detail modal */}
      <Modal
        visible={selectedTxDetail !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTxDetail(null)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setSelectedTxDetail(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            {selectedTxDetail && (() => {
              const det = selectedTxDetail;
              const currentCatId = state.merchantOverrides[det.merchantKey] ?? det.category;
              const currentCat = CATEGORIES[currentCatId];
              return (
                <>
                  {/* Header */}
                  <View style={s.modalHeader}>
                    <View style={[s.modalCatIcon, { backgroundColor: currentCat?.bgColor ?? Colors.accent.glow }]}>
                      <Ionicons name={(currentCat?.icon ?? 'help') as any} size={22} color={currentCat?.color ?? Colors.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalCatLabel}>{currentCat?.label ?? currentCatId}</Text>
                      <Text style={s.modalDate}>{det.date}</Text>
                    </View>
                    <Text style={s.modalAmount}>€{det.amount.toFixed(2)}</Text>
                    <TouchableOpacity style={s.modalClose} onPress={() => setSelectedTxDetail(null)}>
                      <Ionicons name="close" size={20} color={Colors.text.secondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Description */}
                  <View style={s.modalBody}>
                    {det.displayName !== det.rawDescription && (
                      <Text style={s.modalMerchant}>{det.displayName}</Text>
                    )}
                    <Text style={s.modalRawDesc}>{det.rawDescription}</Text>
                  </View>

                  {/* Merchant rule scope note */}
                  <View style={s.modalRuleNote}>
                    <Ionicons name="link-outline" size={13} color={Colors.accent.primary} />
                    <Text style={s.modalRuleNoteText}>
                      Applica a tutte le transazioni di: <Text style={{ fontWeight: '700' }}>{det.merchantKey}</Text>
                    </Text>
                  </View>

                  {/* Reclassify */}
                  <Text style={s.modalSectionLabel}>CAMBIA CATEGORIA</Text>
                  <View style={s.catPickerGrid}>
                    {EXPENSE_CATEGORIES.map(cat => {
                      const isSelected = currentCatId === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[s.catPickerChip, isSelected && { borderColor: cat.color, backgroundColor: cat.bgColor }]}
                          onPress={() => {
                            set({ merchantOverrides: { ...state.merchantOverrides, [det.merchantKey]: cat.id } });
                            setSelectedTxDetail(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={cat.icon as any} size={13} color={isSelected ? cat.color : Colors.text.secondary} />
                          <Text style={[s.catPickerLabel, isSelected && { color: cat.color }]}>{cat.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Shared UI StyleSheet ──────────────────────────────────────────────────────

const ui = StyleSheet.create({
  textInput: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.text.primary,
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginBottom: 8,
    marginRight: 8,
  },
  chipActive: { backgroundColor: Colors.accent.primary + '20', borderColor: Colors.accent.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chipText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '500' },
  chipTextActive: { color: Colors.accent.primary, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
  ghostBtn: { paddingVertical: 12, alignItems: 'center' },
  ghostBtnText: { ...Typography.body, color: Colors.text.muted },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginVertical: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  stepperLabel: { ...Typography.bodyMedium, color: Colors.text.primary },
  stepperSublabel: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: { width: Touch.xs, height: Touch.xs, borderRadius: Touch.xs / 2, backgroundColor: Colors.bg.elevated, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border.default },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperValue: { ...Typography.h3, color: Colors.text.primary, minWidth: 28, textAlign: 'center' },
  // Phase indicator (replaces ProgressBar)
  phaseRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 0 },
  phaseConnector: { flex: 1, height: 1.5, backgroundColor: Colors.border.default, maxWidth: 18 },
  phaseConnectorDone: { backgroundColor: Colors.semantic.success },
  phaseDotDone: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.semantic.success, justifyContent: 'center', alignItems: 'center' },
  phaseDotFuture: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.bg.elevated, borderWidth: 1, borderColor: Colors.border.default, justifyContent: 'center', alignItems: 'center' },
  phaseDotNumText: { fontSize: 9, color: Colors.text.muted, fontWeight: '600' },
  phasePillActive: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.accent.primary + '22', borderWidth: 1, borderColor: Colors.accent.primary },
  phasePillActiveText: { fontSize: 11, color: Colors.accent.primary, fontWeight: '700', letterSpacing: 0.2 },
  pickerForm: { gap: Spacing.sm },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  bankBadge: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  bankBadgeText: { fontWeight: '700', fontSize: 14 },
  bankRowName: { ...Typography.body, color: Colors.text.primary },
  bankSelectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, padding: Spacing.sm },
  pickerActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  // AssetSearch
  directLookupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4 },
  directLookupText: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20, justifyContent: 'center' },
  loadingText: { ...Typography.body, color: Colors.text.muted },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  resultName: { ...Typography.bodyMedium, color: Colors.text.primary },
  resultMeta: { ...Typography.caption, color: Colors.text.muted },
  manualEntryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
  manualEntryText: { ...Typography.caption, color: Colors.text.muted },
  manualForm: { gap: Spacing.sm },
  qtyForm: { gap: Spacing.sm },
  qtyResult: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, padding: 12 },
  qtyName: { ...Typography.bodyMedium, color: Colors.text.primary },
  qtyMeta: { ...Typography.caption, color: Colors.text.muted },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  sectionLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600', marginBottom: 8 },
  // IncomeForm
  incomeForm: { gap: Spacing.sm },
  incomeRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  freqBtn: { backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border.default },
  freqBtnText: { ...Typography.body, color: Colors.accent.primary, fontWeight: '600' },
});

// ── Screen-specific styles ────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  // Welcome
  welcomeGradient: { flex: 1 },
  welcomeSafe: { flex: 1, justifyContent: 'space-between' },
  welcomeContent: { flex: 1, padding: 28, justifyContent: 'center', gap: 24 },
  welcomeIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.accent.primary + '20', justifyContent: 'center', alignItems: 'center' },
  welcomeTitle: { fontSize: 36, fontWeight: '900', color: Colors.text.primary, letterSpacing: -1 },
  welcomeSubtitle: { ...Typography.body, color: Colors.text.secondary },
  welcomeFeatures: { gap: 16 },
  welcomeFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  welcomeFeatureText: { ...Typography.body, color: Colors.text.secondary, flex: 1 },
  welcomeNote: { ...Typography.caption, color: Colors.text.muted, lineHeight: 20 },
  welcomeActions: { paddingHorizontal: 28, paddingBottom: 40 },

  // Layout
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  backBtn: { width: Touch.sm, height: Touch.sm, borderRadius: Touch.sm / 2, backgroundColor: Colors.bg.card, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  contentDone: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40, gap: 16 },
  bottomActions: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12, gap: 4, borderTopWidth: 1, borderTopColor: Colors.border.subtle, backgroundColor: Colors.bg.primary },

  // Step headers
  stepTitle: { fontSize: 26, fontWeight: '800', color: Colors.text.primary, letterSpacing: -0.5 },
  stepSubtitle: { ...Typography.body, color: Colors.text.secondary, lineHeight: 22 },
  fieldLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Stepper section
  stepperSection: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, paddingHorizontal: 16 },

  // Region picker
  regionPicker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regionDropdown: { backgroundColor: Colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.default, padding: 12, marginTop: 4 },
  regionOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  regionOptionText: { ...Typography.body, color: Colors.text.primary },

  // Housing
  housingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  housingCard: { width: '47%', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, padding: 14, gap: 4 },
  housingCardActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '10' },
  housingEmoji: { fontSize: 24 },
  housingLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  housingLabelActive: { color: Colors.accent.primary },
  housingDesc: { ...Typography.caption, color: Colors.text.muted },

  // Work
  workGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  workCard: { width: '30%', backgroundColor: Colors.bg.card, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border.default, padding: 12, alignItems: 'center', gap: 6 },
  workCardActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '10' },
  workEmoji: { fontSize: 22 },
  workLabel: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', fontWeight: '600' },
  workLabelActive: { color: Colors.accent.primary },
  sectorScroll: { marginVertical: 4 },
  stabilityCards: { gap: 10 },
  stabilityCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border.default, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  stabilityCardActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '10' },
  stabilityEmoji: { fontSize: 22 },
  stabilityLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  stabilityLabelActive: { color: Colors.accent.primary },
  stabilityDesc: { ...Typography.caption, color: Colors.text.muted, flex: 1 },

  // Income
  incomeList: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, overflow: 'hidden' },
  incomeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  incomeItemLabel: { ...Typography.bodyMedium, color: Colors.text.primary },
  incomeItemAmount: { ...Typography.caption, color: Colors.text.muted },
  incomeTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: Colors.bg.elevated },
  incomeTotalLabel: { ...Typography.bodyMedium, color: Colors.text.secondary },
  incomeTotalAmount: { ...Typography.h3, color: Colors.semantic.success },
  incomeBorder: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: 16, gap: 12 },

  // Add button
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  addBtnText: { ...Typography.bodyMedium, color: Colors.accent.primary },
  skipHint: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center', marginTop: 12 },

  // Accounts
  accountList: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, overflow: 'hidden', marginBottom: 4 },
  accountItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  accountDot: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent.primary + '30', justifyContent: 'center', alignItems: 'center' },
  accountDotText: { fontWeight: '700', color: Colors.accent.primary, fontSize: 14 },
  accountName: { ...Typography.bodyMedium, color: Colors.text.primary },
  accountLabel: { ...Typography.caption, color: Colors.text.muted },
  accountBalance: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '700' },

  // Assets
  assetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  assetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: Colors.bg.elevated },
  assetChipText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },

  // Yes/No cards
  yesNoCards: { flexDirection: 'row', gap: 14 },
  yesNoCard: { flex: 1, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.accent.primary, padding: 20, alignItems: 'center', gap: 10 },
  yesNoCardNo: { borderColor: Colors.border.default },
  yesNoEmoji: { fontSize: 32 },
  yesNoLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700', textAlign: 'center' },
  noInvestTip: { backgroundColor: Colors.accent.primary + '15', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent.primary + '40', padding: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noInvestText: { ...Typography.body, color: Colors.text.secondary, flex: 1, lineHeight: 22 },

  // Goals
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalCard: { width: '47%', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, padding: 14, gap: 4 },
  goalCardActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '10' },
  goalEmoji: { fontSize: 24 },
  goalLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  goalLabelActive: { color: Colors.accent.primary },
  goalDesc: { ...Typography.caption, color: Colors.text.muted },

  // Effort
  effortCards: { gap: 12 },
  effortCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, padding: 16, gap: 6 },
  effortCardActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '10' },
  effortHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  effortEmoji: { fontSize: 22 },
  effortLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700', flex: 1 },
  effortLabelActive: { color: Colors.accent.primary },
  effortSaving: { ...Typography.caption, fontWeight: '700' },
  effortDesc: { ...Typography.caption, color: Colors.text.muted },
  savingPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.semantic.success + '15', borderRadius: Radius.md, padding: 12 },
  savingPreviewText: { ...Typography.body, color: Colors.text.secondary, flex: 1 },

  // Emergency fund
  emergencyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FFB347' + '40',
    padding: 16,
    gap: 14,
  },
  emergencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emergencyEmoji: { fontSize: 28 },
  emergencyTitle: { ...Typography.h3, color: Colors.text.primary },
  emergencySub: { ...Typography.caption, color: Colors.text.secondary },
  emergencyToggle: { flexDirection: 'row', gap: 10 },
  emergencyPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
  },
  emergencyPillActive: {
    backgroundColor: '#FFB347' + '25',
    borderColor: '#FFB347',
  },
  emergencyPillText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  emergencyPillTextActive: { color: '#FFB347' },
  emergencyTarget: { alignItems: 'center', gap: 4 },
  emergencyTargetLabel: { ...Typography.caption, color: Colors.text.secondary },
  emergencyTargetAmount: { fontSize: 28, fontWeight: '800', color: '#FFB347', letterSpacing: -1 },
  emergencyTargetSub: { ...Typography.micro, color: Colors.text.muted, textAlign: 'center' },

  // Import
  importButtons: { flexDirection: 'row', gap: 14 },
  importBtn: { flex: 1, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: 20, alignItems: 'center', gap: 8 },
  importBtnLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  importBtnDesc: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center' },
  importingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, justifyContent: 'center' },
  loadingText: { ...Typography.body, color: Colors.text.muted },
  importedCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: 14, gap: 10 },
  importedCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  importedTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  importedSub: { ...Typography.caption, color: Colors.text.secondary },
  accountChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  accountChipLabel: { ...Typography.caption, color: Colors.text.muted },
  accountChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.default, backgroundColor: Colors.bg.elevated },
  accountChipActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.primary + '20' },
  accountChipText: { ...Typography.caption, color: Colors.text.secondary, maxWidth: 100 },
  accountChipTextActive: { color: Colors.accent.primary, fontWeight: '600' },
  dedupNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent.primary + '12', borderRadius: Radius.md, padding: 10 },
  dedupNoteText: { ...Typography.caption, color: Colors.accent.primary, flex: 1 },
  addFileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent.primary + '50', borderStyle: 'dashed' },
  addFileBtnText: { ...Typography.bodyMedium, color: Colors.accent.primary },
  importNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 8 },
  importNoteText: { ...Typography.caption, color: Colors.text.muted },

  // Score
  scoreSection: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: Colors.bg.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border.default, padding: 20 },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  scoreValue: { fontSize: 28, fontWeight: '900' },
  scoreMax: { ...Typography.caption, color: Colors.text.secondary },
  scoreLabel: { fontSize: 20, fontWeight: '800' },
  scoreDesc: { ...Typography.caption, color: Colors.text.secondary, marginTop: 4 },

  // Insights
  insightsSection: { gap: 4 },
  sectionHeader: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700', marginBottom: 10 },
  insightRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle, gap: 8 },
  insightHeader: { flexDirection: 'row', alignItems: 'center' },
  insightLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  insightIconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  insightName: { ...Typography.bodyMedium, color: Colors.text.primary },
  insightMeta: { ...Typography.caption, color: Colors.text.secondary },
  insightRight: { alignItems: 'flex-end' },
  insightAmount: { ...Typography.bodyMedium, fontWeight: '700' },
  insightBudget: { ...Typography.caption, color: Colors.text.secondary },
  // Detail breakdown for over/warning
  insightDetail: {
    marginLeft: 44, borderLeftWidth: 2, paddingLeft: 10, gap: 4,
  },
  insightDetailHeader: { ...Typography.caption, color: Colors.text.muted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  insightDetailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightDetailName: { ...Typography.caption, color: Colors.text.secondary, flex: 1, paddingRight: 8 },
  insightDetailVal: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  insightTxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderRadius: Radius.sm },
  insightTxRowActive: { backgroundColor: Colors.accent.primary + '12' },
  insightTxInfo: { flex: 1 },
  insightTxDate: { ...Typography.caption, color: Colors.text.muted },
  txCatChip: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  insightShowMore: { ...Typography.caption, color: Colors.accent.primary, marginTop: 4 },
  catPickerWrap: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border.subtle },
  catPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  catPickerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border.subtle, backgroundColor: Colors.bg.card },
  catPickerLabel: { ...Typography.caption, color: Colors.text.secondary },

  // Tips
  tipsSection: { gap: 4 },
  tipRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8 },
  tipBullet: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent.primary, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  tipBulletText: { ...Typography.caption, color: '#fff', fontWeight: '700' },
  tipText: { ...Typography.body, color: Colors.text.secondary, flex: 1, lineHeight: 22 },

  // Budgets
  budgetSection: { gap: 4 },
  budgetNote: { ...Typography.caption, color: Colors.text.secondary, marginBottom: 10 },
  residuoBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.bg.card, borderRadius: Radius.md, padding: 12, marginBottom: 4 },
  residuoLabel: { ...Typography.caption, color: Colors.text.secondary },
  residuoValue: { ...Typography.caption, fontWeight: '700' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  budgetIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  budgetName: { ...Typography.body, color: Colors.text.primary, flex: 1 },
  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 6 },
  budgetEur: { ...Typography.caption, color: Colors.text.secondary, marginRight: 2 },
  budgetInput: { ...Typography.bodyMedium, color: Colors.text.primary, minWidth: 52, textAlign: 'right' },
  budgetPer: { ...Typography.caption, color: Colors.text.secondary, marginLeft: 2 },

  // Transaction detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.bg.elevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 36, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalCatIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalCatLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  modalDate: { ...Typography.caption, color: Colors.text.secondary },
  modalAmount: { fontSize: 20, fontWeight: '800', color: Colors.text.primary, marginRight: 4 },
  modalClose: { padding: 6 },
  modalBody: { backgroundColor: Colors.bg.card, borderRadius: Radius.md, padding: 12, gap: 4 },
  modalMerchant: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  modalRawDesc: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },
  modalRuleNote: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accent.primary + '12', borderRadius: Radius.sm, padding: 8 },
  modalRuleNoteText: { ...Typography.caption, color: Colors.accent.primary, flex: 1 },
  modalSectionLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '700', letterSpacing: 0.5 },

  // Done
  doneContent: { alignItems: 'center', gap: 20 },
  doneIcon: { marginTop: 20 },
  doneTitle: { fontSize: 28, fontWeight: '900', color: Colors.text.primary, textAlign: 'center' },
  doneSubtitle: { ...Typography.body, color: Colors.text.secondary, textAlign: 'center' },
  summaryCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  summaryCard: { alignItems: 'center', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: 16, minWidth: 100, gap: 4 },
  summaryCardValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  summaryCardLabel: { ...Typography.caption, color: Colors.text.muted },

  // Resume dialog
  resumeDialog: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 16,
  },
  resumeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  resumeTitle: {
    ...Typography.h2,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  resumeMessage: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  resumeSummary: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 8,
  },
  resumeLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resumeValue: {
    ...Typography.h3,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  resumeProgressBar: {
    height: 6,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  resumeProgressFill: {
    height: 6,
    backgroundColor: Colors.accent.primary,
    borderRadius: 3,
  },
  resumeActions: {
    gap: 10,
    marginTop: 8,
  },
  resumeBtnSecondary: {
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
  },
  resumeBtnSecondaryText: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  resumeBtnPrimary: {
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
  },
  resumeBtnPrimaryText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
});
