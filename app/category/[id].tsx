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
import { Colors, Typography, Radius } from '../../constants/theme';
import { useData } from '../../contexts/DataContext';
import { CATEGORIES } from '../../constants/categories';
import type { CategoryId } from '../../constants/categories';
import type { Transaction } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Build up to N months of spend data ending at `selectedMonth`
function buildTrend(transactions: Transaction[], category: string, selectedMonth: string, n = 6) {
  const [sy, sm] = selectedMonth.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(sy, sm - 1 - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = transactions
      .filter((t) => t.date.startsWith(key) && t.category === category && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return { month: key, total };
  });
}

function shortMonth(monthKey: string): string {
  return new Date(monthKey + '-01').toLocaleDateString('it-IT', { month: 'short' });
}

// ── Trend Bar Chart ───────────────────────────────────────────────────────────

function TrendChart({
  trend,
  color,
  selectedMonth,
}: {
  trend: { month: string; total: number }[];
  color: string;
  selectedMonth: string;
}) {
  const max = Math.max(...trend.map((t) => t.total), 1);

  return (
    <View style={styles.trendChart}>
      {trend.map(({ month, total }) => {
        const isCurrent = month === selectedMonth;
        const barHeight = Math.max(4, (total / max) * 64);
        return (
          <View key={month} style={styles.trendCol}>
            <View style={styles.trendBarWrap}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: barHeight,
                    backgroundColor: isCurrent ? color : color + '50',
                  },
                ]}
              />
            </View>
            <Text style={[styles.trendLabel, isCurrent && { color: Colors.text.primary, fontWeight: '700' }]}>
              {shortMonth(month)}
            </Text>
            {total > 0 && (
              <Text style={[styles.trendValue, isCurrent && { color }]}>
                €{fmt(total)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Transaction Row ───────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: Transaction }) {
  const isExpense = tx.amount < 0;
  return (
    <TouchableOpacity
      style={styles.txRow}
      activeOpacity={0.7}
      onPress={() => router.push(`/transaction/${tx.id}` as any)}
    >
      <View style={styles.txLeft}>
        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.txDate}>
          {new Date(tx.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: isExpense ? Colors.semantic.danger : Colors.semantic.success }]}>
        {isExpense ? '-' : '+'}€{fmt(tx.amount)}
      </Text>
      <Ionicons name="chevron-forward" size={13} color={Colors.text.muted} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CategoryDetailScreen() {
  const { transactions } = useData();
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const categoryId = params.id as CategoryId;
  const cat = CATEGORIES[categoryId];

  // Determine month
  const selectedMonth = useMemo(() => {
    if (params.month) return params.month;
    const months = [...new Set(
      transactions.filter((t) => t.category === categoryId && t.amount < 0).map((t) => t.date.slice(0, 7))
    )].sort();
    return months.at(-1) ?? new Date().toISOString().slice(0, 7);
  }, [params.month, transactions, categoryId]);

  const prevMonth = getPrevMonth(selectedMonth);

  // This month transactions for this category
  const monthTx = useMemo(
    () =>
      transactions
        .filter((t) => t.date.startsWith(selectedMonth) && t.category === categoryId && t.amount < 0)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, selectedMonth, categoryId],
  );

  const prevMonthTx = useMemo(
    () =>
      transactions
        .filter((t) => t.date.startsWith(prevMonth) && t.category === categoryId && t.amount < 0),
    [transactions, prevMonth, categoryId],
  );

  const monthTotal = monthTx.reduce((s, t) => s + Math.abs(t.amount), 0);
  const prevTotal = prevMonthTx.reduce((s, t) => s + Math.abs(t.amount), 0);
  const diffPct = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : null;

  const trend = useMemo(
    () => buildTrend(transactions, categoryId, selectedMonth, 6),
    [transactions, categoryId, selectedMonth],
  );

  const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  if (!cat) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Categoria</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Colors.text.muted }}>Categoria non trovata</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: cat.bgColor }]}>
            <Ionicons name={cat.icon as any} size={18} color={cat.color} />
          </View>
          <Text style={styles.headerTitle}>{cat.label}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</Text>
          <Text style={[styles.heroAmount, { color: cat.color }]}>€{fmt(monthTotal)}</Text>
          {diffPct !== null && (
            <View style={[
              styles.diffPill,
              { backgroundColor: (diffPct <= 0 ? Colors.semantic.success : Colors.semantic.danger) + '18' },
            ]}>
              <Ionicons
                name={diffPct <= 0 ? 'trending-down' : 'trending-up'}
                size={14}
                color={diffPct <= 0 ? Colors.semantic.success : Colors.semantic.danger}
              />
              <Text style={[
                styles.diffText,
                { color: diffPct <= 0 ? Colors.semantic.success : Colors.semantic.danger },
              ]}>
                {diffPct > 0 ? '+' : ''}{diffPct.toFixed(0)}% vs mese precedente
              </Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{monthTx.length}</Text>
            <Text style={styles.statLabel}>Transazioni</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {monthTx.length > 0 ? `€${fmt(monthTotal / monthTx.length)}` : '—'}
            </Text>
            <Text style={styles.statLabel}>Importo medio</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {prevTotal > 0 ? `€${fmt(prevTotal)}` : '—'}
            </Text>
            <Text style={styles.statLabel}>Mese scorso</Text>
          </View>
        </View>

        {/* Trend chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Andamento 6 mesi</Text>
          <View style={styles.card}>
            <TrendChart trend={trend} color={cat.color} selectedMonth={selectedMonth} />
          </View>
        </View>

        {/* Transaction list */}
        {monthTx.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questo mese</Text>
            <View style={styles.card}>
              {monthTx.map((tx, idx) => (
                <React.Fragment key={tx.id}>
                  <TxRow tx={tx} />
                  {idx < monthTx.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {monthTx.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={36} color={Colors.text.muted} />
            <Text style={styles.emptyText}>Nessuna transazione in {monthLabel}</Text>
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
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bg.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border.default,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.text.primary },

  heroCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  heroLabel: { ...Typography.caption, color: Colors.text.muted, textTransform: 'capitalize' },
  heroAmount: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  diffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  diffText: { ...Typography.caption, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  statLabel: { ...Typography.micro, color: Colors.text.muted },
  statDivider: { width: 1, backgroundColor: Colors.border.default },

  section: { gap: 10 },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },

  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle },

  // Trend chart
  trendChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 4 },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  trendBarWrap: { height: 64, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  trendBar: { width: '70%', borderRadius: 3 },
  trendLabel: { ...Typography.micro, color: Colors.text.muted, textTransform: 'capitalize' },
  trendValue: { ...Typography.micro, color: Colors.text.muted, fontWeight: '600' },

  // Tx row
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txLeft: { flex: 1, gap: 2 },
  txDesc: { ...Typography.caption, color: Colors.text.primary, fontWeight: '500' },
  txDate: { ...Typography.micro, color: Colors.text.muted },
  txAmount: { ...Typography.caption, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText: { ...Typography.caption, color: Colors.text.muted },
});
