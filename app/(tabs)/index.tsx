import React from 'react';
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
import { useData } from '../../contexts/DataContext';
import { useSettings } from '../../contexts/SettingsContext';

export default function DashboardScreen() {
  const { transactions, budgets, goals, subscriptions, monthSummary, isLoading } = useData();
  const { settings } = useSettings();

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
          <>
            <NetWorthCard summary={monthSummary} />
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
            {settings.features.goals && goals.length > 0 && <GoalCard goal={goals[0]} />}
            {settings.features.budgets && <BudgetSection budgets={budgets} />}
            <RecentTransactions
              transactions={transactions}
              onSeeAll={() => router.push('/(tabs)/spese')}
            />
          </>
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
});
