import React, { useMemo, useState } from 'react';
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
import { DayGroup } from '../../components/spese/DayGroup';
import { useData } from '../../contexts/DataContext';
import { CATEGORIES } from '../../constants/categories';
import type { Transaction } from '../../types';
import type { CategoryId } from '../../constants/categories';
import { Button } from '../../components/ui/Button';

function getAvailableMonths(transactions: Transaction[]): string[] {
  const months = new Set<string>();
  for (const t of transactions) months.add(t.date.slice(0, 7));
  return Array.from(months).sort();
}

function formatMonthLabel(ym: string): string {
  return new Date(ym + '-15').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  return transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const date = t.date.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {});
}

type Filter = 'all' | 'expense' | 'income';
type SortMode = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
type ActiveTab = 'list' | 'categories';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tutte' },
  { key: 'expense', label: 'Uscite' },
  { key: 'income', label: 'Entrate' },
];

const SORT_MODES: { key: SortMode; label: string; icon: string }[] = [
  { key: 'date_desc', label: 'Data ↓', icon: 'calendar' },
  { key: 'date_asc', label: 'Data ↑', icon: 'calendar-outline' },
  { key: 'amount_desc', label: 'Importo ↓', icon: 'trending-down' },
  { key: 'amount_asc', label: 'Importo ↑', icon: 'trending-up' },
];

// ── Category Breakdown component ──────────────────────────────────────────────

function CategoryBreakdown({ transactions, selectedMonth }: { transactions: Transaction[]; selectedMonth: string }) {
  const monthExpenses = transactions.filter(
    (t) => t.amount < 0 && t.date.startsWith(selectedMonth)
  );
  const totalOut = monthExpenses.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, { total: number; count: number }>();
    for (const t of monthExpenses) {
      const cat = t.category as CategoryId;
      const existing = map.get(cat) ?? { total: 0, count: 0 };
      map.set(cat, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 });
    }
    return Array.from(map.entries())
      .map(([cat, { total, count }]) => ({ cat, total, count }))
      .sort((a, b) => b.total - a.total);
  }, [monthExpenses]);

  if (byCategory.length === 0) {
    return (
      <View style={cb.empty}>
        <Ionicons name="pie-chart-outline" size={40} color={Colors.text.muted} />
        <Text style={cb.emptyText}>Nessuna uscita questo mese</Text>
      </View>
    );
  }

  return (
    <View style={cb.container}>
      {/* Totale header */}
      <View style={cb.totalCard}>
        <Text style={cb.totalLabel}>Totale uscite questo mese</Text>
        <Text style={cb.totalAmount}>€{totalOut.toFixed(0)}</Text>
        <Text style={cb.totalSub}>{byCategory.length} categorie attive</Text>
      </View>

      {/* Category rows */}
      <View style={cb.list}>
        {byCategory.map(({ cat, total, count }) => {
          const catInfo = CATEGORIES[cat];
          const pct = totalOut > 0 ? (total / totalOut) * 100 : 0;
          return (
            <View key={cat} style={cb.row}>
              <View style={[cb.icon, { backgroundColor: catInfo?.bgColor ?? Colors.bg.elevated }]}>
                <Ionicons
                  name={(catInfo?.icon ?? 'help-circle') as any}
                  size={16}
                  color={catInfo?.color ?? Colors.text.muted}
                />
              </View>
              <View style={cb.info}>
                <View style={cb.infoTop}>
                  <Text style={cb.catLabel} numberOfLines={1}>
                    {catInfo?.label ?? cat}
                  </Text>
                  <Text style={cb.catAmount}>€{total.toFixed(0)}</Text>
                </View>
                <View style={cb.barRow}>
                  <View style={cb.barBg}>
                    <View
                      style={[
                        cb.barFill,
                        {
                          width: `${Math.min(100, pct)}%` as any,
                          backgroundColor: catInfo?.color ?? Colors.accent.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={cb.txCount}>{count} tx</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SpeseScreen() {
  const { transactions } = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [activeTab, setActiveTab] = useState<ActiveTab>('list');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => new Date().toISOString().slice(0, 7)
  );

  const availableMonths = useMemo(() => getAvailableMonths(transactions), [transactions]);

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date.startsWith(selectedMonth)),
    [transactions, selectedMonth]
  );

  const unclassifiedCount = useMemo(
    () => monthTransactions.filter((t) => t.category === 'other' && t.amount < 0).length,
    [monthTransactions]
  );

  const goToPrevMonth = () => {
    const idx = availableMonths.indexOf(selectedMonth);
    if (idx > 0) setSelectedMonth(availableMonths[idx - 1]);
  };
  const goToNextMonth = () => {
    const idx = availableMonths.indexOf(selectedMonth);
    if (idx < availableMonths.length - 1) setSelectedMonth(availableMonths[idx + 1]);
  };

  const prevMonthDisabled = availableMonths.indexOf(selectedMonth) <= 0;
  const nextMonthDisabled = availableMonths.indexOf(selectedMonth) >= availableMonths.length - 1;

  // Expense categories that appear in month transactions
  const expenseCategories = useMemo(() => {
    const cats = new Set<CategoryId>();
    for (const t of monthTransactions) {
      if (t.amount < 0) cats.add(t.category as CategoryId);
    }
    return Array.from(cats).map((c) => CATEGORIES[c]).filter(Boolean);
  }, [monthTransactions]);

  const filtered = useMemo(() => {
    let result = monthTransactions.filter((t) => {
      if (filter === 'expense') return t.amount < 0;
      if (filter === 'income') return t.amount >= 0;
      return true;
    });
    if (categoryFilter && filter === 'expense') {
      result = result.filter((t) => t.category === categoryFilter);
    }
    return result;
  }, [filter, categoryFilter, monthTransactions]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'date_desc': return a.date < b.date ? 1 : -1;
        case 'date_asc': return a.date > b.date ? 1 : -1;
        case 'amount_desc': return Math.abs(a.amount) < Math.abs(b.amount) ? 1 : -1;
        case 'amount_asc': return Math.abs(a.amount) > Math.abs(b.amount) ? 1 : -1;
      }
    });
  }, [filtered, sortMode]);

  const grouped = useMemo(() => groupByDate(sorted), [sorted]);
  const dates = Object.keys(grouped).sort((a, b) => {
    if (sortMode === 'date_asc') return a > b ? 1 : -1;
    return a < b ? 1 : -1;
  });

  const totalExpenses = monthTransactions.filter((t) => t.amount < 0 && t.category !== 'transfer').reduce(
    (s, t) => s + Math.abs(t.amount), 0
  );
  const totalIncome = monthTransactions.filter((t) => t.amount > 0 && t.category !== 'transfer').reduce(
    (s, t) => s + t.amount, 0
  );

  const currentSortIcon = SORT_MODES.find((s) => s.key === sortMode)?.icon ?? 'funnel';

  const cycleSortMode = () => {
    const idx = SORT_MODES.findIndex((s) => s.key === sortMode);
    setSortMode(SORT_MODES[(idx + 1) % SORT_MODES.length].key);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Transazioni</Text>
        <TouchableOpacity style={styles.searchBtn} activeOpacity={0.7}>
          <Ionicons name="search" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Month Navigator */}
      {availableMonths.length > 0 && (
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={[styles.monthArrow, prevMonthDisabled && { opacity: 0.3 }]}
            onPress={goToPrevMonth}
            disabled={prevMonthDisabled}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{formatMonthLabel(selectedMonth)}</Text>
          <TouchableOpacity
            style={[styles.monthArrow, nextMonthDisabled && { opacity: 0.3 }]}
            onPress={goToNextMonth}
            disabled={nextMonthDisabled}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Unclassified banner */}
      {unclassifiedCount > 0 && (
        <TouchableOpacity
          style={styles.unclassifiedBanner}
          activeOpacity={0.8}
          onPress={() => {
            setFilter('expense');
            setCategoryFilter('other' as CategoryId);
            setActiveTab('list');
          }}
        >
          <Ionicons name="help-circle" size={16} color={Colors.semantic.warning} />
          <Text style={styles.unclassifiedText}>
            {unclassifiedCount} {unclassifiedCount === 1 ? 'spesa' : 'spese'} da classificare · Aiuta l'AI a imparare
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.semantic.warning} />
        </TouchableOpacity>
      )}

      {/* Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Entrate</Text>
          <Text style={[styles.summaryValue, { color: Colors.semantic.success }]}>
            +€{totalIncome.toFixed(0)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Uscite</Text>
          <Text style={[styles.summaryValue, { color: Colors.semantic.danger }]}>
            -€{totalExpenses.toFixed(0)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Totale</Text>
          <Text style={styles.summaryValue}>{monthTransactions.length}</Text>
        </View>
      </View>

      {/* Tab selector */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          onPress={() => setActiveTab('list')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="list"
            size={15}
            color={activeTab === 'list' ? '#fff' : Colors.text.secondary}
          />
          <Text style={[styles.tabLabel, activeTab === 'list' && styles.tabLabelActive]}>
            Lista
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'categories' && styles.tabBtnActive]}
          onPress={() => setActiveTab('categories')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="pie-chart"
            size={15}
            color={activeTab === 'categories' ? '#fff' : Colors.text.secondary}
          />
          <Text style={[styles.tabLabel, activeTab === 'categories' && styles.tabLabelActive]}>
            Categorie
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' && (
        <>
          {/* Filters + sort */}
          <View style={styles.filtersRow}>
            <View style={styles.filters}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => {
                    setFilter(f.key);
                    if (f.key !== 'expense') setCategoryFilter(null);
                  }}
                  style={[
                    styles.filterBtn,
                    filter === f.key && styles.filterBtnActive,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      filter === f.key && styles.filterLabelActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode !== 'date_desc' && styles.sortBtnActive]}
              onPress={cycleSortMode}
              activeOpacity={0.7}
            >
              <Ionicons
                name={currentSortIcon as any}
                size={16}
                color={sortMode !== 'date_desc' ? Colors.accent.primary : Colors.text.secondary}
              />
            </TouchableOpacity>
          </View>

          {/* Category chip filter (only for expenses) */}
          {filter === 'expense' && expenseCategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.catFilterScroll}
              contentContainerStyle={styles.catFilterContent}
            >
              <TouchableOpacity
                style={[styles.catChip, !categoryFilter && styles.catChipActive]}
                onPress={() => setCategoryFilter(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.catChipLabel, !categoryFilter && styles.catChipLabelActive]}>
                  Tutte
                </Text>
              </TouchableOpacity>
              {expenseCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catChip,
                    categoryFilter === cat.id && {
                      backgroundColor: cat.bgColor,
                      borderColor: cat.color,
                    },
                  ]}
                  onPress={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id as CategoryId)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={12}
                    color={categoryFilter === cat.id ? cat.color : Colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.catChipLabel,
                      categoryFilter === cat.id && { color: cat.color, fontWeight: '600' },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'categories' ? (
          <CategoryBreakdown transactions={monthTransactions} selectedMonth={selectedMonth} />
        ) : monthTransactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={48} color={Colors.text.muted} />
            <Text style={styles.emptyTitle}>Nessuna transazione</Text>
            <Text style={styles.emptyBody}>
              Importa il tuo estratto conto o aggiungi una transazione manualmente.
            </Text>
            <Button
              label="Importa Dati"
              onPress={() => router.push('/(tabs)/importa')}
              fullWidth
            />
            <Button
              label="Aggiungi Manualmente"
              onPress={() => router.push('/add-transaction')}
              fullWidth
              variant="ghost"
            />
          </View>
        ) : sorted.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="filter-outline" size={40} color={Colors.text.muted} />
            <Text style={styles.emptyTitle}>Nessun risultato</Text>
            <Text style={styles.emptyBody}>Prova a cambiare i filtri applicati.</Text>
          </View>
        ) : (
          dates.map((date) => (
            <DayGroup
              key={date}
              date={date}
              transactions={grouped[date]}
              onTransactionPress={(t: Transaction) => router.push(`/transaction/${t.id}`)}
            />
          ))
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    ...Typography.h1,
    color: Colors.text.primary,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  summaryValue: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border.default,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  tabBtnActive: {
    backgroundColor: Colors.accent.primary,
  },
  tabLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  filterBtnActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  filterLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  filterLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  sortBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortBtnActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.glow,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 12,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthLabel: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  unclassifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.semantic.warning + '15',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.semantic.warning + '40',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unclassifiedText: {
    ...Typography.caption,
    color: Colors.semantic.warning,
    fontWeight: '600',
    flex: 1,
  },
  catFilterScroll: {
    marginBottom: 8,
    flexGrow: 0,
    height: 36,
  },
  catFilterContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  catChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  catChipLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  catChipLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  emptyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 32,
    marginTop: 8,
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
    marginBottom: 4,
  },
});

// Category breakdown styles
const cb = StyleSheet.create({
  container: { gap: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  emptyText: { ...Typography.body, color: Colors.text.muted },
  totalCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  totalLabel: { ...Typography.caption, color: Colors.text.secondary },
  totalAmount: { ...Typography.h1, color: Colors.semantic.danger, fontWeight: '800' },
  totalSub: { ...Typography.micro, color: Colors.text.muted },
  list: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 6 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catLabel: { ...Typography.caption, color: Colors.text.primary, fontWeight: '600', flex: 1 },
  catAmount: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barBg: { flex: 1, height: 4, backgroundColor: Colors.border.default, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  txCount: { ...Typography.micro, color: Colors.text.muted, width: 30, textAlign: 'right' },
});
