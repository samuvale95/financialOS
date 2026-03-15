import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius, Touch } from '../../constants/theme';
import { Page, PageSection } from '../../components/layout/Page';
import { Card, AccentCard } from '../../components/ui/Card';
import { NetWorthCard } from '../../components/dashboard/NetWorthCard';
import { IncomeExpenseRow } from '../../components/dashboard/IncomeExpenseRow';
import { BudgetSection } from '../../components/dashboard/BudgetSection';
import { RecentTransactions } from '../../components/dashboard/RecentTransactions';
import { GoalCard } from '../../components/dashboard/GoalCard';
import { CashFlowCard } from '../../components/dashboard/CashFlowCard';
import { Skeleton } from '../../components/ui/Skeleton';
import EmergencyFundWidget from '../../components/dashboard/EmergencyFundWidget';
import SavingsRateWidget from '../../components/dashboard/SavingsRateWidget';
import HouseGoalWidget from '../../components/dashboard/HouseGoalWidget';
import RetirementWidget from '../../components/dashboard/RetirementWidget';
import MonthProjectionCard from '../../components/dashboard/MonthProjectionCard';
import BudgetReconciliationBanner from '../../components/BudgetReconciliationBanner';
import { useData } from '../../contexts/DataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { loadOnboardingData, saveOnboardingData } from '../../utils/storage';
import { calculateEstimated730Refund, calculateForfettarioNetto } from '../../utils/taxCalculator';
import type { Transaction, Goal, OnboardingGoalId, MonthSummary } from '../../types';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';

// ── Quick Actions ─────────────────────────────────────────────────────────────

interface QuickAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

function QuickActionsRow({ budgets }: { budgets: import('../../types').Budget[] }) {
  const actions: QuickAction[] = [
    {
      icon: 'cloud-upload-outline',
      label: 'Importa',
      onPress: () => router.push('/(tabs)/importa'),
    },
    {
      icon: 'add-circle-outline',
      label: 'Aggiungi',
      onPress: () => router.push('/add-transaction'),
    },
  ];

  if (budgets.length > 0) {
    actions.push({
      icon: 'pie-chart-outline',
      label: 'Budget',
      onPress: () => router.push(`/budget/${budgets[0].id}` as any),
    });
  }

  return (
    <View style={styles.qaRow}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          style={styles.qaChip}
          activeOpacity={0.7}
          onPress={a.onPress}
        >
          <Ionicons name={a.icon} size={16} color={Colors.accent.primary} />
          <Text style={styles.qaLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Emergency Fund Card ───────────────────────────────────────────────────────

function EmergencyFundCard({ goals, monthlyExpenses }: { goals: Goal[]; monthlyExpenses: number }) {
  const goal = goals.find((g) => g.title === 'Fondo di Emergenza');
  if (!goal) return null;

  const progress = goal.targetAmount > 0 ? Math.min(1, goal.savedAmount / goal.targetAmount) : 0;
  const monthsCovered = monthlyExpenses > 0 ? goal.savedAmount / monthlyExpenses : 0;
  const isOk = monthsCovered >= 3;

  return (
    <Card style={{ borderColor: '#FFB347' + '66', gap: 10 }}>
      <View style={styles.emergencyRow}>
        <Text style={styles.emergencyEmoji}>🛡️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.emergencyTitle}>Fondo di Emergenza</Text>
          <Text style={[styles.emergencyStatus, { color: isOk ? Colors.semantic.success : Colors.semantic.warning }]}>
            {isOk ? `${monthsCovered.toFixed(1)} mesi coperti` : 'Fondo incompleto'}
          </Text>
        </View>
        <View style={styles.emergencyAmounts}>
          <Text style={styles.emergencyActual}>€{goal.savedAmount.toLocaleString('it-IT')}</Text>
          <Text style={styles.emergencyTarget}>/ €{goal.targetAmount.toLocaleString('it-IT')}</Text>
        </View>
      </View>
      <View style={styles.emergencyBarBg}>
        <View
          style={[
            styles.emergencyBarFill,
            {
              width: `${Math.round(progress * 100)}%` as any,
              backgroundColor: isOk ? Colors.semantic.success : '#FFB347',
            },
          ]}
        />
      </View>
    </Card>
  );
}

function FiscoCard({ transactions }: { transactions: Transaction[] }) {
  const { fiscalProfile } = useSettings();
  if (fiscalProfile.type === 'altro') return null;

  if (fiscalProfile.type === 'dipendente') {
    const result = calculateEstimated730Refund(transactions);
    if (result.estimatedRefund <= 0) return null;
    return (
      <AccentCard padding={14} style={{ gap: 8 }}>
        <View style={styles.fiscoHeader}>
          <Ionicons name="receipt" size={18} color={Colors.semantic.success} />
          <Text style={styles.fiscoTitle}>Rimborso 730 stimato</Text>
        </View>
        <Text style={styles.fiscoValue}>€{result.estimatedRefund.toFixed(0)}</Text>
      </AccentCard>
    );
  }

  const currentYear = new Date().getFullYear().toString();
  const ytdIncome = transactions
    .filter((t) => t.amount > 0 && t.category !== 'transfer' && t.date.startsWith(currentYear))
    .reduce((s, t) => s + t.amount, 0);
  const result = calculateForfettarioNetto(ytdIncome, fiscalProfile);
  if (result.recommendedSetAside <= 0) return null;

  return (
    <AccentCard style={{ gap: 8 }}>
      <View style={styles.fiscoHeader}>
        <Ionicons name="document-text" size={18} color={Colors.accent.primary} />
        <Text style={styles.fiscoTitle}>Regime Forfettario</Text>
      </View>
      <View style={styles.fiscoRow}>
        <Text style={styles.fiscoLabel}>Accantona</Text>
        <Text style={styles.fiscoValue}>€{result.recommendedSetAside.toFixed(0)}/mese</Text>
      </View>
      <View style={styles.fiscoRow}>
        <Text style={styles.fiscoLabel}>Residuo 85k</Text>
        <Text
          style={[
            styles.fiscoValue,
            { color: result.thresholdResidual < 15000 ? Colors.semantic.danger : Colors.text.primary },
          ]}
        >
          €{result.thresholdResidual.toFixed(0)}
        </Text>
      </View>
    </AccentCard>
  );
}

function HistoricalMonthBanner({ month, onDismiss }: { month: string; onDismiss: () => void }) {
  const label = new Date(month + '-01').toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <View style={styles.historicalBanner}>
      <Ionicons name="time-outline" size={16} color="#7A5200" style={{ marginTop: 1 }} />
      <Text style={styles.historicalBannerText}>
        Stai visualizzando i dati di{' '}
        <Text style={styles.historicalBannerBold}>{label}</Text>.{' '}
        Importa transazioni recenti per aggiornare.
      </Text>
      <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color="#7A5200" />
      </TouchableOpacity>
    </View>
  );
}

// ── Hero Badge ────────────────────────────────────────────────────────────────

function HeroBadge({ goals, monthSummary }: { goals: Goal[]; monthSummary: MonthSummary }) {
  const emergencyGoal = goals.find((g) => g.title === 'Fondo di Emergenza');

  if (emergencyGoal) {
    const monthlyExp = Math.abs(monthSummary.expenses);
    const monthsCovered = monthlyExp > 0 ? emergencyGoal.savedAmount / monthlyExp : 0;
    const isOk = monthsCovered >= 3;
    const badgeColor = isOk ? Colors.semantic.success : '#FFB347';
    return (
      <View style={[styles.heroBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '60' }]}>
        <Text style={[styles.heroBadgeText, { color: badgeColor }]}>
          {isOk ? '🛡️ Fondo OK' : '⚠️ Fondo incompleto'}
        </Text>
      </View>
    );
  }

  if (monthSummary.income <= 0) return null;

  const rate = monthSummary.savingsRate;
  const badgeColor = rate >= 20 ? Colors.semantic.success : rate >= 10 ? '#FFB347' : Colors.semantic.danger;
  const label = rate >= 20 ? 'Risparmio ottimo' : rate >= 10 ? 'Risparmio buono' : 'Risparmio basso';
  return (
    <View style={[styles.heroBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '60' }]}>
      <Text style={[styles.heroBadgeText, { color: badgeColor }]}>
        {label} {rate.toFixed(0)}%
      </Text>
    </View>
  );
}

// ── Hero Stack ────────────────────────────────────────────────────────────────

function HeroStack({ summary, goals }: { summary: MonthSummary; goals: Goal[] }) {
  return (
    <View style={styles.heroStack}>
      <NetWorthCard summary={summary} />
      <IncomeExpenseRow
        income={summary.income}
        expenses={summary.expenses}
        savingsRate={summary.savingsRate}
      />
      <HeroBadge goals={goals} monthSummary={summary} />
    </View>
  );
}

// ── Goal Widgets ──────────────────────────────────────────────────────────────

interface GoalWidgetArgs {
  mainGoal: OnboardingGoalId | null;
  goals: Goal[];
  accounts: import('../../types').BankAccount[];
  monthSummary: import('../../types').MonthSummary;
}

function renderGoalWidget({ mainGoal, goals, accounts, monthSummary }: GoalWidgetArgs): React.ReactElement | null {
  const accountsBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const monthlyExpenses = Math.abs(monthSummary.expenses);
  const monthlySavings = monthSummary.income - monthlyExpenses;

  switch (mainGoal) {
    case 'emergenza': {
      const emergencyGoal = goals.find((g) => g.title === 'Fondo di Emergenza') ?? null;
      return (
        <EmergencyFundWidget
          accountsBalance={accountsBalance}
          monthlyExpenses={monthlyExpenses}
          emergencyGoal={emergencyGoal}
        />
      );
    }
    case 'risparmio':
      return (
        <SavingsRateWidget
          savingsRate={monthSummary.savingsRate}
          monthlyIncome={monthSummary.income}
          monthlySavings={monthlySavings}
        />
      );
    case 'casa': {
      const houseGoal =
        goals.find((g) =>
          /casa|acquisto|immobil|ristruttura/i.test(g.title)
        ) ?? null;
      return (
        <HouseGoalWidget
          goal={houseGoal}
          monthlySavings={monthlySavings}
        />
      );
    }
    case 'pensione':
      return (
        <RetirementWidget
          monthlySavings={monthlySavings}
          currentNetWorth={monthSummary.netWorth}
        />
      );
    case 'viaggio':
    case 'istruzione': {
      const keyword = mainGoal === 'viaggio' ? /viaggio|vacanz|trip/i : /istruzione|corso|studio|univers/i;
      const matchingGoal = goals.find((g) => keyword.test(g.title));
      return matchingGoal ? <GoalCard goal={matchingGoal} /> : null;
    }
    default:
      return null;
  }
}

// ── Onboarding Summary Card ───────────────────────────────────────────────────

const GOAL_LABELS: Record<OnboardingGoalId, string> = {
  risparmio: 'Risparmio',
  casa: 'Acquisto casa',
  pensione: 'Pensione',
  emergenza: 'Fondo emergenza',
  viaggio: 'Viaggi',
  istruzione: 'Istruzione',
};

interface OnboardingSummaryData {
  monthlyIncome: number;
  mainGoal: OnboardingGoalId | null;
  region: string | null;
  householdSize: number;
}

function OnboardingSummaryCard({
  data,
  onDismiss,
}: {
  data: OnboardingSummaryData;
  onDismiss: () => void;
}) {
  const goalLabel = data.mainGoal ? GOAL_LABELS[data.mainGoal] : 'Non specificato';
  const householdLabel = data.householdSize === 1 ? 'Solo/a' : `${data.householdSize} persone`;

  const bullets: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }[] = [
    {
      icon: 'cash-outline',
      label: 'Reddito mensile',
      value: `€${Math.round(data.monthlyIncome).toLocaleString('it-IT')}`,
    },
    {
      icon: 'flag-outline',
      label: 'Obiettivo principale',
      value: goalLabel,
    },
    {
      icon: data.region ? 'location-outline' : 'people-outline',
      label: data.region ?? 'Nucleo familiare',
      value: data.region ? householdLabel : householdLabel,
    },
  ];

  return (
    <Card
      padding={16}
      style={{ borderColor: Colors.semantic.success + '55', gap: 14 }}
    >
      {/* Header */}
      <View style={styles.osHeader}>
        <View style={styles.osIconWrap}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.semantic.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.osTitle}>Profilo creato</Text>
          <Text style={styles.osSubtitle}>Ecco cosa abbiamo configurato per te</Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={Colors.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Bullets */}
      <View style={styles.osBullets}>
        {bullets.map((b, i) => (
          <View
            key={b.label}
            style={[styles.osBulletRow, i === bullets.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Ionicons name={b.icon} size={14} color={Colors.accent.primary} />
            <Text style={styles.osBulletLabel}>{b.label}</Text>
            <Text style={styles.osBulletValue}>{b.value}</Text>
          </View>
        ))}
      </View>

      {/* Settings hint */}
      <View style={styles.osHintRow}>
        <Ionicons name="settings-outline" size={12} color={Colors.text.muted} />
        <Text style={styles.osHintText}>
          Puoi modificare questi dati in{' '}
          <Text
            style={styles.osHintLink}
            onPress={() => router.push('/settings')}
          >
            Impostazioni
          </Text>
        </Text>
      </View>

      {/* Dismiss button */}
      <TouchableOpacity style={styles.osOkBtn} onPress={onDismiss} activeOpacity={0.8}>
        <Text style={styles.osOkText}>Ok, ho capito</Text>
      </TouchableOpacity>
    </Card>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { transactions, budgets, goals, accounts, subscriptions, monthSummary, isLoading } = useData();
  const { settings } = useSettings();
  const [mainGoal, setMainGoal] = useState<OnboardingGoalId | null>(null);
  const [historicalBannerDismissed, setHistoricalBannerDismissed] = useState(false);
  const [onboardingSummary, setOnboardingSummary] = useState<OnboardingSummaryData | null>(null);

  useEffect(() => {
    loadOnboardingData().then((d) => {
      setMainGoal(d.mainGoal ?? null);
      if (
        d.completed &&
        !d.hasSeenOnboardingSummary &&
        (d.monthlyIncome ?? 0) > 0
      ) {
        setOnboardingSummary({
          monthlyIncome: d.monthlyIncome!,
          mainGoal: d.mainGoal ?? null,
          region: d.userProfile?.region ?? null,
          householdSize: d.userProfile?.householdSize ?? 1,
        });
      }
    });
  }, []);

  const handleDismissSummary = useCallback(async () => {
    setOnboardingSummary(null);
    const current = await loadOnboardingData();
    await saveOnboardingData({ ...current, hasSeenOnboardingSummary: true });
  }, []);

  const historicalMonthInfo = useMemo(() => {
    if (transactions.length === 0) return null;
    const nowMonth = new Date().toISOString().slice(0, 7);
    const hasCurrentMonth = transactions.some(
      (t) => t.date.startsWith(nowMonth) && t.category !== 'transfer',
    );
    if (hasCurrentMonth) return null;
    const lastMonth = [...new Set(
      transactions.filter((t) => t.category !== 'transfer').map((t) => t.date.slice(0, 7)),
    )].sort().at(-1) ?? nowMonth;
    return lastMonth;
  }, [transactions]);

  const goalWidget = renderGoalWidget({ mainGoal, goals, accounts, monthSummary });
  const showEmergencyCard = mainGoal !== 'emergenza' && goals.some((g) => g.title === 'Fondo di Emergenza');
  const hasFocusContent = goalWidget !== null || showEmergencyCard;

  const today = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const settingsBtn = (
    <TouchableOpacity
      style={styles.iconBtn}
      activeOpacity={0.7}
      onPress={() => router.push('/settings')}
    >
      <Ionicons name="settings-outline" size={22} color={Colors.text.secondary} />
    </TouchableOpacity>
  );

  return (
    <Page
      title="Buongiorno"
      titleVariant="h2"
      subtitle={today.charAt(0).toUpperCase() + today.slice(1)}
      rightAction={settingsBtn}
    >
      {onboardingSummary && (
        <OnboardingSummaryCard data={onboardingSummary} onDismiss={handleDismissSummary} />
      )}

      {isLoading ? (
        <>
          <Skeleton height={44} borderRadius={12} />
          <Skeleton height={160} borderRadius={24} />
          <Skeleton height={100} borderRadius={16} />
          <Skeleton height={220} borderRadius={16} />
        </>
      ) : transactions.length === 0 ? (
        <>
          <QuickActionsRow budgets={budgets} />
          <NetWorthCard summary={monthSummary} />
          <Card
            padding={24}
            style={{
              borderRadius: Radius.xl,
              alignItems: 'center',
              gap: 20,
              backgroundColor: Colors.accent.primary + '08',
              borderColor: Colors.accent.primary + '30',
            }}
          >
            <View style={styles.emptyIconWrap}>
              <Ionicons name="analytics-outline" size={36} color={Colors.accent.primary} />
            </View>

            <Text style={styles.emptyTitle}>
              Inizia collegando{'\n'}i tuoi movimenti
            </Text>

            <View style={styles.emptyBullets}>
              {([
                { icon: 'trending-up-outline', text: 'Analisi mensile automatica' },
                { icon: 'speedometer-outline', text: 'Budget a semaforo sulle categorie' },
                { icon: 'chatbubble-ellipses-outline', text: 'Coach AI con consigli personalizzati' },
              ] as const).map(({ icon, text }) => (
                <View key={text} style={styles.emptyBulletRow}>
                  <Ionicons name={icon} size={16} color={Colors.accent.primary} />
                  <Text style={styles.emptyBulletText}>{text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.emptyBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/importa')}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Importa i tuoi movimenti</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/import-analytics' as any)}>
              <Text style={styles.emptySecondaryLink}>Vedi un esempio di analisi →</Text>
            </TouchableOpacity>
          </Card>
        </>
      ) : (
        <SectionErrorBoundary label="Dashboard non disponibile">
          <>
            <QuickActionsRow budgets={budgets} />
            <HeroStack summary={monthSummary} goals={goals} />
            {historicalMonthInfo && !historicalBannerDismissed && (
              <HistoricalMonthBanner
                month={historicalMonthInfo}
                onDismiss={() => setHistoricalBannerDismissed(true)}
              />
            )}
            <BudgetReconciliationBanner />
            {hasFocusContent && (
              <PageSection title="Focus del mese">
                {goalWidget}
                {showEmergencyCard && (
                  <EmergencyFundCard goals={goals} monthlyExpenses={monthSummary.expenses} />
                )}
              </PageSection>
            )}
            <CashFlowCard
              monthSummary={monthSummary}
              subscriptions={subscriptions}
              transactions={transactions}
            />
            <FiscoCard transactions={transactions} />
            {settings.features.goals && goals.length > 0 && <GoalCard goal={goals[0]} padding={14} />}
            {settings.features.budgets && <BudgetSection budgets={budgets} />}
            <RecentTransactions
              transactions={transactions}
              onSeeAll={() => router.push('/(tabs)/spese')}
            />
          </>
        </SectionErrorBoundary>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  // Hero
  heroStack: { gap: 12 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'center',
  },
  heroBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  // Quick actions
  qaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qaChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: Touch.md,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  qaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Header
  iconBtn: {
    width: Touch.sm,
    height: Touch.sm,
    borderRadius: Touch.sm / 2,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  // Empty state content
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    textAlign: 'center',
    lineHeight: 26,
  },
  emptyBullets: { gap: 10, width: '100%' },
  emptyBulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyBulletText: { ...Typography.caption, color: Colors.text.secondary, flex: 1 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: Colors.accent.primary,
    paddingVertical: 13,
    borderRadius: Radius.lg,
  },
  emptyBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  emptySecondaryLink: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },
  // Emergency card content
  emergencyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emergencyEmoji: { fontSize: 24 },
  emergencyTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  emergencyStatus: { ...Typography.caption, marginTop: 2 },
  emergencyAmounts: { alignItems: 'flex-end' },
  emergencyActual: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  emergencyTarget: { ...Typography.caption, color: Colors.text.muted },
  emergencyBarBg: {
    height: 6,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  emergencyBarFill: { height: 6, borderRadius: 3 },
  // Fisco card content
  fiscoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fiscoTitle: { ...Typography.bodyMedium, color: Colors.text.secondary, fontWeight: '600' },
  fiscoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fiscoLabel: { ...Typography.caption, color: Colors.text.muted },
  fiscoValue: { ...Typography.h3, color: Colors.text.primary, fontWeight: '700' },
  // Historical banner
  historicalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFB347' + '28',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FFB347' + '88',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historicalBannerText: {
    ...Typography.caption,
    color: '#7A5200',
    flex: 1,
    lineHeight: 18,
  },
  historicalBannerBold: { fontWeight: '700', textTransform: 'capitalize' },
  // Onboarding summary card
  osHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  osIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.semantic.success + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  osTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  osSubtitle: { ...Typography.caption, color: Colors.text.muted, marginTop: 1 },
  osBullets: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 0,
  },
  osBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  osBulletLabel: { ...Typography.caption, color: Colors.text.muted, flex: 1 },
  osBulletValue: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  osHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  osHintText: { ...Typography.micro, color: Colors.text.muted, flex: 1, lineHeight: 16 },
  osHintLink: { color: Colors.accent.primary, fontWeight: '600' },
  osOkBtn: {
    backgroundColor: Colors.semantic.success + '22',
    borderWidth: 1,
    borderColor: Colors.semantic.success + '55',
    borderRadius: Radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  osOkText: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '700' },
});
