import React, { useEffect, useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius } from '../../constants/theme';
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
import { loadOnboardingData } from '../../utils/storage';
import { calculateEstimated730Refund, calculateForfettarioNetto } from '../../utils/taxCalculator';
import type { Transaction, Goal, OnboardingGoalId } from '../../types';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';

function EmergencyFundCard({ goals, monthlyExpenses }: { goals: Goal[]; monthlyExpenses: number }) {
  const goal = goals.find((g) => g.title === 'Fondo di Emergenza');
  if (!goal) return null;

  const progress = goal.targetAmount > 0 ? Math.min(1, goal.savedAmount / goal.targetAmount) : 0;
  const monthsCovered = monthlyExpenses > 0 ? goal.savedAmount / monthlyExpenses : 0;
  const isOk = monthsCovered >= 3;

  return (
    <View style={styles.emergencyCard}>
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
    </View>
  );
}

function FiscoCard({ transactions }: { transactions: Transaction[] }) {
  const { fiscalProfile } = useSettings();
  if (fiscalProfile.type === 'altro') return null;

  if (fiscalProfile.type === 'dipendente') {
    const result = calculateEstimated730Refund(transactions);
    if (result.estimatedRefund <= 0) return null;
    return (
      <View style={styles.fiscoCard}>
        <View style={styles.fiscoHeader}>
          <Ionicons name="receipt" size={18} color={Colors.semantic.success} />
          <Text style={styles.fiscoTitle}>Rimborso 730 stimato</Text>
        </View>
        <Text style={styles.fiscoValue}>€{result.estimatedRefund.toFixed(0)}</Text>
      </View>
    );
  }

  const currentYear = new Date().getFullYear().toString();
  const ytdIncome = transactions
    .filter((t) => t.amount > 0 && t.category !== 'transfer' && t.date.startsWith(currentYear))
    .reduce((s, t) => s + t.amount, 0);
  const result = calculateForfettarioNetto(ytdIncome, fiscalProfile);
  if (result.recommendedSetAside <= 0) return null;

  return (
    <View style={styles.fiscoCard}>
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
    </View>
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

export default function DashboardScreen() {
  const { transactions, budgets, goals, accounts, subscriptions, monthSummary, isLoading } = useData();
  const { settings } = useSettings();
  const [mainGoal, setMainGoal] = useState<OnboardingGoalId | null>(null);
  const [historicalBannerDismissed, setHistoricalBannerDismissed] = useState(false);

  useEffect(() => {
    loadOnboardingData().then((d) => setMainGoal(d.mainGoal ?? null));
  }, []);

  // Detect when all data is from a previous month (same logic as analyzeSpending auto-detect)
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

  const today = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Buongiorno</Text>
            <Text style={styles.date} numberOfLines={1}>
              {today}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <>
            <Skeleton height={160} borderRadius={24} />
            <Skeleton height={100} borderRadius={16} />
            <Skeleton height={220} borderRadius={16} />
          </>
        ) : transactions.length === 0 ? (
          <>
            <NetWorthCard summary={monthSummary} />
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={48} color={Colors.text.muted} />
              <Text style={styles.emptyTitle}>Nessuna transazione</Text>
              <Text style={styles.emptyBody}>
                Importa il tuo estratto conto per vedere le analisi delle tue finanze.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/importa')}
              >
                <Text style={styles.emptyBtnText}>Importa Dati</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <SectionErrorBoundary label="Dashboard non disponibile">
          <>
            <NetWorthCard summary={monthSummary} />
            {historicalMonthInfo && !historicalBannerDismissed && (
              <HistoricalMonthBanner
                month={historicalMonthInfo}
                onDismiss={() => setHistoricalBannerDismissed(true)}
              />
            )}
            <BudgetReconciliationBanner />
            {renderGoalWidget({
              mainGoal,
              goals,
              accounts,
              monthSummary,
            })}
            {/* Show the goal-progress emergency card only when the main goal is NOT emergenza
                (avoid showing two emergency widgets at once) */}
            {mainGoal !== 'emergenza' && (
              <EmergencyFundCard goals={goals} monthlyExpenses={monthSummary.expenses} />
            )}
            <IncomeExpenseRow
              income={monthSummary.income}
              expenses={monthSummary.expenses}
              savingsRate={monthSummary.savingsRate}
            />
            <CashFlowCard
              monthSummary={monthSummary}
              subscriptions={subscriptions}
              transactions={transactions}
            />
            <FiscoCard transactions={transactions} />
            {settings.features.goals && goals.length > 0 && <GoalCard goal={goals[0]} />}
            {settings.features.budgets && <BudgetSection budgets={budgets} />}
            <RecentTransactions
              transactions={transactions}
              onSeeAll={() => router.push('/(tabs)/spese')}
            />
          </>
          </SectionErrorBoundary>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  greeting: {
    ...Typography.h2,
    color: Colors.text.primary,
  },
  date: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  emptyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  emptyBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  emptyBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },
  bottomPad: {
    height: 16,
  },
  emergencyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FFB347' + '66',
    padding: 16,
    gap: 10,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emergencyEmoji: {
    fontSize: 24,
  },
  emergencyTitle: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  emergencyStatus: {
    ...Typography.caption,
    marginTop: 2,
  },
  emergencyAmounts: {
    alignItems: 'flex-end',
  },
  emergencyActual: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  emergencyTarget: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  emergencyBarBg: {
    height: 6,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  emergencyBarFill: {
    height: 6,
    borderRadius: 3,
  },
  fiscoCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '44',
    padding: 16,
    gap: 8,
  },
  fiscoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fiscoTitle: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  fiscoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fiscoLabel: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  fiscoValue: {
    ...Typography.h3,
    color: Colors.text.primary,
    fontWeight: '700',
  },
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
  historicalBannerBold: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
