import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/theme';
import { ProgressBar } from '../ui/ProgressBar';
import { Card } from '../ui/Card';
import type { Goal } from '../../types';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });
}

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const progress = goal.savedAmount / goal.targetAmount;
  const percent = Math.round(progress * 100);
  const remaining = goal.targetAmount - goal.savedAmount;

  return (
    <Card style={StyleSheet.flatten([styles.card, { borderColor: `${goal.color}30` }])}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{goal.emoji}</Text>
        <View style={styles.info}>
          <Text style={styles.title}>{goal.title}</Text>
          <Text style={styles.date}>Entro {formatDate(goal.targetDate)}</Text>
        </View>
        <View style={[styles.percentBadge, { backgroundColor: `${goal.color}20` }]}>
          <Text style={[styles.percent, { color: goal.color }]}>{percent}%</Text>
        </View>
      </View>

      <ProgressBar progress={progress} style={styles.bar} />

      <View style={styles.footer}>
        <View>
          <Text style={styles.label}>Risparmiato</Text>
          <Text style={[styles.value, { color: goal.color }]}>
            {formatCurrency(goal.savedAmount)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>Mancano</Text>
          <Text style={styles.value}>{formatCurrency(remaining)}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  emoji: {
    fontSize: 28,
  },
  info: {
    flex: 1,
  },
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  date: {
    ...Typography.caption,
    color: Colors.text.muted,
    marginTop: 2,
  },
  percentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  percent: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  bar: {
    marginBottom: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border.default,
  },
  label: {
    ...Typography.micro,
    color: Colors.text.muted,
    marginBottom: 2,
  },
  value: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
});
