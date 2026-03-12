import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';

const fmt = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

function rateInfo(rate: number): { label: string; color: string; desc: string } {
  if (rate >= 0.3) return { label: 'Eccellente', color: Colors.semantic.success, desc: 'Stai risparmiando moltissimo' };
  if (rate >= 0.2) return { label: 'Ottimo', color: Colors.semantic.success, desc: 'Superi la soglia consigliata' };
  if (rate >= 0.1) return { label: 'Buono', color: Colors.semantic.warning, desc: 'Obiettivo: portarlo al 20%' };
  if (rate > 0) return { label: 'In crescita', color: '#FFB347', desc: 'Cerca di ridurre le spese fisse' };
  return { label: 'In rosso', color: Colors.semantic.danger, desc: 'Le uscite superano le entrate' };
}

interface SavingsRateWidgetProps {
  savingsRate: number;     // 0–1
  monthlyIncome: number;
  monthlySavings: number;  // può essere negativo
}

export default function SavingsRateWidget({
  savingsRate,
  monthlyIncome,
  monthlySavings,
}: SavingsRateWidgetProps) {
  const { label, color, desc } = rateInfo(savingsRate);
  const ratePercent = Math.round(savingsRate * 100);
  // progress bar from 0% to 30% as "full"
  const barProgress = Math.min(Math.max(savingsRate, 0) / 0.3, 1);

  return (
    <View style={[styles.card, { borderColor: color + '40' }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>💰</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Tasso di Risparmio</Text>
          <Text style={styles.subtitle}>{desc}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.rateValue, { color }]}>{ratePercent}%</Text>
        </View>
      </View>

      {/* Progress bar 0–30% */}
      <View style={styles.barTrack}>
        {/* Traguardo al 20% */}
        <View style={[styles.milestone, { left: '66.7%' }]} />
        <View style={[styles.barFill, { width: `${Math.round(barProgress * 100)}%` as any, backgroundColor: color }]} />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>0%</Text>
        <Text style={[styles.barLabel, { color: Colors.semantic.success }]}>20% ★</Text>
        <Text style={styles.barLabel}>30%</Text>
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.metaLabel}>Risparmi mensili</Text>
          <Text style={[styles.metaValue, { color: monthlySavings >= 0 ? Colors.semantic.success : Colors.semantic.danger }]}>
            {fmt(monthlySavings)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View>
          <Text style={[styles.metaLabel, { textAlign: 'right' }]}>Entrate mensili</Text>
          <Text style={[styles.metaValue, { textAlign: 'right' }]}>{fmt(monthlyIncome)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.metaLabel}>Livello</Text>
          <Text style={[styles.metaValue, { color }]}>{label}</Text>
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
    alignItems: 'center',
  },
  rateValue: {
    ...Typography.h3,
    fontWeight: '800',
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: Radius.full,
  },
  milestone: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(0,214,143,0.5)',
    zIndex: 1,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  barLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
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
});
