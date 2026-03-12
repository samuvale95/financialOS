import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../constants/theme';

const MONTH_ABBR = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function abbrevMonth(monthKey: string): string {
  const m = parseInt(monthKey.split('-')[1], 10) - 1;
  return MONTH_ABBR[m] ?? '';
}

export interface MonthlyTrend {
  month: string;
  amount: number;
}

interface CategoryTrendSparklineProps {
  trend: MonthlyTrend[];
  accentColor?: string;
}

const BAR_AREA_H = 40;

export default function CategoryTrendSparkline({ trend, accentColor }: CategoryTrendSparklineProps) {
  const hasData = trend.some((t) => t.amount > 0);
  if (!hasData) return null;

  const color = accentColor ?? Colors.accent.primary;
  const maxAmount = Math.max(...trend.map((t) => t.amount), 1);

  const lastAmount = trend[trend.length - 1]?.amount ?? 0;
  const prevAmount = trend[trend.length - 2]?.amount ?? 0;
  const delta = lastAmount - prevAmount;
  const deltaPercent = prevAmount > 0 ? (delta / prevAmount) * 100 : 0;
  const showDelta = prevAmount > 0 && Math.abs(deltaPercent) > 5;

  return (
    <View style={styles.container}>
      <View style={styles.barsWrapper}>
        {trend.map((t, i) => {
          const isLast = i === trend.length - 1;
          const barHeight = t.amount > 0 ? Math.max(3, (t.amount / maxAmount) * BAR_AREA_H) : 0;
          return (
            <View key={t.month} style={styles.barColumn}>
              <View style={styles.barArea}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: isLast ? color : color + '40',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.monthLabel, isLast && { color, fontWeight: '700' }]}>
                {abbrevMonth(t.month)}
              </Text>
            </View>
          );
        })}
      </View>

      {showDelta && (
        <Text
          style={[
            styles.deltaText,
            { color: delta > 0 ? Colors.semantic.danger : Colors.semantic.success },
          ]}
        >
          {delta > 0 ? '+' : ''}{deltaPercent.toFixed(0)}% vs mese scorso
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  barsWrapper: {
    flexDirection: 'row',
    height: BAR_AREA_H + 16,
    gap: 3,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '75%',
    borderRadius: 2,
  },
  monthLabel: {
    fontSize: 9,
    color: Colors.text.muted,
    marginTop: 3,
  },
  deltaText: {
    ...Typography.micro,
    fontWeight: '600',
    textAlign: 'center',
  },
});
