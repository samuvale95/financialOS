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
import type { Transaction } from '../../types';
import { Button } from '../../components/ui/Button';

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  return transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const date = t.date.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {});
}

type Filter = 'all' | 'expense' | 'income';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tutte' },
  { key: 'expense', label: 'Uscite' },
  { key: 'income', label: 'Entrate' },
];

export default function SpeseScreen() {
  const { transactions } = useData();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filter === 'expense') return t.amount < 0;
      if (filter === 'income') return t.amount >= 0;
      return true;
    });
  }, [filter, transactions]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const totalExpenses = transactions.filter((t) => t.amount < 0).reduce(
    (s, t) => s + Math.abs(t.amount),
    0
  );
  const totalIncome = transactions.filter((t) => t.amount > 0).reduce(
    (s, t) => s + t.amount,
    0
  );

  const handleTransactionPress = (t: Transaction) => {
    router.push(`/transaction/${t.id}`);
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
          <Text style={styles.summaryLabel}>Transazioni</Text>
          <Text style={styles.summaryValue}>{transactions.length}</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
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

      {/* List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {transactions.length === 0 ? (
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
        ) : (
          dates.map((date) => (
            <DayGroup
              key={date}
              date={date}
              transactions={grouped[date]}
              onTransactionPress={handleTransactionPress}
            />
          ))
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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
    marginBottom: 16,
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
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 16,
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
