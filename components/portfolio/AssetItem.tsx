import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { Asset } from '../../types';

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `€${(value / 1000).toFixed(1)}k`;
  }
  return `€${value.toFixed(2)}`;
}

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

function Sparkline({ data, color, width = 60, height = 28 }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface AssetItemProps {
  asset: Asset;
  onPress?: () => void;
}

export function AssetItem({ asset, onPress }: AssetItemProps) {
  const currentValue = asset.quantity * asset.currentPrice;
  const costBasis = asset.quantity * asset.purchasePrice;
  const returnPct = ((currentValue - costBasis) / costBasis) * 100;
  const isPositive = returnPct >= 0;

  const typeLabels: Record<Asset['type'], string> = {
    etf: 'ETF',
    stock: 'Azione',
    crypto: 'Crypto',
    bond: 'Bond',
    cash: 'Liquidità',
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={[styles.colorBar, { backgroundColor: asset.color }]} />

      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.ticker}>{asset.ticker}</Text>
          <View style={[styles.typePill, { backgroundColor: `${asset.color}20` }]}>
            <Text style={[styles.typeLabel, { color: asset.color }]}>
              {typeLabels[asset.type]}
            </Text>
          </View>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {asset.name}
        </Text>
      </View>

      <View style={styles.sparkContainer}>
        <Sparkline data={asset.sparkline} color={isPositive ? '#00D68F' : '#FF6B6B'} />
      </View>

      <View style={styles.valueBlock}>
        <Text style={styles.value}>{formatCurrency(currentValue)}</Text>
        <View style={styles.returnRow}>
          <Ionicons
            name={isPositive ? 'caret-up' : 'caret-down'}
            size={10}
            color={isPositive ? Colors.semantic.success : Colors.semantic.danger}
          />
          <Text
            style={[
              styles.returnPct,
              { color: isPositive ? Colors.semantic.success : Colors.semantic.danger },
            ]}
          >
            {Math.abs(returnPct).toFixed(1)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  colorBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticker: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  typeLabel: {
    ...Typography.micro,
    fontWeight: '600',
  },
  name: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  sparkContainer: {
    justifyContent: 'center',
  },
  valueBlock: {
    alignItems: 'flex-end',
    gap: 3,
  },
  value: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  returnPct: {
    ...Typography.caption,
    fontWeight: '600',
  },
});
