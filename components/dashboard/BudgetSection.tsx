import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius } from '../../constants/theme';
import { CATEGORIES } from '../../constants/categories';
import type { Budget } from '../../types';

function statusColor(progress: number): string {
  if (progress >= 1) return Colors.semantic.danger;
  if (progress >= 0.7) return Colors.semantic.warning;
  return Colors.semantic.success;
}

function fmt(n: number): string {
  return `€${Math.round(n).toLocaleString('it-IT')}`;
}

interface BudgetSectionProps {
  budgets: Budget[];
}

export function BudgetSection({ budgets }: BudgetSectionProps) {
  if (budgets.length === 0) return null;

  const sorted = [...budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const overCount = sorted.filter((b) => b.spent >= b.limit).length;
  const warnCount = sorted.filter((b) => b.spent / b.limit >= 0.7 && b.spent < b.limit).length;

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Budget Mensili</Text>
          {overCount > 0 && (
            <View style={styles.alertPill}>
              <Text style={styles.alertPillText}>{overCount} sforat{overCount === 1 ? 'o' : 'i'}</Text>
            </View>
          )}
          {overCount === 0 && warnCount > 0 && (
            <View style={[styles.alertPill, styles.warnPill]}>
              <Text style={[styles.alertPillText, styles.warnPillText]}>{warnCount} in attenzione</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/monthly-report' as any)}
        >
          <Text style={styles.viewAll}>Vedi report →</Text>
        </TouchableOpacity>
      </View>

      {/* Budget list */}
      <View style={styles.list}>
        {sorted.map((budget, idx) => {
          const cat = CATEGORIES[budget.category];
          const progress = budget.limit > 0 ? budget.spent / budget.limit : 0;
          const color = statusColor(progress);
          const isOver = progress >= 1;
          const pct = Math.min(1, progress);

          return (
            <TouchableOpacity
              key={budget.id}
              style={[styles.row, idx === sorted.length - 1 && styles.rowLast]}
              activeOpacity={0.7}
              onPress={() => router.push(`/budget/${budget.id}`)}
            >
              {/* Icon */}
              <View style={[styles.icon, { backgroundColor: cat.bgColor }]}>
                <Ionicons name={cat.icon as any} size={14} color={cat.color} />
              </View>

              {/* Name + bar */}
              <View style={styles.body}>
                <View style={styles.bodyTop}>
                  <Text style={styles.catName} numberOfLines={1}>{cat.label}</Text>
                  <Text style={[styles.spent, isOver && { color: Colors.semantic.danger }]}>
                    {fmt(budget.spent)}
                    <Text style={styles.limit}> / {fmt(budget.limit)}</Text>
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color },
                    ]}
                  />
                </View>
              </View>

              {/* Status dot + chevron */}
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Ionicons name="chevron-forward" size={13} color={Colors.text.muted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...Typography.h3, color: Colors.text.primary },
  alertPill: {
    backgroundColor: Colors.semantic.danger + '20',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  alertPillText: { ...Typography.micro, color: Colors.semantic.danger, fontWeight: '700' },
  warnPill: { backgroundColor: Colors.semantic.warning + '20' },
  warnPillText: { color: Colors.semantic.warning },
  viewAll: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },

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
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  rowLast: { borderBottomWidth: 0 },

  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { flex: 1, gap: 6 },
  bodyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catName: { ...Typography.caption, color: Colors.text.primary, fontWeight: '600' },
  spent: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  limit: { color: Colors.text.muted, fontWeight: '400' },

  barTrack: {
    height: 4,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },

  dot: { width: 7, height: 7, borderRadius: 4 },
});
