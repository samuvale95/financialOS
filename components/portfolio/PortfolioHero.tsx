import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, Typography, Radius, Shadow } from '../../constants/theme';
import type { PortfolioSummary } from '../../types';

function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return `€${(value / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(value);
}

interface PortfolioHeroProps {
  summary: PortfolioSummary;
}

export function PortfolioHero({ summary }: PortfolioHeroProps) {
  const isPositive = summary.dayChange >= 0;
  const totalIsPositive = summary.totalReturn >= 0;

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={Gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.label}>Valore Portafoglio</Text>
        <Text style={styles.totalValue}>{formatCurrency(summary.totalValue)}</Text>

        <View style={styles.dayRow}>
          <Ionicons
            name={isPositive ? 'trending-up' : 'trending-down'}
            size={16}
            color={isPositive ? '#00D68F' : '#FF6B6B'}
          />
          <Text style={[styles.dayChange, { color: isPositive ? '#00D68F' : '#FF6B6B' }]}>
            {isPositive ? '+' : ''}
            {formatCurrency(summary.dayChange)} ({isPositive ? '+' : ''}
            {summary.dayChangePercent.toFixed(2)}%) oggi
          </Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Rendimento totale</Text>
            <Text style={[styles.statValue, { color: totalIsPositive ? '#00D68F' : '#FF6B6B' }]}>
              {totalIsPositive ? '+' : ''}
              {formatCurrency(summary.totalReturn)} ({summary.totalReturnPercent.toFixed(1)}%)
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Investito</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.totalCost)}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    ...Shadow.glow,
    overflow: 'hidden',
  },
  gradient: {
    padding: 24,
  },
  label: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -1,
    marginBottom: 8,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dayChange: {
    ...Typography.caption,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    gap: 4,
  },
  statLabel: {
    ...Typography.micro,
    color: 'rgba(255,255,255,0.6)',
  },
  statValue: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },
});
