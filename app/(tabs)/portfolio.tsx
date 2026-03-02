import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import { PortfolioHero } from '../../components/portfolio/PortfolioHero';
import { AllocationDonut } from '../../components/portfolio/AllocationDonut';
import { AssetItem } from '../../components/portfolio/AssetItem';
import { Card } from '../../components/ui/Card';
import { useData } from '../../contexts/DataContext';
import type { PortfolioSummary } from '../../types';

export default function PortfolioScreen() {
  const { assets } = useData();

  const summary = useMemo<PortfolioSummary>(() => {
    const totalValue = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
    const totalCost = assets.reduce((s, a) => s + a.quantity * a.purchasePrice, 0);
    const totalReturn = totalValue - totalCost;
    const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
    const dayChange = totalValue * 0.008;
    const dayChangePercent = 0.8;
    return { totalValue, totalCost, dayChange, dayChangePercent, totalReturn, totalReturnPercent };
  }, [assets]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Portfolio</Text>

        {assets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="pie-chart-outline" size={48} color={Colors.text.muted} />
            <Text style={styles.emptyTitle}>Nessun asset</Text>
            <Text style={styles.emptyBody}>
              Il tuo portafoglio è vuoto. Gli asset aggiunti appariranno qui.
            </Text>
          </View>
        ) : (
          <>
            <PortfolioHero summary={summary} />
            <AllocationDonut assets={assets} />
            <Card padding={0} style={styles.assetsCard}>
              <View style={styles.assetsHeader}>
                <Text style={styles.assetsTitle}>Asset</Text>
                <Text style={styles.assetsSubtitle}>{assets.length} posizioni</Text>
              </View>
              {assets.map((asset, i) => (
                <View key={asset.id}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push(`/asset/${asset.id}`)}
                  >
                    <AssetItem asset={asset} />
                  </TouchableOpacity>
                  {i < assets.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  title: {
    ...Typography.h1,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  assetsCard: {
    overflow: 'hidden',
  },
  assetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  assetsTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  assetsSubtitle: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginHorizontal: 16,
  },
  emptyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  emptyBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
