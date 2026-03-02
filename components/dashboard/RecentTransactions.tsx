import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import { CATEGORIES } from '../../constants/categories';
import { Card } from '../ui/Card';
import type { Transaction } from '../../types';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}€${Math.abs(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

interface TransactionRowProps {
  transaction: Transaction;
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const category = CATEGORIES[transaction.category];
  const isPositive = transaction.amount >= 0;

  return (
    <View style={styles.row}>
      <View style={[styles.iconBg, { backgroundColor: category.bgColor }]}>
        <Ionicons name={category.icon as any} size={16} color={category.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description}
        </Text>
        <Text style={styles.date}>{formatDate(transaction.date)}</Text>
      </View>
      <Text style={[styles.amount, { color: isPositive ? Colors.semantic.success : Colors.text.primary }]}>
        {formatAmount(transaction.amount)}
      </Text>
    </View>
  );
}

interface RecentTransactionsProps {
  transactions: Transaction[];
  onSeeAll?: () => void;
}

export function RecentTransactions({ transactions, onSeeAll }: RecentTransactionsProps) {
  const recent = transactions.slice(0, 5);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Transazioni Recenti</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7}>
            <Text style={styles.seeAll}>Vedi tutte</Text>
          </TouchableOpacity>
        )}
      </View>

      {recent.map((t, i) => (
        <View key={t.id}>
          <TransactionRow transaction={t} />
          {i < recent.length - 1 && <View style={styles.separator} />}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  seeAll: {
    ...Typography.caption,
    color: Colors.text.accent,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  description: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  date: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  amount: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: 10,
  },
});
