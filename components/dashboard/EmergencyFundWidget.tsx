import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { Goal } from '../../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

function statusInfo(months: number): { label: string; color: string } {
  if (months >= 6) return { label: 'Obiettivo raggiunto', color: Colors.semantic.success };
  if (months >= 3) return { label: 'Buona copertura', color: Colors.semantic.warning };
  if (months >= 1) return { label: 'Copertura parziale', color: '#FFB347' };
  return { label: 'Copertura insufficiente', color: Colors.semantic.danger };
}

interface EmergencyFundWidgetProps {
  /** Saldo totale dei conti bancari */
  accountsBalance: number;
  /** Media spese mensili (valore assoluto) */
  monthlyExpenses: number;
  /** Obiettivo fondo emergenza se già creato */
  emergencyGoal: Goal | null;
}

export default function EmergencyFundWidget({
  accountsBalance,
  monthlyExpenses,
  emergencyGoal,
}: EmergencyFundWidgetProps) {
  const TARGET_MONTHS = 6;
  const balance = emergencyGoal ? emergencyGoal.savedAmount : accountsBalance;
  const monthsCovered = monthlyExpenses > 0 ? balance / monthlyExpenses : 0;
  const progress = Math.min(monthsCovered / TARGET_MONTHS, 1);
  const { label, color } = statusInfo(monthsCovered);

  return (
    <View style={[styles.card, { borderColor: color + '40' }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🛡️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fondo di Emergenza</Text>
          <Text style={[styles.statusLabel, { color }]}>{label}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.badgeText, { color }]}>
            {monthsCovered.toFixed(1)} mesi
          </Text>
        </View>
      </View>

      {/* Progress bar verso 6 mesi */}
      <View style={styles.barTrack}>
        {/* Milestone markers at 3 and 6 months */}
        <View style={[styles.milestone, { left: '50%' }]} />
        <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: color }]} />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>0</Text>
        <Text style={styles.barLabel}>3 mesi</Text>
        <Text style={styles.barLabel}>6 mesi</Text>
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.metaLabel}>Saldo disponibile</Text>
          <Text style={styles.metaValue}>{fmt(balance)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.metaLabel}>Spesa mensile media</Text>
          <Text style={styles.metaValue}>{fmt(monthlyExpenses)}</Text>
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
  statusLabel: {
    ...Typography.caption,
    marginTop: 2,
    fontWeight: '600',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
