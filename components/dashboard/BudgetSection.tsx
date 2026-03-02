import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { ProgressBar } from '../ui/ProgressBar';
import { Card } from '../ui/Card';
import { CATEGORIES } from '../../constants/categories';
import type { Budget } from '../../types';

function formatCurrency(value: number): string {
  return `€${value.toFixed(0)}`;
}

function getBudgetStatus(progress: number): { label: string; color: string } {
  if (progress >= 0.9) return { label: 'Superato', color: Colors.semantic.danger };
  if (progress >= 0.7) return { label: 'Attenzione', color: Colors.semantic.warning };
  return { label: 'OK', color: Colors.semantic.success };
}

interface BudgetItemProps {
  budget: Budget;
}

function BudgetItem({ budget }: BudgetItemProps) {
  const category = CATEGORIES[budget.category];
  const progress = budget.spent / budget.limit;
  const { label, color } = getBudgetStatus(progress);
  const percent = Math.round(progress * 100);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/budget/${budget.id}`)}
      activeOpacity={0.7}
    >
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={styles.left}>
          <View style={[styles.iconBg, { backgroundColor: category.bgColor }]}>
            <Ionicons name={category.icon as any} size={14} color={category.color} />
          </View>
          <Text style={styles.categoryName}>{category.label}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.percentText, { color }]}>{percent}%</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${color}20` }]}>
            <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          </View>
        </View>
      </View>

      <ProgressBar progress={progress} style={styles.progress} />

      <View style={styles.amountRow}>
        <Text style={styles.spent}>{formatCurrency(budget.spent)} spesi</Text>
        <Text style={styles.limit}>di {formatCurrency(budget.limit)}</Text>
      </View>
    </View>
    </TouchableOpacity>
  );
}

interface BudgetSectionProps {
  budgets: Budget[];
}

export function BudgetSection({ budgets }: BudgetSectionProps) {
  const sorted = [...budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit);

  return (
    <Card>
      <Text style={styles.sectionTitle}>Budget Mensili</Text>
      {sorted.map((budget, i) => (
        <View key={budget.id}>
          <BudgetItem budget={budget} />
          {i < sorted.length - 1 && <View style={styles.separator} />}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 16,
  },
  item: {
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percentText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusLabel: {
    ...Typography.micro,
    fontWeight: '600',
  },
  progress: {
    marginVertical: 4,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spent: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  limit: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: 12,
  },
});
