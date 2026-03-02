import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius } from '../../constants/theme';
import { MainInsightCard } from '../../components/coach/MainInsightCard';
import { InsightItem } from '../../components/coach/InsightItem';
import { useData } from '../../contexts/DataContext';
import type { Insight } from '../../types';

function getInsightAction(insight: Insight): (() => void) | undefined {
  if (!insight.action) return undefined;
  const label = insight.action.toLowerCase();
  if (label.includes('transazion') || label.includes('analizza') || label.includes('importa')) {
    return () => router.push('/(tabs)/spese');
  }
  if (label.includes('portfolio')) {
    return () => router.push('/(tabs)/portfolio');
  }
  return undefined;
}

export default function CoachScreen() {
  const { insights, monthSummary, budgets, transactions } = useData();

  const overBudgetCount = budgets.filter(
    (b) => b.limit > 0 && b.spent / b.limit >= 1
  ).length;

  const score = Math.min(
    100,
    Math.max(
      0,
      60 +
        (monthSummary.savingsRate > 30 ? 15 : monthSummary.savingsRate > 20 ? 10 : 0) -
        overBudgetCount * 8
    )
  );

  const mainInsight = insights[0];
  const otherInsights = insights.slice(1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Coach AI</Text>
            <Text style={styles.subtitle}>Analisi personalizzata</Text>
          </View>
          <View style={styles.aiChip}>
            <Ionicons name="sparkles" size={14} color={Colors.accent.primary} />
            <Text style={styles.aiChipText}>AI</Text>
          </View>
        </View>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreLabel}>Punteggio Finanziario</Text>
            <Text style={styles.scoreValue}>{score}</Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <View style={styles.scoreRight}>
            {monthSummary.savingsRate > 0 && (
              <View style={styles.scoreRow}>
                <Ionicons
                  name={monthSummary.savingsRate >= 20 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={monthSummary.savingsRate >= 20 ? Colors.semantic.success : Colors.semantic.warning}
                />
                <Text style={styles.scoreItem}>
                  Risparmio {monthSummary.savingsRate.toFixed(0)}%
                </Text>
              </View>
            )}
            {overBudgetCount > 0 && (
              <View style={styles.scoreRow}>
                <Ionicons name="alert-circle" size={16} color={Colors.semantic.warning} />
                <Text style={styles.scoreItem}>
                  {overBudgetCount} budget {overBudgetCount === 1 ? 'superato' : 'superati'}
                </Text>
              </View>
            )}
            {transactions.length === 0 && (
              <View style={styles.scoreRow}>
                <Ionicons name="information-circle" size={16} color={Colors.text.muted} />
                <Text style={styles.scoreItem}>Nessuna transazione</Text>
              </View>
            )}
          </View>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={48} color={Colors.text.muted} />
            <Text style={styles.emptyTitle}>Nessun dato disponibile</Text>
            <Text style={styles.emptyBody}>
              Importa le tue transazioni per ricevere insight personalizzati sul tuo andamento finanziario.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/importa')}
            >
              <Text style={styles.emptyBtnText}>Importa Dati</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {mainInsight && (
              <View>
                <Text style={styles.sectionTitle}>Insight Principale</Text>
                <MainInsightCard
                  insight={mainInsight}
                  onAction={getInsightAction(mainInsight)}
                />
              </View>
            )}

            {otherInsights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tutti gli Insight</Text>
                <View style={styles.insightList}>
                  {otherInsights.map((insight) => (
                    <InsightItem
                      key={insight.id}
                      insight={insight}
                      onAction={getInsightAction(insight)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {monthSummary.savingsRate > 0 && (
          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb" size={20} color={Colors.accent.primary} />
              <Text style={styles.tipsTitle}>Consiglio della settimana</Text>
            </View>
            <Text style={styles.tipsBody}>
              {monthSummary.savingsRate >= 20
                ? `Con un tasso di risparmio del ${monthSummary.savingsRate.toFixed(0)}%, sei sulla buona strada. Considera di investire la metà dei risparmi mensili in ETF per far crescere il tuo patrimonio a lungo termine.`
                : 'Cerca di risparmiare almeno il 20% del tuo reddito mensile. Anche piccole riduzioni nelle spese quotidiane fanno la differenza nel lungo periodo.'}
            </Text>
          </View>
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
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    gap: 4,
  },
  title: {
    ...Typography.h1,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  aiChipText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  scoreCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  scoreLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  scoreLabel: {
    position: 'absolute',
    top: -18,
    left: 0,
    ...Typography.micro,
    color: Colors.text.muted,
    width: 80,
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: '800',
    color: Colors.accent.primary,
    letterSpacing: -2,
  },
  scoreMax: {
    ...Typography.body,
    color: Colors.text.muted,
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  scoreRight: {
    flex: 1,
    gap: 10,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border.default,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreItem: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  section: {
    gap: 0,
  },
  insightList: {
    gap: 12,
  },
  tipsCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    gap: 12,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipsTitle: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  tipsBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 20,
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
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  emptyBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },
});
