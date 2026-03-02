import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../constants/theme';
import { TransactionItem } from './TransactionItem';
import type { Transaction } from '../../types';

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function getDayTotal(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

interface DayGroupProps {
  date: string;
  transactions: Transaction[];
  onTransactionPress?: (t: Transaction) => void;
}

export function DayGroup({ date, transactions, onTransactionPress }: DayGroupProps) {
  const dayTotal = getDayTotal(transactions);
  const isPositive = dayTotal >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{formatDayHeader(date)}</Text>
        <Text
          style={[
            styles.dayTotal,
            { color: isPositive ? Colors.semantic.success : Colors.text.secondary },
          ]}
        >
          {isPositive ? '+' : ''}€{Math.abs(dayTotal).toFixed(2)}
        </Text>
      </View>
      <View style={styles.card}>
        {transactions.map((t, i) => (
          <View key={t.id}>
            <TransactionItem transaction={t} onPress={onTransactionPress} />
            {i < transactions.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  dateLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dayTotal: {
    ...Typography.caption,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginHorizontal: 16,
  },
});
