import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Touch } from '../../constants/theme';
import { CATEGORIES } from '../../constants/categories';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useData } from '../../contexts/DataContext';
import { BUDGET_CATEGORY_DESCRIPTIONS } from '../../utils/budgetCalculator';
import type { Budget, Transaction } from '../../types';

function formatAmount(amount: number): string {
  return `-€${Math.abs(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

// ── Single budget page content ────────────────────────────────────────────────

interface BudgetPageProps {
  budget: Budget;
  transactions: Transaction[];
  width: number;
}

function BudgetPage({ budget, transactions, width }: BudgetPageProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  const category = CATEGORIES[budget.category];
  const progress = budget.limit > 0 ? budget.spent / budget.limit : 0;
  const percent = Math.round(progress * 100);
  const isOver = progress >= 1;
  const statusColor = isOver
    ? Colors.semantic.danger
    : progress >= 0.7
    ? Colors.semantic.warning
    : Colors.semantic.success;
  const statusLabel = isOver ? 'Superato' : progress >= 0.7 ? 'Attenzione' : 'OK';
  const remaining = budget.limit - budget.spent;

  const categoryTransactions = useMemo(
    () =>
      transactions
        .filter((t) => t.category === budget.category && t.amount < 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [budget.category, transactions]
  );

  const stats = useMemo(() => {
    if (categoryTransactions.length === 0) return null;
    const amounts = categoryTransactions.map((t) => Math.abs(t.amount));
    const total = amounts.reduce((s, a) => s + a, 0);
    return { count: categoryTransactions.length, avg: total / amounts.length, max: Math.max(...amounts) };
  }, [categoryTransactions]);

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.pageContent, { paddingHorizontal: 16 }]}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
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
          <Text style={[styles.progressPct, { color: statusColor }]}>{percent}%</Text>
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
            <Text style={styles.descBody}>{BUDGET_CATEGORY_DESCRIPTIONS[budget.category]}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Transactions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Transazioni{categoryTransactions.length > 0 ? ` (${categoryTransactions.length})` : ''}
        </Text>
        {categoryTransactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={28} color={Colors.text.muted} />
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
                    <Text style={styles.txDesc} numberOfLines={1}>{t.description}</Text>
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
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BudgetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, budgets } = useData();
  const { width: screenWidth } = useWindowDimensions();

  const sorted = useMemo(
    () => [...budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit),
    [budgets]
  );

  const initialIndex = useMemo(
    () => Math.max(0, sorted.findIndex((b) => b.id === id)),
    [sorted, id]
  );

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const hScrollRef = useRef<ScrollView>(null);

  // Scroll to the initial budget without animation on first render
  useEffect(() => {
    if (initialIndex > 0) {
      requestAnimationFrame(() => {
        hScrollRef.current?.scrollTo({ x: initialIndex * screenWidth, animated: false });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sorted.length === 0) {
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

  const handleHScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (idx !== currentIndex) setCurrentIndex(idx);
  };

  const jumpTo = (i: number) => {
    hScrollRef.current?.scrollTo({ x: i * screenWidth, animated: true });
    setCurrentIndex(i);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            onPress={() => currentIndex > 0 && jumpTo(currentIndex - 1)}
            activeOpacity={0.7}
            disabled={currentIndex === 0}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={currentIndex > 0 ? Colors.text.primary : Colors.text.muted}
            />
          </TouchableOpacity>

          <Text style={styles.navCounter}>
            {currentIndex + 1} / {sorted.length}
          </Text>

          <TouchableOpacity
            style={[styles.navBtn, currentIndex === sorted.length - 1 && styles.navBtnDisabled]}
            onPress={() => currentIndex < sorted.length - 1 && jumpTo(currentIndex + 1)}
            activeOpacity={0.7}
            disabled={currentIndex === sorted.length - 1}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={currentIndex < sorted.length - 1 ? Colors.text.primary : Colors.text.muted}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.iconBtn} />
      </View>

      {/* Dot indicators */}
      {sorted.length > 1 && (
        <View style={styles.dotsRow}>
          {sorted.map((b, i) => {
            const p = b.limit > 0 ? b.spent / b.limit : 0;
            const dotColor =
              p >= 1
                ? Colors.semantic.danger
                : p >= 0.7
                ? Colors.semantic.warning
                : Colors.semantic.success;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => jumpTo(i)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <View
                  style={[
                    styles.dot,
                    i === currentIndex
                      ? [styles.dotActive, { backgroundColor: dotColor }]
                      : styles.dotInactive,
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Horizontal pager */}
      <ScrollView
        ref={hScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleHScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        style={{ flex: 1 }}
      >
        {sorted.map((budget) => (
          <BudgetPage
            key={budget.id}
            budget={budget}
            transactions={transactions}
            width={screenWidth}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    paddingVertical: 10,
  },
  iconBtn: {
    width: Touch.sm,
    height: Touch.sm,
    borderRadius: Touch.sm / 2,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: {
    width: Touch.sm,
    height: Touch.sm,
    borderRadius: Touch.sm / 2,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.35 },
  navCounter: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  dotInactive: { width: 6, backgroundColor: Colors.bg.elevated },

  // Page content
  pageContent: { paddingTop: 4, gap: 16 },

  hero: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCategory: { ...Typography.h2, color: Colors.text.primary },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full },
  statusLabel: { ...Typography.caption, fontWeight: '600' },

  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 12,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
    padding: 32,
    alignItems: 'center',
    gap: 10,
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
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  descIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  descTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600', flex: 1 },
  descBody: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 20 },
});
