import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants/theme';
import { DonutChart } from '../dashboard/DonutChart';
import { Card } from '../ui/Card';
import type { Asset } from '../../types';

interface AllocationDonutProps {
  assets: Asset[];
}

export function AllocationDonut({ assets }: AllocationDonutProps) {
  const totalValue = assets.reduce(
    (sum, a) => sum + a.quantity * a.currentPrice,
    0
  );

  const segments = assets.map((a) => ({
    value: a.quantity * a.currentPrice,
    color: a.color,
    label: a.ticker,
  }));

  const centerLabel = `€${(totalValue / 1000).toFixed(0)}k`;

  return (
    <Card>
      <Text style={styles.title}>Allocazione</Text>
      <View style={styles.content}>
        <DonutChart
          segments={segments}
          size={140}
          strokeWidth={18}
          centerLabel={centerLabel}
          centerSubLabel="totale"
        />
        <View style={styles.legend}>
          {assets.map((asset) => {
            const value = asset.quantity * asset.currentPrice;
            const pct = ((value / totalValue) * 100).toFixed(1);
            return (
              <View key={asset.id} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: asset.color }]} />
                <Text style={styles.ticker}>{asset.ticker}</Text>
                <Text style={styles.pct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ticker: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
    fontWeight: '500',
  },
  pct: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: '600',
  },
});
