import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { Goal } from '../../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

interface HouseGoalWidgetProps {
  /** Obiettivo casa se già creato (cercato per titolo) */
  goal: Goal | null;
  /** Risparmio mensile corrente, per stimare il tempo mancante */
  monthlySavings: number;
}

export default function HouseGoalWidget({ goal, monthlySavings }: HouseGoalWidgetProps) {
  const ACCENT = '#4FC3F7'; // light-blue for house theme

  if (!goal) {
    return (
      <View style={[styles.card, { borderColor: ACCENT + '40' }]}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Obiettivo Casa</Text>
            <Text style={styles.subtitle}>Nessun obiettivo ancora creato</Text>
          </View>
        </View>
        <Text style={styles.promptText}>
          Crea un obiettivo di risparmio per la casa (acconto, ristrutturazione, acquisto) per tracciare i tuoi progressi qui.
        </Text>
        <View style={styles.tipRow}>
          <Text style={styles.tipText}>💡 Con i tuoi risparmi attuali ({fmt(Math.max(monthlySavings, 0))}/mese) puoi valutare un piano di accumulo.</Text>
        </View>
      </View>
    );
  }

  const progress = goal.targetAmount > 0 ? Math.min(goal.savedAmount / goal.targetAmount, 1) : 0;
  const percent = Math.round(progress * 100);
  const remaining = goal.targetAmount - goal.savedAmount;
  const monthsNeeded = monthlySavings > 0 ? Math.ceil(remaining / monthlySavings) : null;

  return (
    <View style={[styles.card, { borderColor: ACCENT + '40' }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{goal.emoji || '🏠'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{goal.title}</Text>
          <Text style={styles.subtitle}>Entro {formatDate(goal.targetDate)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: ACCENT + '20' }]}>
          <Text style={[styles.badgeText, { color: ACCENT }]}>{percent}%</Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percent}%` as any, backgroundColor: ACCENT }]} />
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.metaLabel}>Risparmiato</Text>
          <Text style={[styles.metaValue, { color: ACCENT }]}>{fmt(goal.savedAmount)}</Text>
        </View>
        <View style={styles.divider} />
        <View>
          <Text style={styles.metaLabel}>Mancano</Text>
          <Text style={styles.metaValue}>{fmt(remaining)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.metaLabel}>Stima</Text>
          <Text style={styles.metaValue}>
            {monthsNeeded !== null ? `${monthsNeeded} mesi` : '—'}
          </Text>
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
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: { fontSize: 26 },
  title: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  badgeText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border.default,
  },
  metaLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
    marginBottom: 2,
  },
  metaValue: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  promptText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  tipRow: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    padding: 10,
  },
  tipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
