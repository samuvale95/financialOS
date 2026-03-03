import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { MonthSummary, Subscription, Transaction } from '../../types';

interface Props {
  monthSummary: MonthSummary;
  subscriptions: Subscription[];
  transactions: Transaction[];
}

function toMonthly(s: Subscription): number {
  if (s.frequency === 'monthly') return s.amount;
  if (s.frequency === 'quarterly') return s.amount / 3;
  return s.amount / 12;
}

export function CashFlowCard({ monthSummary, subscriptions }: Props) {
  const now = new Date();
  const today = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const dailyRate = today > 0 ? monthSummary.expenses / today : 0;
  const projectedExpenses = dailyRate * totalDaysInMonth;

  const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const pendingSubs = subscriptions.filter((s) => {
    if (!s.active) return false;
    const due = s.nextDueDate;
    if (!due.startsWith(currentMonthStr)) return false;
    return due >= now.toISOString().split('T')[0];
  });
  const pendingSubsTotal = pendingSubs.reduce((sum, s) => sum + toMonthly(s), 0);

  const forecastBalance = monthSummary.income - projectedExpenses - pendingSubsTotal;
  const isPositive = forecastBalance >= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>PREVISIONE FINE MESE</Text>
      <Text style={[styles.amount, { color: isPositive ? Colors.semantic.success : Colors.semantic.danger }]}>
        {isPositive ? '+' : ''}€{Math.abs(forecastBalance).toFixed(0)}
      </Text>
      <View style={styles.breakdown}>
        <Text style={styles.breakdownText}>
          Spese previste: <Text style={styles.breakdownValue}>€{projectedExpenses.toFixed(0)}</Text>
        </Text>
        {pendingSubs.length > 0 && (
          <Text style={styles.breakdownText}>
            Abbonamenti imminenti:{' '}
            <Text style={styles.breakdownValue}>€{pendingSubsTotal.toFixed(0)}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 4,
  },
  label: {
    ...Typography.micro,
    color: Colors.text.muted,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 4,
  },
  breakdown: {
    marginTop: 8,
    gap: 2,
  },
  breakdownText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  breakdownValue: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
});
