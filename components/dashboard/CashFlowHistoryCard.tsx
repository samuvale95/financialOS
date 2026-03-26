import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { MonthlySnapshot } from '../../utils/spendingAnalyzer';

interface Props {
  snapshots: MonthlySnapshot[];
}

function shortMonth(ym: string): string {
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const m = parseInt(ym.split('-')[1], 10) - 1;
  return months[m] ?? '';
}

export function CashFlowHistoryCard({ snapshots }: Props) {
  const withData = snapshots.filter((s) => s.totalExpenses > 0 || s.monthIncome > 0);
  if (withData.length < 2) return null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const maxVal = Math.max(...withData.flatMap((s) => [s.monthIncome, s.totalExpenses]), 1);
  const BAR_H = 52;

  // Avg savings rate across months with data
  const ratesWithData = withData.filter((s) => s.monthIncome > 0);
  const avgRate = ratesWithData.length > 0
    ? ratesWithData.reduce((sum, s) => sum + s.savingsRate, 0) / ratesWithData.length
    : 0;
  const lastRate = withData.at(-1)?.savingsRate ?? 0;
  const rateColor =
    lastRate >= 20 ? Colors.semantic.success :
    lastRate >= 10 ? Colors.semantic.warning :
    Colors.semantic.danger;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Andamento 6 mesi</Text>
          <View style={styles.rateRow}>
            <View style={[styles.rateDot, { backgroundColor: rateColor }]} />
            <Text style={[styles.rateText, { color: rateColor }]}>
              {lastRate.toFixed(0)}% risparmio
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.reportLink}
          activeOpacity={0.7}
          onPress={() => router.push('/monthly-report' as any)}
        >
          <Ionicons name="bar-chart-outline" size={14} color={Colors.accent.primary} />
          <Text style={styles.reportLinkText}>Report →</Text>
        </TouchableOpacity>
      </View>

      {/* Bar chart */}
      <View style={styles.chart}>
        {withData.map((s) => {
          const isCurrent = s.month === currentMonth;
          const incomeH = Math.max(3, (s.monthIncome / maxVal) * BAR_H);
          const expH = Math.max(3, (s.totalExpenses / maxVal) * BAR_H);
          const hasIncome = s.monthIncome > 0;
          const hasExp = s.totalExpenses > 0;

          return (
            <TouchableOpacity
              key={s.month}
              style={styles.col}
              activeOpacity={0.7}
              onPress={() => router.push(`/monthly-report?month=${s.month}` as any)}
            >
              {/* Bars */}
              <View style={[styles.barsWrap, { height: BAR_H }]}>
                {hasIncome && (
                  <View
                    style={[
                      styles.bar,
                      styles.barIncome,
                      {
                        height: incomeH,
                        opacity: isCurrent ? 1 : 0.55,
                      },
                    ]}
                  />
                )}
                {hasExp && (
                  <View
                    style={[
                      styles.bar,
                      styles.barExpense,
                      {
                        height: expH,
                        opacity: isCurrent ? 1 : 0.55,
                      },
                    ]}
                  />
                )}
              </View>

              {/* Month label */}
              <Text style={[styles.monthLabel, isCurrent && styles.monthLabelActive]}>
                {shortMonth(s.month)}
              </Text>

              {/* Savings rate dot */}
              {s.monthIncome > 0 && (
                <View
                  style={[
                    styles.rateMiniDot,
                    {
                      backgroundColor:
                        s.savingsRate >= 20 ? Colors.semantic.success :
                        s.savingsRate >= 10 ? Colors.semantic.warning :
                        Colors.semantic.danger,
                      opacity: isCurrent ? 1 : 0.5,
                    },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.semantic.success }]} />
          <Text style={styles.legendLabel}>Entrate</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.semantic.danger }]} />
          <Text style={styles.legendLabel}>Uscite</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.text.muted, borderRadius: 4 }]} />
          <Text style={styles.legendLabel}>Risparmio (puntino)</Text>
        </View>
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
    padding: 14,
    gap: 14,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: { gap: 4 },
  title: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rateDot: { width: 7, height: 7, borderRadius: 4 },
  rateText: { ...Typography.micro, fontWeight: '600' },
  reportLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: Colors.accent.primary + '12',
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.accent.primary + '30',
  },
  reportLinkText: { ...Typography.micro, color: Colors.accent.primary, fontWeight: '700' },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    justifyContent: 'center',
  },
  bar: {
    width: 7,
    borderRadius: 3,
  },
  barIncome: { backgroundColor: Colors.semantic.success },
  barExpense: { backgroundColor: Colors.semantic.danger },

  monthLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
    fontWeight: '500',
  },
  monthLabelActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  rateMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  legend: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...Typography.micro, color: Colors.text.muted },
});
