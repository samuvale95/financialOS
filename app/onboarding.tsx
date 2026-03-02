import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Typography, Radius, Spacing, Gradients } from '../constants/theme';
import { ITALIAN_BANKS } from '../constants/italianBanks';
import type { ItalianBank } from '../constants/italianBanks';
import { CATEGORIES } from '../constants/categories';
import { useData } from '../contexts/DataContext';
import { saveOnboardingData } from '../utils/storage';
import { calculateBudgets, getSavingsPotential } from '../utils/budgetCalculator';
import {
  searchCoinGecko, fetchCoinGeckoAsset,
  searchTiingo, lookupTickerDirect, nextAssetColor,
} from '../utils/financialApi';
import type { SearchResult } from '../utils/financialApi';
import { searchLocalAssets, looksLikeTicker } from '../constants/popularAssets';
import type { LocalAsset } from '../constants/popularAssets';
import { parseCSV } from '../utils/parsers';
import { parseExcel } from '../utils/excelParser';
import type { BankAccount, OnboardingGoalId, EffortLevel, IncomeSource, IncomeType, StoredBudget, Asset } from '../types';
import type { Transaction } from '../types';

// ── Local types ───────────────────────────────────────────────────────────────

interface PendingAccount {
  bankId: string; bankName: string; accountLabel: string; balance: number;
}

interface PendingAsset extends Omit<Asset, 'id'> {}

interface ImportResult {
  transactions: Omit<Transaction, 'id'>[];
  bankName: string;
}

interface WizardState {
  step: number;
  // Step 1 – Conti
  accounts: PendingAccount[];
  // Step 2 – Investimenti
  assets: PendingAsset[];
  // Step 3 – Entrate
  incomeSources: IncomeSource[];
  // Step 4 – Obiettivi & Impegno
  mainGoal: OnboardingGoalId | null;
  effortLevel: EffortLevel | null;
  // Step 5 – Import
  imported: ImportResult | null;
  // Step 6 – Budget edits (keyed by category)
  budgetEdits: Record<string, string>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

const GOAL_OPTIONS: { id: OnboardingGoalId; label: string; icon: string; desc: string }[] = [
  { id: 'risparmio',  label: 'Risparmio',  icon: 'trending-up',      desc: 'Costruire una riserva solida' },
  { id: 'casa',       label: 'Casa',        icon: 'home',             desc: 'Acquistare o ristrutturare' },
  { id: 'pensione',   label: 'Pensione',    icon: 'time',             desc: 'Pianificare il futuro' },
  { id: 'emergenza',  label: 'Emergenza',   icon: 'shield-checkmark', desc: 'Cuscinetto di sicurezza' },
  { id: 'viaggio',    label: 'Viaggio',     icon: 'airplane',         desc: 'Esperienze e avventure' },
  { id: 'istruzione', label: 'Istruzione',  icon: 'school',           desc: 'Investire nella formazione' },
];

const EFFORT_OPTIONS: { id: EffortLevel; emoji: string; label: string; desc: string; savingHint: string }[] = [
  { id: 'leggero',  emoji: '🌱', label: 'Leggero',  desc: 'Piccoli aggiustamenti',          savingHint: '~3–5% di risparmio' },
  { id: 'moderato', emoji: '⚖️', label: 'Moderato', desc: 'Equilibrio vita e risparmio',    savingHint: '~15–20% di risparmio' },
  { id: 'intenso',  emoji: '🚀', label: 'Intenso',  desc: 'Massima priorità al risparmio',  savingHint: '~30%+ di risparmio' },
];

const INCOME_TYPES: { id: IncomeType; label: string; icon: string }[] = [
  { id: 'salary',    label: 'Stipendio',             icon: 'briefcase' },
  { id: 'freelance', label: 'Freelance / Consulenze', icon: 'laptop' },
  { id: 'rent',      label: 'Affitti',               icon: 'home' },
  { id: 'dividends', label: 'Dividendi / Rendite',   icon: 'trending-up' },
  { id: 'pension',   label: 'Pensione',              icon: 'time' },
  { id: 'other',     label: 'Altro reddito',         icon: 'cash' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthlyAmount(src: IncomeSource): number {
  return src.frequency === 'annual' ? src.amount / 12 : src.amount;
}

function totalMonthlyIncome(sources: IncomeSource[]): number {
  return sources.reduce((s, src) => s + monthlyAmount(src), 0);
}

function totalNetWorth(accounts: PendingAccount[], assets: PendingAsset[]): number {
  const accs = accounts.reduce((s, a) => s + a.balance, 0);
  const port = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
  return accs + port;
}

function computeScore(
  income: number,
  netWorth: number,
  assets: PendingAsset[],
  incomeSources: IncomeSource[],
  goal: OnboardingGoalId | null,
  effort: EffortLevel | null,
  txCount: number
): number {
  let score = 0;

  // Patrimonio – mesi di reddito coperti (0–30 pt)
  if (income > 0) {
    const months = netWorth / income;
    if (months >= 12) score += 30;
    else if (months >= 6) score += 22;
    else if (months >= 3) score += 15;
    else if (months >= 1) score += 8;
    else if (months > 0) score += 3;
  }

  // Investimenti (0–20 pt)
  if (assets.length >= 3) score += 20;
  else if (assets.length >= 1) score += 12;

  // Diversificazione entrate (0–20 pt)
  if (incomeSources.length >= 3) score += 20;
  else if (incomeSources.length === 2) score += 12;
  else if (incomeSources.length === 1) score += 5;

  // Pianificazione – obiettivo + impegno (0–20 pt)
  if (goal) score += 8;
  if (effort === 'intenso') score += 12;
  else if (effort === 'moderato') score += 8;
  else if (effort === 'leggero') score += 4;

  // Dati estratto conto (0–10 pt)
  if (txCount > 50) score += 10;
  else if (txCount > 10) score += 6;
  else if (txCount > 0) score += 3;

  return Math.min(100, Math.round(score));
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Ottimo',           color: '#00D68F' };
  if (score >= 60) return { label: 'Solido',           color: '#00D68F' };
  if (score >= 40) return { label: 'In crescita',      color: '#FFB347' };
  if (score >= 20) return { label: 'Da rafforzare',    color: '#FF9500' };
  return                  { label: 'Punto di partenza', color: '#FF6B6B' };
}

function generateTips(
  income: number,
  netWorth: number,
  assets: PendingAsset[],
  incomeSources: IncomeSource[],
  goal: OnboardingGoalId | null,
  effort: EffortLevel | null,
  score: number
): string[] {
  const tips: string[] = [];
  const months = income > 0 ? netWorth / income : 0;

  if (months < 3) {
    tips.push('Priorità #1: costruisci un fondo di emergenza pari a 3–6 mesi di spese, tenendolo in un conto separato.');
  }
  if (assets.length === 0) {
    tips.push('Inizia a investire anche piccole somme: un ETF globale come VWCE offre diversificazione immediata a costi bassi.');
  }
  if (incomeSources.length < 2) {
    tips.push('Una seconda fonte di reddito — anche piccola — riduce il rischio finanziario e accelera i tuoi obiettivi.');
  }
  if (goal === 'risparmio' && effort === 'leggero') {
    tips.push('Per raggiungere il tuo obiettivo di risparmio più velocemente, considera di passare all\'impegno "Moderato".');
  }
  if (effort === 'intenso') {
    tips.push('Ottima ambizione! Automizza i risparmi subito dopo lo stipendio: trasferimento automatico su conto dedicato.');
  }
  if (months >= 6 && assets.length > 0) {
    tips.push('Hai una base solida. Considera di aumentare progressivamente la quota investita ogni mese (es. +€50/mese).');
  }
  if (score >= 60 && assets.length > 0) {
    tips.push('Stai andando bene. Rivedi il portafoglio ogni 6 mesi per ribilanciare e mantenere la tua asset allocation target.');
  }

  return tips.slice(0, 3);
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.progressRow}>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${(current / total) * 100}%` }]} />
      </View>
      <Text style={s.progressLabel}>{current}/{total}</Text>
    </View>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.stepTitle}>{title}</Text>
      {subtitle ? <Text style={s.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function PrimaryBtn({ label, onPress, disabled, fullWidth }: { label: string; onPress: () => void; disabled?: boolean; fullWidth?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.primaryBtn, fullWidth && s.fullWidth, disabled && s.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <Text style={s.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function GhostBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.ghostBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.ghostBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── BankPickerForm ────────────────────────────────────────────────────────────

function BankPickerForm({ onConfirm, onCancel }: {
  onConfirm: (acc: PendingAccount) => void;
  onCancel: () => void;
}) {
  const [bankQuery, setBankQuery] = useState('');
  const [bank, setBank] = useState<ItalianBank | null>(null);
  const [label, setLabel] = useState('Conto corrente');
  const [balStr, setBalStr] = useState('');

  const filtered = useMemo(() => {
    const q = bankQuery.toLowerCase();
    return ITALIAN_BANKS.filter(b =>
      !q || b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [bankQuery]);

  const canConfirm = bank !== null && label.trim().length > 0 && balStr.length > 0;

  return (
    <View style={s.inlineForm}>
      {!bank ? (
        <>
          <TextInput
            style={s.textInput}
            placeholder="Cerca la tua banca…"
            placeholderTextColor={Colors.text.muted}
            value={bankQuery}
            onChangeText={setBankQuery}
            autoFocus
          />
          <ScrollView style={{ maxHeight: 210 }} nestedScrollEnabled>
            {filtered.map(b => (
              <TouchableOpacity key={b.id} style={s.listRow} onPress={() => setBank(b)} activeOpacity={0.7}>
                <View style={[s.colorBadge, { backgroundColor: b.color + '33' }]}>
                  <Text style={[s.colorBadgeText, { color: b.color }]}>{b.shortName[0]}</Text>
                </View>
                <Text style={s.listRowName}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={s.selectedRow}>
            <View style={[s.colorBadge, { backgroundColor: bank.color + '33' }]}>
              <Text style={[s.colorBadgeText, { color: bank.color }]}>{bank.shortName[0]}</Text>
            </View>
            <Text style={[s.listRowName, { flex: 1 }]}>{bank.name}</Text>
            <TouchableOpacity onPress={() => setBank(null)}>
              <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.textInput}
            placeholder="Label (es. Conto corrente, Conto stipendio…)"
            placeholderTextColor={Colors.text.muted}
            value={label}
            onChangeText={setLabel}
          />
          <TextInput
            style={s.textInput}
            placeholder="Saldo attuale (€)"
            placeholderTextColor={Colors.text.muted}
            value={balStr}
            onChangeText={setBalStr}
            keyboardType="decimal-pad"
          />
        </>
      )}
      <View style={s.rowActions}>
        <GhostBtn label="Annulla" onPress={onCancel} />
        {bank && (
          <PrimaryBtn
            label="Conferma"
            onPress={() => onConfirm({
              bankId: bank.id, bankName: bank.name, accountLabel: label.trim(),
              balance: parseFloat(balStr.replace(',', '.')) || 0,
            })}
            disabled={!canConfirm}
          />
        )}
      </View>
    </View>
  );
}

// ── AssetSearch ───────────────────────────────────────────────────────────────
// Strategy:
//   1. Local popular-assets DB → instant results, no API (covers 90% of cases)
//   2. Direct ticker lookup → type "SWDA.MI" → "Carica SWDA.MI" button (bypasses broken search API)
//   3. CoinGecko search → crypto only, reliable API
//   4. Yahoo Finance search → stocks/ETF, best-effort (may fail due to crumb)
//   5. Manual entry → always available as final fallback

type AssetSearchState =
  | { mode: 'search' }
  | { mode: 'qty'; result: LocalAsset | SearchResult }
  | { mode: 'manual' }
  | { mode: 'directLoading'; ticker: string };

function AssetSearch({ assetType, onAdd }: {
  assetType: 'crypto' | 'investment';
  onAdd: (a: PendingAsset) => void;
}) {
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<LocalAsset[]>(
    assetType === 'investment' ? searchLocalAssets('') : []
  );
  const [yahooResults, setYahooResults] = useState<SearchResult[]>([]);
  const [yahooSearching, setYahooSearching] = useState(false);
  const [cryptoResults, setCryptoResults] = useState<SearchResult[]>([]);
  const [cryptoSearching, setCryptoSearching] = useState(false);
  const [uiState, setUiState] = useState<AssetSearchState>({ mode: 'search' });
  const [qty, setQty] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTicker, setManualTicker] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debRef.current) clearTimeout(debRef.current);

    if (assetType === 'investment') {
      // Local search is instant
      setLocalResults(searchLocalAssets(text));
      // Yahoo search is deferred + best-effort
      if (text.trim().length > 1) {
        debRef.current = setTimeout(async () => {
          setYahooSearching(true);
          const res = await searchTiingo(text);
          // Only show Yahoo results not already in local list
          const localTickers = new Set(searchLocalAssets(text).map(a => a.ticker));
          setYahooResults(res.filter(r => !localTickers.has(r.ticker)));
          setYahooSearching(false);
        }, 600);
      } else {
        setYahooResults([]);
      }
    } else {
      // Crypto: use CoinGecko search
      if (text.trim().length > 1) {
        debRef.current = setTimeout(async () => {
          setCryptoSearching(true);
          const res = await searchCoinGecko(text);
          setCryptoResults(res);
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
      setUiState({ mode: 'qty', result: {
        id: fetched.ticker, name: fetched.name, ticker: fetched.ticker,
        type: fetched.type === 'etf' ? 'etf' : fetched.type === 'bond' ? 'bond' : 'stock',
        source: 'tiingo',
      }});
    } else {
      Alert.alert(
        'Ticker non trovato',
        `Non riesco a trovare "${ticker}". Controlla che il ticker sia corretto (es. SWDA.MI include il suffisso .MI per Borsa Italiana).`,
        [
          { text: 'Inserisci manualmente', onPress: () => {
            setManualTicker(ticker.trim().toUpperCase());
            setUiState({ mode: 'manual' });
          }},
          { text: 'Riprova', style: 'cancel', onPress: () => setUiState({ mode: 'search' }) },
        ]
      );
    }
  };

  const handleAddFromResult = async (result: LocalAsset | SearchResult, quantity: string) => {
    const qtyNum = parseFloat(quantity.replace(',', '.')) || 0;
    if (qtyNum <= 0) return;

    // For local assets, still try to fetch live price via Yahoo
    // For crypto, use CoinGecko
    if (assetType === 'crypto') {
      try {
        const fetched = await fetchCoinGeckoAsset(result.id);
        onAdd({ name: fetched.name, ticker: fetched.ticker, type: 'crypto', quantity: qtyNum, currentPrice: fetched.currentPrice, purchasePrice: fetched.currentPrice, color: nextAssetColor(), sparkline: fetched.sparkline });
      } catch {
        // fallback: use name/ticker from result, price 0
        onAdd({ name: result.name, ticker: result.ticker, type: 'crypto', quantity: qtyNum, currentPrice: 0, purchasePrice: 0, color: nextAssetColor(), sparkline: [] });
      }
    } else {
      const fetched = await lookupTickerDirect(result.ticker);
      if (fetched) {
        onAdd({ name: fetched.name, ticker: fetched.ticker, type: fetched.type, quantity: qtyNum, currentPrice: fetched.currentPrice, purchasePrice: fetched.currentPrice, color: nextAssetColor(), sparkline: fetched.sparkline });
      } else {
        // fallback: use local data, price 0 (user can edit later)
        const localType: Asset['type'] = result.type === 'etf' ? 'etf' : result.type === 'bond' ? 'bond' : 'stock';
        onAdd({ name: result.name, ticker: result.ticker, type: localType, quantity: qtyNum, currentPrice: 0, purchasePrice: 0, color: nextAssetColor(), sparkline: [] });
        Alert.alert('Prezzo non disponibile', 'L\'asset è stato aggiunto con prezzo 0. Puoi aggiornarlo in seguito dal Portfolio.');
      }
    }
    setUiState({ mode: 'search' });
    setQty('');
    setQuery('');
    setLocalResults(assetType === 'investment' ? searchLocalAssets('') : []);
    setYahooResults([]);
    setCryptoResults([]);
  };

  const handleAddManual = () => {
    const price = parseFloat(manualPrice.replace(',', '.')) || 0;
    const quantity = parseFloat(qty.replace(',', '.')) || 0;
    if (!manualName.trim() || !manualTicker.trim() || quantity <= 0) return;
    onAdd({
      name: manualName.trim(), ticker: manualTicker.trim().toUpperCase(),
      type: assetType === 'crypto' ? 'crypto' : 'stock',
      quantity, currentPrice: price, purchasePrice: price,
      color: nextAssetColor(), sparkline: [],
    });
    setManualName(''); setManualTicker(''); setManualPrice(''); setQty('');
    setUiState({ mode: 'search' });
  };

  // ── Manual mode ─────────────────────────────────────────────────────────────
  if (uiState.mode === 'manual') {
    return (
      <View style={s.inlineForm}>
        <Text style={s.formSectionLabel}>Inserimento manuale</Text>
        <TextInput style={s.textInput} placeholder="Nome (es. iShares MSCI World)" placeholderTextColor={Colors.text.muted} value={manualName} onChangeText={setManualName} />
        <TextInput style={s.textInput} placeholder="Ticker (es. SWDA.MI)" placeholderTextColor={Colors.text.muted} value={manualTicker} onChangeText={setManualTicker} autoCapitalize="characters" />
        <TextInput style={s.textInput} placeholder="Prezzo attuale (€) — opzionale" placeholderTextColor={Colors.text.muted} value={manualPrice} onChangeText={setManualPrice} keyboardType="decimal-pad" />
        <TextInput style={s.textInput} placeholder={assetType === 'crypto' ? 'Quantità (es. 0.5)' : 'Numero quote (es. 10)'} placeholderTextColor={Colors.text.muted} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
        <View style={s.rowActions}>
          <GhostBtn label="Annulla" onPress={() => setUiState({ mode: 'search' })} />
          <PrimaryBtn label="Aggiungi" onPress={handleAddManual} disabled={!manualName.trim() || !manualTicker.trim() || !qty} />
        </View>
      </View>
    );
  }

  // ── Direct loading ──────────────────────────────────────────────────────────
  if (uiState.mode === 'directLoading') {
    return (
      <View style={[s.inlineForm, { alignItems: 'center', gap: 12 }]}>
        <ActivityIndicator color={Colors.accent.primary} />
        <Text style={s.metaText}>Carico dati per {uiState.ticker}…</Text>
      </View>
    );
  }

  // ── Qty input (after selecting a result) ────────────────────────────────────
  if (uiState.mode === 'qty') {
    const r = uiState.result;
    return (
      <View style={s.inlineForm}>
        <View style={s.selectedRow}>
          <View style={s.tickerBadge}><Text style={s.tickerBadgeText}>{r.ticker.slice(0, 4)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.listRowName} numberOfLines={1}>{r.name}</Text>
            <Text style={s.metaText}>{r.type.toUpperCase()}{('exchange' in r && r.exchange) ? ` · ${r.exchange}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => setUiState({ mode: 'search' })}>
            <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
          </TouchableOpacity>
        </View>
        <TextInput
          style={s.textInput}
          placeholder={assetType === 'crypto' ? 'Quantità posseduta (es. 0.5)' : 'Numero di quote (es. 10)'}
          placeholderTextColor={Colors.text.muted}
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          autoFocus
        />
        <View style={s.rowActions}>
          <GhostBtn label="Indietro" onPress={() => setUiState({ mode: 'search' })} />
          <PrimaryBtn label="Aggiungi" onPress={() => handleAddFromResult(r, qty)} disabled={!qty || parseFloat(qty) <= 0} />
        </View>
      </View>
    );
  }

  // ── Search mode ─────────────────────────────────────────────────────────────
  const isSearching = assetType === 'crypto' ? cryptoSearching : yahooSearching;
  const results: (LocalAsset | SearchResult)[] = assetType === 'crypto'
    ? cryptoResults
    : [...localResults, ...yahooResults];
  const showDirectBtn = assetType === 'investment' && query.length > 1 && looksLikeTicker(query);

  return (
    <View style={s.inlineForm}>
      <TextInput
        style={s.textInput}
        placeholder={assetType === 'crypto' ? 'Cerca: bitcoin, ethereum, solana…' : 'Cerca: SWDA, VWCE, Apple, ETF…'}
        placeholderTextColor={Colors.text.muted}
        value={query}
        onChangeText={handleQueryChange}
      />

      {/* Direct ticker lookup button */}
      {showDirectBtn && (
        <TouchableOpacity
          style={s.directBtn}
          onPress={() => handleDirectLookup(query)}
          activeOpacity={0.8}
        >
          <Ionicons name="flash" size={14} color={Colors.accent.primary} />
          <Text style={s.directBtnText}>Carica "{query.toUpperCase()}" direttamente</Text>
        </TouchableOpacity>
      )}

      {isSearching && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color={Colors.accent.primary} />
          <Text style={s.metaText}>Ricerca online…</Text>
        </View>
      )}

      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
        {results.map((r, i) => (
          <TouchableOpacity
            key={r.id + i}
            style={s.listRow}
            onPress={() => setUiState({ mode: 'qty', result: r })}
            activeOpacity={0.7}
          >
            <View style={s.tickerBadge}><Text style={s.tickerBadgeText}>{r.ticker.slice(0, 4)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.listRowName} numberOfLines={1}>{r.name}</Text>
              <Text style={s.metaText}>
                {r.type.toUpperCase()}
                {'exchange' in r && r.exchange ? ` · ${r.exchange}` : ''}
                {'source' in r && r.source === 'tiingo' ? ' · Tiingo' : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {results.length === 0 && query.length > 2 && !isSearching && (
        <Text style={s.emptyHint}>
          {assetType === 'investment'
            ? 'Non trovato. Prova il ticker esatto (es. SWDA.MI) o usa il pulsante sopra per caricarlo direttamente.'
            : 'Nessun risultato. Prova il nome completo (es. "bitcoin", "ethereum").'}
        </Text>
      )}

      <TouchableOpacity onPress={() => setUiState({ mode: 'manual' })} style={s.manualLink}>
        <Ionicons name="create-outline" size={14} color={Colors.text.muted} />
        <Text style={s.manualLinkText}>Inserisci manualmente (ticker + prezzo)</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── IncomeForm ────────────────────────────────────────────────────────────────

function IncomeForm({ onAdd, onCancel }: {
  onAdd: (src: IncomeSource) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<IncomeType>('salary');
  const [amtStr, setAmtStr] = useState('');
  const [freq, setFreq] = useState<'monthly' | 'annual'>('monthly');

  const selectedType = INCOME_TYPES.find(t => t.id === type)!;
  const canAdd = parseFloat(amtStr.replace(',', '.')) > 0;

  return (
    <View style={s.inlineForm}>
      <Text style={s.formSectionLabel}>Tipo di entrata</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
        {INCOME_TYPES.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.typeChip, type === t.id && s.typeChipSelected]}
            onPress={() => setType(t.id)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon as any} size={14} color={type === t.id ? Colors.accent.primary : Colors.text.muted} />
            <Text style={[s.typeChipText, type === t.id && s.typeChipTextSelected]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.amtRow}>
        <Text style={s.currencyLabel}>€</Text>
        <TextInput
          style={s.amtInput}
          placeholder="0"
          placeholderTextColor={Colors.text.muted}
          value={amtStr}
          onChangeText={setAmtStr}
          keyboardType="decimal-pad"
          autoFocus
        />
      </View>
      <View style={s.freqRow}>
        {(['monthly', 'annual'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.freqBtn, freq === f && s.freqBtnSelected]}
            onPress={() => setFreq(f)}
            activeOpacity={0.7}
          >
            <Text style={[s.freqBtnText, freq === f && s.freqBtnTextSelected]}>
              {f === 'monthly' ? 'Al mese' : "All'anno"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.rowActions}>
        <GhostBtn label="Annulla" onPress={onCancel} />
        <PrimaryBtn label="Aggiungi" onPress={() => {
          const amt = parseFloat(amtStr.replace(',', '.')) || 0;
          onAdd({
            id: `inc_${Date.now()}`,
            type,
            label: selectedType.label,
            amount: amt,
            frequency: freq,
          });
          setAmtStr('');
        }} disabled={!canAdd} />
      </View>
    </View>
  );
}

// ── ImportPanel ───────────────────────────────────────────────────────────────

function ImportPanel({ onImported }: { onImported: (result: ImportResult) => void }) {
  const [phase, setPhase] = useState<'idle' | 'picking' | 'parsing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  const pick = async (fileType: 'csv' | 'excel') => {
    setPhase('picking');
    try {
      const mimes = fileType === 'csv'
        ? ['text/csv', 'text/plain', 'text/comma-separated-values']
        : ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
      const picked = await DocumentPicker.getDocumentAsync({ type: mimes, copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) { setPhase('idle'); return; }
      setPhase('parsing');
      let parseResult;
      if (fileType === 'csv') {
        const content = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
        parseResult = parseCSV(content);
      } else {
        parseResult = await parseExcel(picked.assets[0].uri);
      }
      if (parseResult.transactions.length === 0) {
        setErrMsg('Nessuna transazione trovata nel file.'); setPhase('error'); return;
      }
      const r: ImportResult = { transactions: parseResult.transactions as Omit<Transaction, 'id'>[], bankName: parseResult.bankName };
      setResult(r);
      setPhase('done');
      onImported(r);
    } catch {
      setErrMsg('Errore durante la lettura del file.'); setPhase('error');
    }
  };

  if (phase === 'picking' || phase === 'parsing') {
    return (
      <View style={[s.importCard, { alignItems: 'center', gap: 12 }]}>
        <ActivityIndicator color={Colors.accent.primary} />
        <Text style={s.stepSubtitle}>{phase === 'picking' ? 'Selezione file…' : 'Analisi in corso…'}</Text>
      </View>
    );
  }

  if (phase === 'done' && result) {
    return (
      <View style={s.importCard}>
        <View style={s.importSuccessRow}>
          <View style={s.importCheckIcon}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.importSuccessTitle}>
              {result.transactions.length} transazioni importate
            </Text>
            <Text style={s.metaText}>Banca: {result.bankName}</Text>
          </View>
          <TouchableOpacity onPress={() => { setPhase('idle'); setResult(null); }}>
            <Ionicons name="refresh" size={18} color={Colors.text.muted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={s.importCard}>
        <Text style={[s.metaText, { color: Colors.semantic.danger }]}>{errMsg}</Text>
        <GhostBtn label="Riprova" onPress={() => setPhase('idle')} />
      </View>
    );
  }

  return (
    <View style={s.importCard}>
      <Text style={s.importCardTitle}>Scegli il formato del tuo estratto conto</Text>
      <View style={s.importBtnsRow}>
        <TouchableOpacity style={s.importFormatBtn} onPress={() => pick('csv')} activeOpacity={0.75}>
          <Ionicons name="list" size={22} color={Colors.accent.primary} />
          <Text style={s.importFormatLabel}>CSV</Text>
          <Text style={s.importFormatDesc}>Intesa, UniCredit, N26…</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.importFormatBtn} onPress={() => pick('excel')} activeOpacity={0.75}>
          <Ionicons name="grid" size={22} color={Colors.accent.primary} />
          <Text style={s.importFormatLabel}>Excel</Text>
          <Text style={s.importFormatDesc}>File .xlsx</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { addAccount, addAsset, addTransactions, setBudgetLimit } = useData();

  const [state, setState] = useState<WizardState>({
    step: 0,
    accounts: [],
    assets: [],
    incomeSources: [],
    mainGoal: null,
    effortLevel: null,
    imported: null,
    budgetEdits: {},
  });

  // Step 1 – bank picker toggle
  const [showBankPicker, setShowBankPicker] = useState(false);
  // Step 2 – asset tab
  const [assetTab, setAssetTab] = useState<'crypto' | 'investment'>('investment');
  // Step 3 – income form toggle
  const [showIncomeForm, setShowIncomeForm] = useState(false);

  // ── Computed values ─────────────────────────────────────────────────────────

  const income = useMemo(() => totalMonthlyIncome(state.incomeSources), [state.incomeSources]);
  const netWorth = useMemo(() => totalNetWorth(state.accounts, state.assets), [state.accounts, state.assets]);

  const budgets = useMemo<StoredBudget[]>(() => {
    if (income <= 0) return [];
    return calculateBudgets(income, state.mainGoal ? [state.mainGoal] : [], state.effortLevel ?? 'moderato');
  }, [income, state.mainGoal, state.effortLevel]);

  const budgetTotal = useMemo(() => {
    return Object.entries(state.budgetEdits).reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
  }, [state.budgetEdits]);

  const residuo = income - budgetTotal;

  const score = useMemo(() => computeScore(
    income, netWorth, state.assets, state.incomeSources,
    state.mainGoal, state.effortLevel,
    state.imported?.transactions.length ?? 0
  ), [income, netWorth, state.assets, state.incomeSources, state.mainGoal, state.effortLevel, state.imported]);

  const tips = useMemo(() => generateTips(
    income, netWorth, state.assets, state.incomeSources,
    state.mainGoal, state.effortLevel, score
  ), [income, netWorth, state.assets, state.incomeSources, state.mainGoal, state.effortLevel, score]);

  const { label: sLabel, color: sColor } = scoreLabel(score);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const goTo = (step: number) => setState(s => ({ ...s, step }));

  const initBudgetEdits = useCallback((bds: StoredBudget[]) => {
    const edits: Record<string, string> = {};
    bds.forEach(b => { edits[b.category] = String(b.limit); });
    setState(s => ({ ...s, budgetEdits: edits }));
  }, []);

  const handleComplete = async () => {
    for (const acc of state.accounts) {
      addAccount({ ...acc, lastUpdated: new Date().toISOString() });
    }
    for (const a of state.assets) {
      addAsset(a);
    }
    if (state.imported) {
      addTransactions(state.imported.transactions);
    }
    const finalBudgets = budgets.map(b => ({
      ...b,
      limit: parseFloat(state.budgetEdits[b.category] ?? String(b.limit)) || b.limit,
    }));
    for (const b of finalBudgets) {
      setBudgetLimit(b.category, b.limit);
    }
    await saveOnboardingData({
      completed: true,
      completedAt: new Date().toISOString(),
      monthlyIncome: income,
      goals: state.mainGoal ? [state.mainGoal] : [],
      incomeSources: state.incomeSources,
      mainGoal: state.mainGoal ?? undefined,
      effortLevel: state.effortLevel ?? undefined,
    });
    router.replace('/(tabs)');
  };

  // ── Step render ──────────────────────────────────────────────────────────────

  const { step } = state;

  // ── STEP 0 – Welcome ──────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <LinearGradient colors={['#1A1060', '#6C63FF', '#0A0B0F']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
        <SafeAreaView style={s.welcomeSafe} edges={['top', 'bottom']}>
          <View style={s.welcomeBody}>
            <View style={s.welcomeLogoWrap}>
              <Ionicons name="wallet" size={52} color="#fff" />
            </View>
            <Text style={s.welcomeTitle}>FinancialOS</Text>
            <Text style={s.welcomeSub}>Il tuo sistema operativo finanziario</Text>
            <View style={s.featureList}>
              {[
                { icon: 'shield-checkmark', text: 'Dati solo sul tuo dispositivo, mai condivisi' },
                { icon: 'trending-up',      text: 'Patrimonio netto in tempo reale' },
                { icon: 'bulb',             text: 'Analisi e suggerimenti personalizzati' },
              ].map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <View style={s.featureIcon}><Ionicons name={f.icon as any} size={18} color="rgba(255,255,255,0.9)" /></View>
                  <Text style={s.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
          <PrimaryBtn label="Inizia la configurazione" onPress={() => goTo(1)} fullWidth />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── STEP 1 – Conti Bancari ────────────────────────────────────────────────

  if (step === 1) {
    const totalBal = state.accounts.reduce((s, a) => s + a.balance, 0);
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ProgressBar current={1} total={TOTAL_STEPS} />
            <StepHeader
              title="I tuoi conti bancari"
              subtitle="Aggiungi tutti i conti correnti e le carte. Serve per calcolare il tuo patrimonio netto reale."
            />

            {state.accounts.length > 0 && (
              <View style={s.summaryChip}>
                <Ionicons name="wallet-outline" size={16} color={Colors.semantic.success} />
                <Text style={s.summaryChipText}>Liquidità totale: €{totalBal.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
              </View>
            )}

            {state.accounts.map((acc, i) => (
              <View key={i} style={s.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemCardTitle}>{acc.bankName}</Text>
                  <Text style={s.metaText}>{acc.accountLabel}</Text>
                </View>
                <Text style={s.amountGreen}>€{acc.balance.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
                <TouchableOpacity onPress={() => setState(s => ({ ...s, accounts: s.accounts.filter((_, j) => j !== i) }))}>
                  <Ionicons name="trash-outline" size={18} color={Colors.semantic.danger} />
                </TouchableOpacity>
              </View>
            ))}

            {showBankPicker
              ? <BankPickerForm onConfirm={acc => { setState(s => ({ ...s, accounts: [...s.accounts, acc] })); setShowBankPicker(false); }} onCancel={() => setShowBankPicker(false)} />
              : (
                <TouchableOpacity style={s.addDashedBtn} onPress={() => setShowBankPicker(true)} activeOpacity={0.7}>
                  <Ionicons name="add-circle" size={20} color={Colors.accent.primary} />
                  <Text style={s.addDashedBtnText}>Aggiungi conto bancario</Text>
                </TouchableOpacity>
              )
            }

            <View style={s.stepFooter}>
              <GhostBtn label={state.accounts.length > 0 ? 'Avanti →' : 'Salta per ora'} onPress={() => goTo(2)} />
              {state.accounts.length > 0 && (
                <PrimaryBtn label="Avanti" onPress={() => goTo(2)} />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── STEP 2 – Investimenti ─────────────────────────────────────────────────

  if (step === 2) {
    const portValue = state.assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ProgressBar current={2} total={TOTAL_STEPS} />
            <StepHeader
              title="Investimenti e crypto"
              subtitle="Aggiungi ETF, azioni, obbligazioni e criptovalute. Puoi cercarlo per nome o ticker."
            />

            {portValue > 0 && (
              <View style={s.summaryChip}>
                <Ionicons name="trending-up-outline" size={16} color={Colors.semantic.success} />
                <Text style={s.summaryChipText}>Portafoglio: €{portValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
              </View>
            )}

            {state.assets.map((a, i) => (
              <View key={i} style={s.itemCard}>
                <View style={[s.tickerBadge, { backgroundColor: a.color + '22' }]}>
                  <Text style={[s.tickerBadgeText, { color: a.color }]}>{a.ticker.slice(0, 4)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemCardTitle}>{a.name}</Text>
                  <Text style={s.metaText}>{a.quantity} × €{a.currentPrice.toFixed(2)}</Text>
                </View>
                <Text style={s.amountGreen}>€{(a.quantity * a.currentPrice).toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
                <TouchableOpacity onPress={() => setState(s => ({ ...s, assets: s.assets.filter((_, j) => j !== i) }))}>
                  <Ionicons name="trash-outline" size={18} color={Colors.semantic.danger} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Tab selector */}
            <View style={s.tabRow}>
              {(['investment', 'crypto'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tabBtn, assetTab === tab && s.tabBtnActive]}
                  onPress={() => setAssetTab(tab)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={tab === 'crypto' ? 'logo-bitcoin' : 'trending-up'} size={16} color={assetTab === tab ? Colors.accent.primary : Colors.text.muted} />
                  <Text style={[s.tabBtnText, assetTab === tab && s.tabBtnTextActive]}>
                    {tab === 'crypto' ? 'Crypto' : 'ETF & Azioni'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <AssetSearch
              assetType={assetTab}
              onAdd={a => setState(prev => ({ ...prev, assets: [...prev.assets, a] }))}
            />

            <View style={s.stepFooter}>
              <GhostBtn label="Salta" onPress={() => goTo(3)} />
              <PrimaryBtn label="Avanti" onPress={() => goTo(3)} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── STEP 3 – Entrate ──────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ProgressBar current={3} total={TOTAL_STEPS} />
            <StepHeader
              title="Le tue entrate"
              subtitle="Inserisci tutte le fonti di reddito: stipendio, affitti, freelance, dividendi… Più dati hai, più precisa sarà l'analisi."
            />

            {income > 0 && (
              <View style={s.summaryChip}>
                <Ionicons name="cash-outline" size={16} color={Colors.semantic.success} />
                <Text style={s.summaryChipText}>Entrate mensili totali: €{income.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
              </View>
            )}

            {state.incomeSources.map((src, i) => {
              const t = INCOME_TYPES.find(t => t.id === src.type)!;
              const monthly = monthlyAmount(src);
              return (
                <View key={src.id} style={s.itemCard}>
                  <Ionicons name={t.icon as any} size={20} color={Colors.accent.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemCardTitle}>{src.label}</Text>
                    <Text style={s.metaText}>
                      €{src.amount.toLocaleString('it-IT', { maximumFractionDigits: 0 })} {src.frequency === 'monthly' ? '/ mese' : '/ anno'}
                      {src.frequency === 'annual' ? ` (≈ €${monthly.toFixed(0)}/mese)` : ''}
                    </Text>
                  </View>
                  <Text style={s.amountGreen}>€{monthly.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
                  <TouchableOpacity onPress={() => setState(s => ({ ...s, incomeSources: s.incomeSources.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={18} color={Colors.semantic.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}

            {showIncomeForm
              ? <IncomeForm
                  onAdd={src => { setState(s => ({ ...s, incomeSources: [...s.incomeSources, src] })); setShowIncomeForm(false); }}
                  onCancel={() => setShowIncomeForm(false)}
                />
              : (
                <TouchableOpacity style={s.addDashedBtn} onPress={() => setShowIncomeForm(true)} activeOpacity={0.7}>
                  <Ionicons name="add-circle" size={20} color={Colors.accent.primary} />
                  <Text style={s.addDashedBtnText}>
                    {state.incomeSources.length === 0 ? 'Aggiungi il tuo reddito principale' : 'Aggiungi altra entrata'}
                  </Text>
                </TouchableOpacity>
              )
            }

            <View style={s.stepFooter}>
              <GhostBtn label="Salta" onPress={() => goTo(4)} />
              <PrimaryBtn label="Avanti" onPress={() => goTo(4)} disabled={state.incomeSources.length === 0} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── STEP 4 – Obiettivi & Impegno ──────────────────────────────────────────

  if (step === 4) {
    const saving = state.effortLevel && income > 0
      ? getSavingsPotential(income, state.mainGoal ? [state.mainGoal] : [], state.effortLevel)
      : null;

    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ProgressBar current={4} total={TOTAL_STEPS} />
          <StepHeader
            title="Obiettivi & impegno"
            subtitle="Cosa vuoi raggiungere? E quanto sei disposto a sacrificare per arrivarci?"
          />

          <Text style={s.subSectionLabel}>Obiettivo principale</Text>
          <View style={s.goalGrid}>
            {GOAL_OPTIONS.map(g => {
              const sel = state.mainGoal === g.id;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[s.goalCard, sel && s.goalCardSel]}
                  onPress={() => setState(s => ({ ...s, mainGoal: g.id }))}
                  activeOpacity={0.75}
                >
                  <Ionicons name={g.icon as any} size={24} color={sel ? Colors.accent.primary : Colors.text.secondary} />
                  <Text style={[s.goalCardTitle, sel && s.goalCardTitleSel]}>{g.label}</Text>
                  <Text style={s.goalCardDesc}>{g.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.subSectionLabel}>Livello di impegno</Text>
          {EFFORT_OPTIONS.map(e => {
            const sel = state.effortLevel === e.id;
            return (
              <TouchableOpacity
                key={e.id}
                style={[s.effortCard, sel && s.effortCardSel]}
                onPress={() => setState(s => ({ ...s, effortLevel: e.id }))}
                activeOpacity={0.75}
              >
                <Text style={s.effortEmoji}>{e.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.effortLabel, sel && s.effortLabelSel]}>{e.label}</Text>
                  <Text style={s.effortDesc}>{e.desc}</Text>
                </View>
                <View style={s.savingHintBadge}>
                  <Text style={s.savingHintText}>{e.savingHint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {saving !== null && income > 0 && (
            <View style={[s.summaryChip, saving < 0 && { backgroundColor: Colors.semantic.dangerDim }]}>
              <Ionicons name="calculator-outline" size={16} color={saving >= 0 ? Colors.semantic.success : Colors.semantic.danger} />
              <Text style={[s.summaryChipText, saving < 0 && { color: Colors.semantic.danger }]}>
                Risparmio stimato: €{Math.max(0, saving).toLocaleString('it-IT', { maximumFractionDigits: 0 })}/mese
              </Text>
            </View>
          )}

          <View style={s.stepFooter}>
            <GhostBtn label="Salta" onPress={() => goTo(5)} />
            <PrimaryBtn
              label="Avanti"
              onPress={() => goTo(5)}
              disabled={!state.mainGoal || !state.effortLevel}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── STEP 5 – Importa Estratto Conto ──────────────────────────────────────

  if (step === 5) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ProgressBar current={5} total={TOTAL_STEPS} />
          <StepHeader
            title="Importa il tuo estratto conto"
            subtitle="Analizzo le tue spese reali per darti budget precisi e suggerimenti mirati. È il passo che fa la differenza."
          />

          <View style={s.infoCard}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.accent.primary} />
            <Text style={s.infoCardText}>
              Il file viene letto solo sul tuo dispositivo. Nessun dato viene inviato a server esterni.
            </Text>
          </View>

          <ImportPanel
            onImported={result => setState(s => ({ ...s, imported: result }))}
          />

          {state.imported && (
            <View style={s.infoCard}>
              <Ionicons name="sparkles-outline" size={18} color={Colors.semantic.success} />
              <Text style={[s.infoCardText, { color: Colors.semantic.success }]}>
                Ottimo! Userò queste transazioni per calibrare i tuoi budget nel prossimo step.
              </Text>
            </View>
          )}

          <View style={s.stepFooter}>
            <GhostBtn label="Salta — faccio dopo" onPress={() => { initBudgetEdits(budgets); goTo(6); }} />
            <PrimaryBtn label="Avanti" onPress={() => { initBudgetEdits(budgets); goTo(6); }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── STEP 6 – Analisi & Budget ─────────────────────────────────────────────

  if (step === 6) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ProgressBar current={6} total={TOTAL_STEPS} />
            <StepHeader title="La tua analisi finanziaria" />

            {/* Score */}
            <View style={s.scoreCard}>
              <View style={[s.scoreCircle, { borderColor: sColor }]}>
                <Text style={[s.scoreNumber, { color: sColor }]}>{score}</Text>
                <Text style={s.scoreMax}>/100</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[s.scoreLabel, { color: sColor }]}>{sLabel}</Text>
                <Text style={s.scoreDesc}>
                  {score >= 60
                    ? 'Hai una buona base finanziaria. Continuiamo a migliorarla insieme.'
                    : score >= 40
                    ? 'C\'è potenziale da esprimere. I budget che vedi qui ti aiuteranno a crescere.'
                    : 'Siamo al punto di partenza — il momento migliore per iniziare è adesso.'}
                </Text>
              </View>
            </View>

            {/* Tips */}
            {tips.length > 0 && (
              <View style={s.tipsSection}>
                <Text style={s.subSectionLabel}>Suggerimenti immediati</Text>
                {tips.map((tip, i) => (
                  <View key={i} style={s.tipCard}>
                    <View style={s.tipBullet}><Text style={s.tipBulletText}>{i + 1}</Text></View>
                    <Text style={s.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Budget */}
            {budgets.length > 0 && (
              <>
                <View style={s.subSectionHeader}>
                  <Text style={s.subSectionLabel}>Budget mensili proposti</Text>
                  <View style={[s.residuoBadge, residuo < 0 && s.residuoBadgeDanger]}>
                    <Text style={[s.residuoText, residuo < 0 && s.residuoTextDanger]}>
                      Residuo: €{residuo.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </View>
                <Text style={s.budgetHint}>
                  Modificali liberamente — sono basati su reddito ({income > 0 ? `€${income.toFixed(0)}/mese` : 'non inserito'}) e impegno selezionato.
                </Text>
                {budgets.map(b => {
                  const cat = CATEGORIES[b.category];
                  if (!cat) return null;
                  return (
                    <View key={b.category} style={s.budgetRow}>
                      <View style={[s.budgetIcon, { backgroundColor: cat.bgColor }]}>
                        <Ionicons name={cat.icon as any} size={16} color={cat.color} />
                      </View>
                      <Text style={s.budgetLabel}>{cat.label}</Text>
                      <TextInput
                        style={s.budgetInput}
                        value={state.budgetEdits[b.category] ?? String(b.limit)}
                        onChangeText={v => setState(prev => ({ ...prev, budgetEdits: { ...prev.budgetEdits, [b.category]: v } }))}
                        keyboardType="decimal-pad"
                      />
                      <Text style={s.budgetSuffix}>€</Text>
                    </View>
                  );
                })}
              </>
            )}

            <PrimaryBtn label="Conferma e continua" onPress={() => goTo(7)} fullWidth />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── STEP 7 – Tutto Pronto ─────────────────────────────────────────────────

  if (step === 7) {
    const totalBal = state.accounts.reduce((s, a) => s + a.balance, 0);
    const portVal = state.assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
    const motivationalMsg = score >= 60
      ? 'Sei sulla strada giusta. FinancialOS ti aiuterà a mantenere il controllo e crescere ogni mese.'
      : 'Ogni grande percorso parte da un primo passo. Hai già fatto il più difficile: iniziare. Adesso acceleriamo insieme.';

    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ScrollView style={s.scroll} contentContainerStyle={s.summaryContent}>
          <View style={s.doneIcon}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.semantic.success} />
          </View>
          <Text style={s.doneTitle}>Tutto pronto! 🎉</Text>
          <Text style={s.doneSub}>{motivationalMsg}</Text>

          {/* Stats grid */}
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: sColor }]}>{score}</Text>
              <Text style={s.statLabel}>Punteggio</Text>
              <Text style={[s.statSub, { color: sColor }]}>{sLabel}</Text>
            </View>
            {(totalBal + portVal) > 0 && (
              <View style={s.statCard}>
                <Text style={s.statNum}>€{(totalBal + portVal).toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
                <Text style={s.statLabel}>Patrimonio netto</Text>
                <Text style={s.statSub}>{state.accounts.length} conto/i + portafoglio</Text>
              </View>
            )}
            {income > 0 && (
              <View style={s.statCard}>
                <Text style={s.statNum}>€{income.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</Text>
                <Text style={s.statLabel}>Entrate / mese</Text>
                <Text style={s.statSub}>{state.incomeSources.length} fonte/i</Text>
              </View>
            )}
            {budgets.length > 0 && (
              <View style={s.statCard}>
                <Text style={s.statNum}>{budgets.length}</Text>
                <Text style={s.statLabel}>Budget attivi</Text>
                <Text style={s.statSub}>Pronti per il tracciamento</Text>
              </View>
            )}
          </View>

          {state.imported && (
            <View style={s.infoCard}>
              <Ionicons name="analytics-outline" size={18} color={Colors.accent.primary} />
              <Text style={s.infoCardText}>
                {state.imported.transactions.length} transazioni importate — il Coach le userà per analizzare le tue spese.
              </Text>
            </View>
          )}

          <PrimaryBtn label="Entra nell'app" onPress={handleComplete} fullWidth />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 48, gap: Spacing.lg },
  summaryContent: { paddingHorizontal: Spacing.lg, paddingTop: 48, paddingBottom: 48, gap: Spacing.lg, alignItems: 'center' },

  // Welcome
  welcomeSafe: { flex: 1, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, justifyContent: 'space-between' },
  welcomeBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.lg },
  welcomeLogoWrap: { width: 88, height: 88, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  welcomeTitle: { fontSize: 34, fontWeight: '800', color: '#fff', textAlign: 'center' },
  welcomeSub: { ...Typography.body, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  featureList: { gap: Spacing.sm, alignSelf: 'stretch', marginTop: Spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.lg, padding: Spacing.md },
  featureIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  featureText: { ...Typography.body, color: '#fff', flex: 1 },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  progressTrack: { flex: 1, height: 4, backgroundColor: Colors.bg.elevated, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent.primary, borderRadius: 2 },
  progressLabel: { ...Typography.micro, color: Colors.text.muted },

  // Step headings
  stepTitle: { ...Typography.h1, color: Colors.text.primary },
  stepSubtitle: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 20 },
  subSectionLabel: { ...Typography.caption, color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  subSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Summary chip
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.semantic.successDim, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  summaryChipText: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '600' },

  // Item cards
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: Spacing.md },
  itemCardTitle: { ...Typography.bodyMedium, color: Colors.text.primary },
  amountGreen: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '600' },

  // Add button (dashed)
  addDashedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.accent, borderStyle: 'dashed', padding: Spacing.md },
  addDashedBtnText: { ...Typography.bodyMedium, color: Colors.accent.primary },

  // Step footer
  stepFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },

  // Inline forms
  inlineForm: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: Spacing.md, gap: Spacing.sm },
  formSectionLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  textInput: { backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.text.primary, ...Typography.body },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: 4 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, padding: Spacing.sm },

  // List rows (banks / assets)
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  listRowName: { ...Typography.bodyMedium, color: Colors.text.primary },
  colorBadge: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  colorBadgeText: { fontWeight: '700', fontSize: 14 },
  tickerBadge: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.accent.glow, justifyContent: 'center', alignItems: 'center' },
  tickerBadgeText: { ...Typography.micro, color: Colors.accent.primary, fontWeight: '700' },
  metaText: { ...Typography.caption, color: Colors.text.muted },
  emptyHint: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center', marginTop: 4 },
  manualLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginTop: 4 },
  manualLinkText: { ...Typography.caption, color: Colors.text.muted },
  directBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent.glow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.accent, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  directBtnText: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600', flex: 1 },

  // Asset tabs
  tabRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: -4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderRadius: Radius.md, paddingVertical: 8, borderWidth: 1.5, borderColor: Colors.border.default, backgroundColor: Colors.bg.card },
  tabBtnActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  tabBtnText: { ...Typography.bodyMedium, color: Colors.text.muted },
  tabBtnTextActive: { color: Colors.accent.primary },

  // Income form
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  currencyLabel: { fontSize: 32, fontWeight: '800', color: Colors.text.secondary },
  amtInput: { fontSize: 40, fontWeight: '800', color: Colors.text.primary, flex: 1 },
  freqRow: { flexDirection: 'row', gap: Spacing.sm },
  freqBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.default, backgroundColor: Colors.bg.card },
  freqBtnSelected: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  freqBtnText: { ...Typography.bodyMedium, color: Colors.text.secondary },
  freqBtnTextSelected: { color: Colors.accent.primary },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.default, marginHorizontal: 4 },
  typeChipSelected: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  typeChipText: { ...Typography.caption, color: Colors.text.muted },
  typeChipTextSelected: { color: Colors.accent.primary },

  // Goals
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  goalCard: { width: '47%', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, padding: Spacing.md, gap: 6, alignItems: 'center' },
  goalCardSel: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  goalCardTitle: { ...Typography.bodyMedium, color: Colors.text.secondary, fontWeight: '600' },
  goalCardTitleSel: { color: Colors.accent.primary },
  goalCardDesc: { ...Typography.micro, color: Colors.text.muted, textAlign: 'center' },

  // Effort
  effortCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, padding: Spacing.md },
  effortCardSel: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  effortEmoji: { fontSize: 28 },
  effortLabel: { ...Typography.bodyMedium, color: Colors.text.secondary, fontWeight: '700' },
  effortLabelSel: { color: Colors.accent.primary },
  effortDesc: { ...Typography.caption, color: Colors.text.muted },
  savingHintBadge: { backgroundColor: Colors.bg.elevated, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  savingHintText: { ...Typography.micro, color: Colors.text.secondary },

  // Import panel
  importCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: Spacing.lg, gap: Spacing.md },
  importCardTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  importBtnsRow: { flexDirection: 'row', gap: Spacing.md },
  importFormatBtn: { flex: 1, alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg.elevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.accent, paddingVertical: Spacing.lg },
  importFormatLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  importFormatDesc: { ...Typography.micro, color: Colors.text.muted },
  importSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  importCheckIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.semantic.success, justifyContent: 'center', alignItems: 'center' },
  importSuccessTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },

  // Info card
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border.default },
  infoCardText: { ...Typography.caption, color: Colors.text.secondary, flex: 1, lineHeight: 18 },

  // Score
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, backgroundColor: Colors.bg.card, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border.default },
  scoreCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  scoreNumber: { fontSize: 30, fontWeight: '800' },
  scoreMax: { ...Typography.micro, color: Colors.text.muted },
  scoreLabel: { ...Typography.h3, fontWeight: '700' },
  scoreDesc: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },

  // Tips
  tipsSection: { gap: Spacing.sm },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border.default },
  tipBullet: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent.glow, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  tipBulletText: { ...Typography.micro, color: Colors.accent.primary, fontWeight: '700' },
  tipText: { ...Typography.caption, color: Colors.text.primary, flex: 1, lineHeight: 20 },

  // Budget
  residuoBadge: { backgroundColor: Colors.semantic.successDim, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  residuoBadgeDanger: { backgroundColor: Colors.semantic.dangerDim },
  residuoText: { ...Typography.caption, color: Colors.semantic.success, fontWeight: '600' },
  residuoTextDanger: { color: Colors.semantic.danger },
  budgetHint: { ...Typography.caption, color: Colors.text.muted, lineHeight: 18 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, paddingVertical: 10, paddingHorizontal: Spacing.md },
  budgetIcon: { width: 32, height: 32, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
  budgetLabel: { ...Typography.bodyMedium, color: Colors.text.primary, flex: 1 },
  budgetInput: { ...Typography.bodyMedium, color: Colors.text.primary, backgroundColor: Colors.bg.elevated, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, minWidth: 72, textAlign: 'right' },
  budgetSuffix: { ...Typography.caption, color: Colors.text.muted },

  // Done / summary
  doneIcon: { marginBottom: Spacing.sm },
  doneTitle: { ...Typography.h1, color: Colors.text.primary, textAlign: 'center' },
  doneSub: { ...Typography.body, color: Colors.text.secondary, textAlign: 'center', lineHeight: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', width: '100%' },
  statCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default, padding: Spacing.lg, alignItems: 'center', gap: 4, minWidth: 140, flex: 1 },
  statNum: { fontSize: 26, fontWeight: '800', color: Colors.text.primary },
  statLabel: { ...Typography.caption, color: Colors.text.secondary },
  statSub: { ...Typography.micro, color: Colors.text.muted },

  // Buttons
  primaryBtn: { backgroundColor: Colors.accent.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: 13, alignItems: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  btnDisabled: { opacity: 0.38 },
  primaryBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
  ghostBtn: { borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 13, alignItems: 'center' },
  ghostBtnText: { ...Typography.bodyMedium, color: Colors.text.secondary },
});
