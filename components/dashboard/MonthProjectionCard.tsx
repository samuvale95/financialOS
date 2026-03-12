import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { Transaction, StoredBudget } from '../../types';

interface MonthProjectionCardProps {
  transactions: Transaction[];
  budgets: StoredBudget[];
}

export default function MonthProjectionCard({ transactions, budgets }: MonthProjectionCardProps) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const progressPercent = (dayOfMonth / daysInMonth) * 100;

  const currentMonth = today.toISOString().slice(0, 7);
  const monthTxs = transactions.filter(
    (t) => t.date.startsWith(currentMonth) && t.amount < 0 && t.category !== 'transfer',
  );
  const spentSoFar = monthTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Need at least 3 days of data for a meaningful projection
  const hasEnoughData = dayOfMonth >= 3 && spentSoFar > 0;
  const dailyRate = hasEnoughData ? spentSoFar / dayOfMonth : 0;
  const projectedTotal = hasEnoughData
    ? Math.round(spentSoFar + dailyRate * daysRemaining)
    : 0;

  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
  const delta = projectedTotal - totalBudget;
  const deltaPercent = totalBudget > 0 ? Math.abs(delta / totalBudget) * 100 : 0;

  const isOver = delta > 0;
  const accentColor = isOver ? Colors.semantic.danger : Colors.semantic.success;
  const statusText = isOver
    ? `+€${Math.round(delta).toLocaleString('it-IT')} sopra budget (${deltaPercent.toFixed(0)}%)`
    : `€${Math.round(Math.abs(delta)).toLocaleString('it-IT')} sotto budget`;

  const fmt = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`;

  // If not enough data, show a placeholder
  if (!hasEnoughData) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Proiezione Fine Mese</Text>
          <Text style={styles.daysChip}>{daysRemaining}g rimasti</Text>
        </View>
        <Text style={styles.noDataText}>
          Dati insufficienti — la proiezione sarà disponibile dopo il 3° giorno del mese.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Proiezione Fine Mese</Text>
        <View style={styles.daysChipWrap}>
          <Text style={styles.daysChip}>{daysRemaining}g rimasti</Text>
        </View>
      </View>

      {/* Month progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progressPercent)}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progressPercent)}% del mese trascorso</Text>
      </View>

      {/* Amounts */}
      <View style={styles.amounts}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Speso finora</Text>
          <Text style={styles.amountValue}>{fmt(spentSoFar)}</Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Proiezione totale</Text>
          <Text style={[styles.amountValue, styles.projectedValue, { color: accentColor }]}>
            {fmt(projectedTotal)}
          </Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Budget mensile</Text>
          <Text style={styles.amountValue}>{fmt(totalBudget)}</Text>
        </View>
      </View>

      {/* Status banner */}
      {totalBudget > 0 && (
        <View style={[styles.statusBanner, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}>
          <Text style={[styles.statusText, { color: accentColor }]}>{statusText}</Text>
        </View>
      )}

      {/* Hint */}
      <Text style={styles.hint}>
        Media giornaliera: {fmt(dailyRate)}/giorno
      </Text>
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
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  daysChipWrap: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  daysChip: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  progressWrap: {
    gap: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.full,
  },
  progressLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  amounts: {
    gap: 0,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
  },
  amountLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  amountValue: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  projectedValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusBanner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  statusText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  hint: {
    ...Typography.micro,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  noDataText: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
