import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { Asset } from '../../types';

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `€${(value / 1000).toFixed(1)}k`;
  }
  return `€${Math.abs(value).toFixed(0)}`;
}

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

function Sparkline({ data, color, width = 56, height = 26 }: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
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
  totalValue?: number; // portfolio total for allocation %
  onPress?: () => void;
}

export function AssetItem({ asset, totalValue, onPress }: AssetItemProps) {
  const currentValue = asset.quantity * asset.currentPrice;
  const costBasis = asset.quantity * asset.purchasePrice;
  const pnl = currentValue - costBasis;
  const returnPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const isPositive = pnl >= 0;
  const allocationPct = totalValue && totalValue > 0 ? (currentValue / totalValue) * 100 : null;

  const typeLabels: Record<Asset['type'], string> = {
    etf: 'ETF',
    stock: 'Azione',
    crypto: 'Crypto',
    bond: 'Bond',
    cash: 'Liquidità',
  };

  const pnlColor = isPositive ? Colors.semantic.success : Colors.semantic.danger;
  const pnlSign = isPositive ? '+' : '-';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={[styles.colorBar, { backgroundColor: asset.color }]} />

      {/* Name + meta */}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.ticker}>{asset.ticker}</Text>
          <View style={[styles.typePill, { backgroundColor: `${asset.color}20` }]}>
            <Text style={[styles.typeLabel, { color: asset.color }]}>
              {typeLabels[asset.type]}
            </Text>
          </View>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.name} numberOfLines={1}>
            {asset.name}
          </Text>
          {allocationPct !== null && (
            <Text style={styles.allocPct}>{allocationPct.toFixed(1)}%</Text>
          )}
        </View>
      </View>

      {/* Sparkline */}
      <View style={styles.sparkContainer}>
        <Sparkline data={asset.sparkline} color={isPositive ? Colors.semantic.success : Colors.semantic.danger} />
      </View>

      {/* Value + P&L */}
      <View style={styles.valueBlock}>
        <Text style={styles.value}>{formatCurrency(currentValue)}</Text>
        <View style={styles.pnlRow}>
          <Ionicons
            name={isPositive ? 'caret-up' : 'caret-down'}
            size={9}
            color={pnlColor}
          />
          <Text style={[styles.pnlPct, { color: pnlColor }]}>
            {Math.abs(returnPct).toFixed(1)}%
          </Text>
          <Text style={[styles.pnlAbs, { color: pnlColor }]}>
            {pnlSign}{formatCurrency(Math.abs(pnl))}
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
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
    gap: 7,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    flex: 1,
  },
  allocPct: {
    ...Typography.micro,
    color: Colors.text.secondary,
    fontWeight: '600',
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
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
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pnlPct: {
    ...Typography.caption,
    fontWeight: '600',
  },
  pnlAbs: {
    ...Typography.micro,
    fontWeight: '500',
    marginLeft: 2,
  },
});
