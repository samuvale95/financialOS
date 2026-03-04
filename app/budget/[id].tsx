import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import { CATEGORIES } from '../../constants/categories';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useData } from '../../contexts/DataContext';
import { BUDGET_CATEGORY_DESCRIPTIONS } from '../../utils/budgetCalculator';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}€${Math.abs(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
  });
}

export default function BudgetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, budgets } = useData();
  const [descExpanded, setDescExpanded] = useState(true);

  const budget = budgets.find((b) => b.id === id);

  const categoryTransactions = useMemo(() => {
    if (!budget) return [];
    return transactions.filter(
      (t) => t.category === budget.category && t.amount < 0
    );
  }, [budget, transactions]);

  const stats = useMemo(() => {
    if (categoryTransactions.length === 0) return null;
    const amounts = categoryTransactions.map((t) => Math.abs(t.amount));
    const total = amounts.reduce((s, a) => s + a, 0);
    const avg = total / amounts.length;
    const max = Math.max(...amounts);
    return { count: categoryTransactions.length, avg, max };
  }, [categoryTransactions]);

  if (!budget) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Budget non trovato</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backCta}>
            <Text style={styles.backCtaText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const category = CATEGORIES[budget.category];
  const progress = budget.spent / budget.limit;
  const percent = Math.round(progress * 100);
  const isOver = progress >= 1;
  const statusColor = isOver
    ? Colors.semantic.danger
    : progress >= 0.7
    ? Colors.semantic.warning
    : Colors.semantic.success;
  const statusLabel = isOver ? 'Superato' : progress >= 0.7 ? 'Attenzione' : 'OK';
  const remaining = budget.limit - budget.spent;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Budget</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: category.bgColor }]}>
            <Ionicons name={category.icon as any} size={28} color={category.color} />
          </View>
          <Text style={styles.heroCategory}>{category.label}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Progress Card */}
        <View style={styles.card}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressPct, { color: statusColor }]}>
              {percent}%
            </Text>
            <Text style={styles.progressSub}>
              {isOver
                ? `Superato di €${(budget.spent - budget.limit).toFixed(0)}`
                : `Rimangono €${remaining.toFixed(0)}`}
            </Text>
          </View>
          <ProgressBar progress={progress} style={styles.progressBar} />
          <View style={styles.amountRow}>
            <View style={styles.amountCol}>
              <Text style={styles.amountLabel}>Speso</Text>
              <Text style={[styles.amountVal, { color: statusColor }]}>
                €{budget.spent.toFixed(0)}
              </Text>
            </View>
            <View style={[styles.amountCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.amountLabel}>Limite</Text>
              <Text style={styles.amountVal}>€{budget.limit.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {BUDGET_CATEGORY_DESCRIPTIONS[budget.category] && (
          <TouchableOpacity
            style={styles.descCard}
            activeOpacity={0.7}
            onPress={() => setDescExpanded((v) => !v)}
          >
            <View style={styles.descHeader}>
              <View style={[styles.descIconWrap, { backgroundColor: category.bgColor }]}>
                <Ionicons name="information-circle" size={18} color={category.color} />
              </View>
              <Text style={styles.descTitle}>A cosa si riferisce</Text>
              <Ionicons
                name={descExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.text.muted}
              />
            </View>
            {descExpanded && (
              <Text style={styles.descBody}>
                {BUDGET_CATEGORY_DESCRIPTIONS[budget.category]}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.count}</Text>
              <Text style={styles.statLabel}>Transazioni</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>€{stats.avg.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Media</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>€{stats.max.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Massimo</Text>
            </View>
          </View>
        )}

        {/* Transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transazioni ({categoryTransactions.length})</Text>
          {categoryTransactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessuna transazione in questa categoria</Text>
            </View>
          ) : (
            <View style={styles.txCard}>
              {categoryTransactions.map((t, i) => (
                <View key={t.id}>
                  <TouchableOpacity
                    style={styles.txRow}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/transaction/${t.id}`)}
                  >
                    <View style={styles.txInfo}>
                      <Text style={styles.txDesc} numberOfLines={1}>
                        {t.description}
                      </Text>
                      <Text style={styles.txDate}>{formatDate(t.date)}</Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, { color: Colors.semantic.danger }]}>
                        {formatAmount(t.amount)}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.text.muted} />
                    </View>
                  </TouchableOpacity>
                  {i < categoryTransactions.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { ...Typography.body, color: Colors.text.secondary },
  backCta: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  backCtaText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { ...Typography.h3, color: Colors.text.primary },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCategory: { ...Typography.h2, color: Colors.text.primary },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  statusLabel: { ...Typography.caption, fontWeight: '600' },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: { fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  progressSub: { ...Typography.caption, color: Colors.text.muted },
  progressBar: { marginVertical: 4 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountCol: { gap: 2 },
  amountLabel: { ...Typography.caption, color: Colors.text.muted },
  amountVal: { ...Typography.h3, color: Colors.text.primary, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { ...Typography.h3, color: Colors.text.primary, fontWeight: '700' },
  statLabel: { ...Typography.caption, color: Colors.text.muted },
  section: { gap: 10 },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary },
  emptyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { ...Typography.body, color: Colors.text.muted },
  txCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { ...Typography.bodyMedium, color: Colors.text.primary },
  txDate: { ...Typography.caption, color: Colors.text.muted },
  txRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  txAmount: { ...Typography.bodyMedium, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginHorizontal: 16 },
  descCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 10,
  },
  descHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  descIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  descTitle: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
    flex: 1,
  },
  descBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
});
