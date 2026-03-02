import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Line } from 'react-native-svg';
import { Colors, Typography, Radius } from '../../constants/theme';
import { useData } from '../../contexts/DataContext';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 32;
const CHART_H = 120;

function buildSparklinePoints(data: number[], w: number, h: number): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { assets } = useData();
  const asset = assets.find((a) => a.id === id);

  const metrics = useMemo(() => {
    if (!asset) return null;
    const totalValue = asset.quantity * asset.currentPrice;
    const totalCost = asset.quantity * asset.purchasePrice;
    const returnEur = totalValue - totalCost;
    const returnPct = ((returnEur / totalCost) * 100);
    return { totalValue, totalCost, returnEur, returnPct };
  }, [asset]);

  if (!asset || !metrics) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Asset non trovato</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backCta}>
            <Text style={styles.backCtaText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const points = buildSparklinePoints(asset.sparkline, CHART_W, CHART_H);
  const isPositive = metrics.returnEur >= 0;
  const returnColor = isPositive ? Colors.semantic.success : Colors.semantic.danger;
  const typeLabel: Record<string, string> = {
    etf: 'ETF',
    stock: 'Azione',
    crypto: 'Crypto',
    bond: 'Obbligazione',
    cash: 'Liquidità',
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{asset.name}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Ticker + type */}
        <View style={styles.tickerRow}>
          <View style={[styles.tickerDot, { backgroundColor: asset.color }]} />
          <Text style={styles.ticker}>{asset.ticker}</Text>
          <View style={[styles.typeBadge, { backgroundColor: `${asset.color}20` }]}>
            <Text style={[styles.typeLabel, { color: asset.color }]}>
              {typeLabel[asset.type] ?? asset.type}
            </Text>
          </View>
        </View>

        {/* Current price large */}
        <View style={styles.priceBlock}>
          <Text style={styles.priceLg}>
            €{asset.currentPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={[styles.returnPct, { color: returnColor }]}>
            {isPositive ? '+' : ''}
            {metrics.returnPct.toFixed(2)}%
          </Text>
        </View>

        {/* Sparkline */}
        <View style={styles.chartContainer}>
          <Svg width={CHART_W} height={CHART_H}>
            <Polyline
              points={points}
              fill="none"
              stroke={asset.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        </View>

        {/* Metrics grid */}
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Valore Totale"
            value={`€${metrics.totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
          />
          <MetricCard
            label="Prezzo Medio Carico"
            value={`€${asset.purchasePrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
          />
          <MetricCard
            label="Rendimento €"
            value={`${isPositive ? '+' : ''}€${metrics.returnEur.toFixed(2)}`}
            color={returnColor}
          />
          <MetricCard
            label="Rendimento %"
            value={`${isPositive ? '+' : ''}${metrics.returnPct.toFixed(2)}%`}
            color={returnColor}
          />
        </View>

        {/* Holdings card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Holdings</Text>
          <View style={styles.card}>
            <HoldingRow label="Quantità" value={asset.quantity.toString()} />
            <View style={styles.divider} />
            <HoldingRow
              label="Prezzo Corrente"
              value={`€${asset.currentPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
            />
            <View style={styles.divider} />
            <HoldingRow
              label="Prezzo Acquisto"
              value={`€${asset.purchasePrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
            />
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function HoldingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.holdingRow}>
      <Text style={styles.holdingLabel}>{label}</Text>
      <Text style={styles.holdingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { ...Typography.body, color: Colors.text.secondary },
  backCta: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  backCtaText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { ...Typography.h3, color: Colors.text.primary, flex: 1, textAlign: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tickerDot: { width: 10, height: 10, borderRadius: 5 },
  ticker: { ...Typography.h3, color: Colors.text.secondary },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  typeLabel: { ...Typography.micro, fontWeight: '600' },
  priceBlock: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  priceLg: { fontSize: 36, fontWeight: '800', color: Colors.text.primary, letterSpacing: -1 },
  returnPct: { ...Typography.bodyMedium, fontWeight: '600', marginBottom: 4 },
  chartContainer: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 6,
  },
  metricLabel: { ...Typography.caption, color: Colors.text.muted },
  metricValue: { ...Typography.h3, color: Colors.text.primary },
  section: { gap: 10 },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  holdingLabel: { ...Typography.bodyMedium, color: Colors.text.muted },
  holdingValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border.subtle },
});
