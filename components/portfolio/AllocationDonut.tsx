import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import { DonutChart } from '../dashboard/DonutChart';
import { Card } from '../ui/Card';
import type { Asset } from '../../types';

interface AllocationDonutProps {
  assets: Asset[];
}

function fmt(v: number): string {
  if (v >= 1000) return `€${(v / 1000).toFixed(1)}k`;
  return `€${v.toFixed(0)}`;
}

const TYPE_LABELS: Record<Asset['type'], string> = {
  etf: 'ETF',
  stock: 'Azioni',
  crypto: 'Crypto',
  bond: 'Bond',
  cash: 'Liquidità',
};

export function AllocationDonut({ assets }: AllocationDonutProps) {
  const totalValue = assets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0);

  const segments = assets.map((a) => ({
    value: a.quantity * a.currentPrice,
    color: a.color,
    label: a.ticker,
  }));

  const centerLabel = `€${(totalValue / 1000).toFixed(0)}k`;

  // Group by type for the type breakdown
  const byType = assets.reduce<Record<string, number>>((acc, a) => {
    const val = a.quantity * a.currentPrice;
    acc[a.type] = (acc[a.type] ?? 0) + val;
    return acc;
  }, {});
  const typeEntries = Object.entries(byType).sort(([, a], [, b]) => b - a);

  // Top asset for max bar width reference
  const maxPct = assets.reduce((m, a) => {
    const pct = totalValue > 0 ? (a.quantity * a.currentPrice) / totalValue : 0;
    return Math.max(m, pct);
  }, 0);

  return (
    <Card>
      <Text style={styles.title}>Allocazione</Text>

      {/* Donut + asset list */}
      <View style={styles.row}>
        <DonutChart
          segments={segments}
          size={120}
          strokeWidth={16}
          centerLabel={centerLabel}
          centerSubLabel="totale"
        />

        {/* Per-asset bars */}
        <View style={styles.legend}>
          {assets.map((asset) => {
            const value = asset.quantity * asset.currentPrice;
            const pct = totalValue > 0 ? value / totalValue : 0;
            const barW = maxPct > 0 ? `${(pct / maxPct) * 100}%` as any : '0%';

            return (
              <View key={asset.id} style={styles.legendItem}>
                <View style={styles.legendTop}>
                  <View style={[styles.dot, { backgroundColor: asset.color }]} />
                  <Text style={styles.ticker} numberOfLines={1}>{asset.ticker}</Text>
                  <Text style={styles.pctLabel}>{(pct * 100).toFixed(1)}%</Text>
                  <Text style={styles.valLabel}>{fmt(value)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: barW, backgroundColor: asset.color }]} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Type breakdown strip */}
      {typeEntries.length > 1 && (
        <>
          <View style={styles.divider} />
          <View style={styles.typeSection}>
            <Text style={styles.typeTitle}>Per categoria</Text>
            <View style={styles.typeGrid}>
              {typeEntries.map(([type, value]) => {
                const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                return (
                  <View key={type} style={styles.typeItem}>
                    <Text style={styles.typePct}>{pct.toFixed(0)}%</Text>
                    <Text style={styles.typeLabel}>{TYPE_LABELS[type as Asset['type']] ?? type}</Text>
                    <Text style={styles.typeVal}>{fmt(value)}</Text>
                  </View>
                );
              })}
            </View>
            {/* Stacked bar */}
            <View style={styles.stackedBar}>
              {typeEntries.map(([type, value], i) => {
                const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                // Pick a deterministic color per type
                const typeColors: Record<string, string> = {
                  etf: '#6C63FF',
                  stock: '#00D68F',
                  crypto: '#FFB347',
                  bond: '#4FC3F7',
                  cash: '#BF5AF2',
                };
                return (
                  <View
                    key={type}
                    style={[
                      styles.stackedSegment,
                      {
                        flex: pct,
                        backgroundColor: typeColors[type] ?? Colors.text.muted,
                        borderTopLeftRadius: i === 0 ? 4 : 0,
                        borderBottomLeftRadius: i === 0 ? 4 : 0,
                        borderTopRightRadius: i === typeEntries.length - 1 ? 4 : 0,
                        borderBottomRightRadius: i === typeEntries.length - 1 ? 4 : 0,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendItem: {
    gap: 3,
  },
  legendTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  ticker: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
    flex: 1,
  },
  pctLabel: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  valLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
    minWidth: 32,
    textAlign: 'right',
  },
  barTrack: {
    height: 3,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Type breakdown
  divider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: 14,
  },
  typeSection: {
    gap: 10,
  },
  typeTitle: {
    ...Typography.caption,
    color: Colors.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeItem: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    minWidth: 60,
    gap: 2,
  },
  typePct: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  typeLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  typeVal: {
    ...Typography.micro,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  stackedSegment: {
    height: '100%',
  },
});
