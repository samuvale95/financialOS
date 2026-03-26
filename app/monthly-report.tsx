import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Radius } from '../constants/theme';
import { useData } from '../contexts/DataContext';
import { analyzeSpending } from '../utils/spendingAnalyzer';
import type { CategoryAnalysis } from '../utils/spendingAnalyzer';
import type { Transaction } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  return new Date(month + '-01').toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });
}

function fmt(n: number): string {
  return Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Header ────────────────────────────────────────────────────────────────────

function ReportHeader({ month }: { month: string }) {
  const label = formatMonth(month);
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.closeBtn}
        activeOpacity={0.7}
        onPress={() => router.back()}
      >
        <Ionicons name="close" size={20} color={Colors.text.secondary} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerLabel}>Report mensile</Text>
        <Text style={styles.headerMonth}>{capitalized}</Text>
      </View>
      <View style={styles.closeBtnPlaceholder} />
    </View>
  );
}

// ── Summary Row ───────────────────────────────────────────────────────────────

interface SummaryCardProps {
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  prevIncome: number;
  prevExpenses: number;
}

function SummaryRow({ income, expenses, savings, savingsRate, prevIncome, prevExpenses }: SummaryCardProps) {
  const incomeVsPrev = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : null;
  const expensesVsPrev = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null;
  const rateColor =
    savingsRate >= 20 ? Colors.semantic.success :
    savingsRate >= 10 ? Colors.semantic.warning :
    Colors.semantic.danger;

  return (
    <View style={styles.summaryRow}>
      {/* Income */}
      <View style={[styles.summaryCard, { borderColor: Colors.semantic.success + '44' }]}>
        <View style={styles.summaryIconRow}>
          <View style={[styles.summaryIcon, { backgroundColor: Colors.semantic.success + '18' }]}>
            <Ionicons name="arrow-down-outline" size={14} color={Colors.semantic.success} />
          </View>
          {incomeVsPrev !== null && (
            <Text style={[styles.summaryDelta, { color: incomeVsPrev >= 0 ? Colors.semantic.success : Colors.semantic.danger }]}>
              {incomeVsPrev >= 0 ? '+' : ''}{incomeVsPrev.toFixed(0)}%
            </Text>
          )}
        </View>
        <Text style={styles.summaryValue}>€{fmt(income)}</Text>
        <Text style={styles.summaryLabel}>Entrate</Text>
      </View>

      {/* Expenses */}
      <View style={[styles.summaryCard, { borderColor: Colors.semantic.danger + '44' }]}>
        <View style={styles.summaryIconRow}>
          <View style={[styles.summaryIcon, { backgroundColor: Colors.semantic.danger + '18' }]}>
            <Ionicons name="arrow-up-outline" size={14} color={Colors.semantic.danger} />
          </View>
          {expensesVsPrev !== null && (
            <Text style={[styles.summaryDelta, { color: expensesVsPrev <= 0 ? Colors.semantic.success : Colors.semantic.danger }]}>
              {expensesVsPrev >= 0 ? '+' : ''}{expensesVsPrev.toFixed(0)}%
            </Text>
          )}
        </View>
        <Text style={styles.summaryValue}>€{fmt(expenses)}</Text>
        <Text style={styles.summaryLabel}>Uscite</Text>
      </View>

      {/* Savings */}
      <View style={[styles.summaryCard, { borderColor: rateColor + '44' }]}>
        <View style={styles.summaryIconRow}>
          <View style={[styles.summaryIcon, { backgroundColor: rateColor + '18' }]}>
            <Ionicons name="save-outline" size={14} color={rateColor} />
          </View>
        </View>
        <Text style={[styles.summaryValue, { color: savings >= 0 ? rateColor : Colors.semantic.danger }]}>
          €{fmt(savings)}
        </Text>
        <Text style={styles.summaryLabel}>{savingsRate.toFixed(0)}% risparmio</Text>
      </View>
    </View>
  );
}

// ── Category Bar Chart ────────────────────────────────────────────────────────

interface CategoryBarProps {
  cat: CategoryAnalysis;
  maxAmount: number;
  totalExpenses: number;
}

function CategoryBar({ cat, maxAmount, totalExpenses }: CategoryBarProps) {
  const barWidth = maxAmount > 0 ? cat.monthTotal / maxAmount : 0;
  const pct = totalExpenses > 0 ? (cat.monthTotal / totalExpenses) * 100 : 0;
  const isOver = cat.status === 'over';
  const isWarning = cat.status === 'warning';
  const barColor = isOver ? Colors.semantic.danger : isWarning ? Colors.semantic.warning : cat.color;

  return (
    <TouchableOpacity
      style={styles.catBarRow}
      activeOpacity={0.7}
      onPress={() => router.push(`/budget/${cat.category}` as any)}
    >
      {/* Icon */}
      <View style={[styles.catIcon, { backgroundColor: cat.bgColor }]}>
        <Ionicons name={cat.icon as any} size={14} color={cat.color} />
      </View>

      {/* Label + Bar */}
      <View style={styles.catBarBody}>
        <View style={styles.catBarLabelRow}>
          <Text style={styles.catBarLabel}>{cat.label}</Text>
          <Text style={styles.catBarPct}>{pct.toFixed(0)}%</Text>
        </View>
        <View style={styles.catBarTrack}>
          <View
            style={[
              styles.catBarFill,
              { width: `${Math.round(barWidth * 100)}%` as any, backgroundColor: barColor },
            ]}
          />
        </View>
      </View>

      {/* Amount */}
      <Text style={[styles.catBarAmount, isOver && { color: Colors.semantic.danger }]}>
        €{fmt(cat.monthTotal)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Budget Grid ───────────────────────────────────────────────────────────────

function BudgetGridItem({ cat }: { cat: CategoryAnalysis }) {
  if (cat.budgetLimit <= 0) return null;
  const pct = Math.min(1, cat.budgetProgress);
  const isOver = cat.status === 'over';
  const isWarn = cat.status === 'warning';
  const color = isOver ? Colors.semantic.danger : isWarn ? Colors.semantic.warning : Colors.semantic.success;

  return (
    <View style={styles.budgetGridItem}>
      <View style={[styles.budgetGridIcon, { backgroundColor: cat.bgColor }]}>
        <Ionicons name={cat.icon as any} size={14} color={cat.color} />
      </View>
      <Text style={styles.budgetGridLabel} numberOfLines={1}>{cat.label}</Text>
      <View style={styles.budgetGridTrack}>
        <View style={[styles.budgetGridFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.budgetGridPct, { color }]}>
        {isOver ? 'Sforato' : `${Math.round(pct * 100)}%`}
      </Text>
    </View>
  );
}

// ── Top Transactions ──────────────────────────────────────────────────────────

function TopTx({ tx }: { tx: Transaction }) {
  const isExpense = tx.amount < 0;
  const cat = tx.category;

  return (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</Text>
      </View>
      <Text style={[styles.txAmount, { color: isExpense ? Colors.semantic.danger : Colors.semantic.success }]}>
        {isExpense ? '-' : '+'}€{fmt(tx.amount)}
      </Text>
    </View>
  );
}

// ── Month Comparison Bar ──────────────────────────────────────────────────────

function ComparisonBar({
  label,
  current,
  previous,
  color,
}: {
  label: string;
  current: number;
  previous: number;
  color: string;
}) {
  const max = Math.max(current, previous, 1);
  const diffPct = previous > 0 ? ((current - previous) / previous) * 100 : null;

  return (
    <View style={styles.compRow}>
      <Text style={styles.compLabel}>{label}</Text>
      <View style={styles.compBars}>
        <View style={styles.compBarWrap}>
          <View style={[styles.compBarFill, { width: `${(current / max) * 100}%` as any, backgroundColor: color }]} />
        </View>
        <View style={[styles.compBarWrap, { opacity: 0.35 }]}>
          <View style={[styles.compBarFill, { width: `${(previous / max) * 100}%` as any, backgroundColor: color }]} />
        </View>
      </View>
      <View style={styles.compAmounts}>
        <Text style={styles.compAmount}>€{fmt(current)}</Text>
        {diffPct !== null && (
          <Text style={[styles.compDelta, { color: diffPct <= 0 ? Colors.semantic.success : Colors.semantic.danger }]}>
            {diffPct > 0 ? '+' : ''}{diffPct.toFixed(0)}%
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MonthlyReportScreen() {
  const { transactions, budgets } = useData();
  const params = useLocalSearchParams<{ month?: string }>();

  // Determine which month to show
  const month = useMemo(() => {
    if (params.month) return params.month;
    // Default: latest month with data
    const months = [...new Set(
      transactions.filter((t) => t.category !== 'transfer').map((t) => t.date.slice(0, 7))
    )].sort();
    return months.at(-1) ?? new Date().toISOString().slice(0, 7);
  }, [params.month, transactions]);

  const prevMonth = getPrevMonth(month);

  const analysis = useMemo(
    () => analyzeSpending(transactions, budgets, month),
    [transactions, budgets, month],
  );

  const prevAnalysis = useMemo(
    () => analyzeSpending(transactions, budgets, prevMonth),
    [transactions, budgets, prevMonth],
  );

  // Expense categories with actual spend, sorted by amount
  const expenseCats = useMemo(
    () =>
      analysis.categories
        .filter((c) => c.monthTotal > 0)
        .sort((a, b) => b.monthTotal - a.monthTotal),
    [analysis.categories],
  );

  const maxCatAmount = expenseCats[0]?.monthTotal ?? 1;

  // Categories with a budget
  const budgetCats = useMemo(
    () => expenseCats.filter((c) => c.budgetLimit > 0),
    [expenseCats],
  );

  // Top 5 expenses by amount
  const topExpenses = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0 && t.date.startsWith(month) && t.category !== 'transfer')
        .sort((a, b) => a.amount - b.amount)
        .slice(0, 5),
    [transactions, month],
  );

  const savings = analysis.monthIncome - analysis.totalExpenses;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ReportHeader month={month} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <SummaryRow
          income={analysis.monthIncome}
          expenses={analysis.totalExpenses}
          savings={savings}
          savingsRate={analysis.savingsRate}
          prevIncome={prevAnalysis.monthIncome}
          prevExpenses={prevAnalysis.totalExpenses}
        />

        {/* Spending by Category */}
        {expenseCats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spese per categoria</Text>
            <View style={styles.card}>
              {expenseCats.map((cat) => (
                <CategoryBar
                  key={cat.category}
                  cat={cat}
                  maxAmount={maxCatAmount}
                  totalExpenses={analysis.totalExpenses}
                />
              ))}
            </View>
          </View>
        )}

        {/* Budget Performance */}
        {budgetCats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stato budget</Text>
            <View style={styles.budgetGrid}>
              {budgetCats.map((cat) => (
                <BudgetGridItem key={cat.category} cat={cat} />
              ))}
            </View>
          </View>
        )}

        {/* Month Comparison */}
        {prevAnalysis.totalExpenses > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Confronto mese precedente</Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: Colors.accent.primary }]} />
                <Text style={styles.legendText}>{formatMonth(month).split(' ')[0]}</Text>
                <View style={[styles.legendDot, { backgroundColor: Colors.accent.primary, opacity: 0.35 }]} />
                <Text style={[styles.legendText, { opacity: 0.5 }]}>{formatMonth(prevMonth).split(' ')[0]}</Text>
              </View>
            </View>
            <View style={styles.card}>
              <ComparisonBar
                label="Entrate"
                current={analysis.monthIncome}
                previous={prevAnalysis.monthIncome}
                color={Colors.semantic.success}
              />
              <View style={styles.divider} />
              <ComparisonBar
                label="Uscite"
                current={analysis.totalExpenses}
                previous={prevAnalysis.totalExpenses}
                color={Colors.semantic.danger}
              />
            </View>
          </View>
        )}

        {/* Top Expenses */}
        {topExpenses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spese maggiori</Text>
            <View style={styles.card}>
              {topExpenses.map((tx, i) => (
                <React.Fragment key={tx.id}>
                  <TopTx tx={tx} />
                  {i < topExpenses.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* Savings Rate pill */}
        {analysis.monthIncome > 0 && (
          <View style={styles.savingsPill}>
            <Ionicons
              name={analysis.savingsRate >= 20 ? 'trending-up' : analysis.savingsRate >= 10 ? 'remove-outline' : 'trending-down'}
              size={16}
              color={
                analysis.savingsRate >= 20 ? Colors.semantic.success :
                analysis.savingsRate >= 10 ? Colors.semantic.warning :
                Colors.semantic.danger
              }
            />
            <Text style={styles.savingsPillText}>
              Tasso di risparmio:{' '}
              <Text style={{
                fontWeight: '700',
                color:
                  analysis.savingsRate >= 20 ? Colors.semantic.success :
                  analysis.savingsRate >= 10 ? Colors.semantic.warning :
                  Colors.semantic.danger,
              }}>
                {analysis.savingsRate.toFixed(1)}%
              </Text>
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 24,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  closeBtnPlaceholder: { width: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { ...Typography.micro, color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  headerMonth: { ...Typography.h3, color: Colors.text.primary, marginTop: 2, textTransform: 'capitalize' },

  // Section
  section: { gap: 10 },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...Typography.micro, color: Colors.text.muted, textTransform: 'capitalize' },

  // Card wrapper
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  summaryIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryDelta: { ...Typography.micro, fontWeight: '700' },
  summaryValue: { ...Typography.h3, color: Colors.text.primary, fontWeight: '700' },
  summaryLabel: { ...Typography.micro, color: Colors.text.muted },

  // Category bars
  catBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  catBarBody: { flex: 1, gap: 4 },
  catBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBarLabel: { ...Typography.caption, color: Colors.text.primary, fontWeight: '500' },
  catBarPct: { ...Typography.micro, color: Colors.text.muted },
  catBarTrack: {
    height: 5,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catBarFill: { height: 5, borderRadius: 3 },
  catBarAmount: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600', minWidth: 52, textAlign: 'right' },

  // Budget grid
  budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  budgetGridItem: {
    width: '47%',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 10,
    gap: 6,
  },
  budgetGridIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  budgetGridLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '500' },
  budgetGridTrack: {
    height: 4, backgroundColor: Colors.bg.elevated, borderRadius: 2, overflow: 'hidden',
  },
  budgetGridFill: { height: 4, borderRadius: 2 },
  budgetGridPct: { ...Typography.micro, fontWeight: '700' },

  // Comparison
  compRow: { gap: 6 },
  compLabel: { ...Typography.caption, color: Colors.text.muted },
  compBars: { gap: 4 },
  compBarWrap: {
    height: 8,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  compBarFill: { height: 8, borderRadius: 4 },
  compAmounts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compAmount: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  compDelta: { ...Typography.micro, fontWeight: '700' },

  // Top tx
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txLeft: { flex: 1, gap: 2 },
  txDesc: { ...Typography.caption, color: Colors.text.primary, fontWeight: '500' },
  txDate: { ...Typography.micro, color: Colors.text.muted },
  txAmount: { ...Typography.caption, fontWeight: '700' },

  // Savings pill
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  savingsPillText: { ...Typography.caption, color: Colors.text.secondary },
});
