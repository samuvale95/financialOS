import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';

const fmt = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

/**
 * Proiezione semplice con interesse composto:
 *   FV = PV*(1+r)^n  +  PMT * 12 * ((1+r)^n - 1) / r
 * r = tasso annuale, n = anni
 */
function project(currentNetWorth: number, monthlySavings: number, years: number, annualRate = 0.07): number {
  const r = annualRate;
  const n = years;
  const pmt = Math.max(monthlySavings, 0);
  const growth = Math.pow(1 + r, n);
  return currentNetWorth * growth + pmt * 12 * (growth - 1) / r;
}

interface RetirementWidgetProps {
  monthlySavings: number;
  currentNetWorth: number;
}

const HORIZONS: { label: string; years: number }[] = [
  { label: '10 anni', years: 10 },
  { label: '20 anni', years: 20 },
  { label: '30 anni', years: 30 },
];

export default function RetirementWidget({ monthlySavings, currentNetWorth }: RetirementWidgetProps) {
  const ACCENT = Colors.accent.primary;
  const maxProjection = project(currentNetWorth, monthlySavings, 30);

  return (
    <View style={[styles.card, { borderColor: ACCENT + '40' }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🏦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Proiezione Pensione</Text>
          <Text style={styles.subtitle}>Simulazione al 7% annuo (ETF globale)</Text>
        </View>
      </View>

      {HORIZONS.map(({ label, years }) => {
        const projected = project(currentNetWorth, monthlySavings, years);
        const barWidth = maxProjection > 0 ? projected / maxProjection : 0;
        return (
          <View key={years} style={styles.row}>
            <Text style={styles.horizonLabel}>{label}</Text>
            <View style={styles.barArea}>
              <View style={styles.barTrack}>
                <View
                  style={[styles.barFill, {
                    width: `${Math.round(barWidth * 100)}%` as any,
                    backgroundColor: ACCENT,
                    opacity: 0.4 + barWidth * 0.6,
                  }]}
                />
              </View>
            </View>
            <Text style={[styles.projectionValue, { color: ACCENT }]}>{fmt(projected)}</Text>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Basato su {fmt(Math.max(monthlySavings, 0))}/mese di risparmio + patrimonio attuale
        </Text>
        <Text style={styles.disclaimer}>Solo indicativo. Non è consulenza finanziaria.</Text>
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
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  horizonLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    width: 56,
  },
  barArea: {
    flex: 1,
  },
  barTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  projectionValue: {
    ...Typography.caption,
    fontWeight: '700',
    width: 90,
    textAlign: 'right',
  },
  footer: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  footerText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
});
