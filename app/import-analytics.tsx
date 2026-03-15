import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius, Spacing, Touch } from '../constants/theme';
import {
  loadImportAnalytics,
  clearImportAnalytics,
  type ImportEventLog,
  type ImportTier,
} from '../utils/importAnalytics';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<ImportTier, string> = {
  L1_cache: Colors.semantic.success,
  L2_schema: Colors.semantic.warning,
  L3_full_ai: Colors.accent.primary,
};

const TIER_LABEL: Record<ImportTier, string> = {
  L1_cache: 'L1 Cache',
  L2_schema: 'L2 Schema',
  L3_full_ai: 'L3 Full AI',
};

const TIER_DESC: Record<ImportTier, string> = {
  L1_cache: 'Nessuna chiamata AI',
  L2_schema: 'Solo categorizzazione',
  L3_full_ai: 'Analisi AI completa',
};

// Rough cost per event (USD)
const TIER_COST_USD: Record<ImportTier, number> = {
  L1_cache: 0,
  L2_schema: 0.00005,  // ~200 tok in + 100 tok out @ gpt-4o-mini
  L3_full_ai: 0.005,   // ~15K tok in + 3K tok out @ gpt-4o-mini
};

const MODEL_LABEL: Record<string, string> = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  none: '—',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  return `~$${usd.toFixed(3)}`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ImportAnalyticsScreen() {
  const [events, setEvents] = useState<ImportEventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const cronologiaY = useRef(0);

  useEffect(() => {
    loadImportAnalytics().then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    if (!events.length) return null;
    const total = events.length;
    const totalTx = events.reduce((s, e) => s + e.transactionsExtracted, 0);
    const avgMs = Math.round(events.reduce((s, e) => s + e.processingTimeMs, 0) / total);
    const byTier: Record<ImportTier, number> = {
      L1_cache: events.filter((e) => e.tier === 'L1_cache').length,
      L2_schema: events.filter((e) => e.tier === 'L2_schema').length,
      L3_full_ai: events.filter((e) => e.tier === 'L3_full_ai').length,
    };
    const byModel = {
      openai: events.filter((e) => e.model === 'openai').length,
      gemini: events.filter((e) => e.model === 'gemini').length,
    };
    const estimatedCostUsd = events.reduce((s, e) => s + TIER_COST_USD[e.tier], 0);
    const savedVsFullAi =
      (byTier.L1_cache * TIER_COST_USD.L3_full_ai +
        byTier.L2_schema * (TIER_COST_USD.L3_full_ai - TIER_COST_USD.L2_schema));

    return { total, totalTx, avgMs, byTier, byModel, estimatedCostUsd, savedVsFullAi };
  }, [events]);

  const handleClear = () => {
    Alert.alert(
      'Svuota analytics',
      'I dati di analisi verranno eliminati definitivamente. I dati dell\'app non vengono toccati.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            await clearImportAnalytics();
            setEvents([]);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={s.title}>Analytics Importazione</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={s.emptyText}>Caricamento…</Text>
        ) : events.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="bar-chart-outline" size={56} color={Colors.text.muted} />
            <Text style={s.emptyTitle}>Nessun dato ancora</Text>
            <Text style={s.emptyText}>
              I dati vengono raccolti automaticamente ad ogni importazione.
              Non vengono mai eliminati con il reset dell'app.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Warning banner (last event has warning) ───────────────── */}
            {events[0]?.warning && (
              <View style={s.warningBanner}>
                <Ionicons name="warning-outline" size={16} color={Colors.semantic.warning} />
                <Text style={s.warningBannerText}>
                  Ultimo file parzialmente importato: alcune righe potrebbero mancare
                </Text>
                <TouchableOpacity
                  onPress={() => scrollRef.current?.scrollTo({ y: cronologiaY.current, animated: true })}
                  activeOpacity={0.7}
                >
                  <Text style={s.warningBannerLink}>Vedi dettagli</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Summary ─────────────────────────────────────────────────── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>RIEPILOGO</Text>
              <View style={s.summaryRow}>
                <SummaryCard value={String(stats!.total)} label="Import" />
                <SummaryCard value={String(stats!.totalTx)} label="Transazioni" />
                <SummaryCard value={formatTime(stats!.avgMs)} label="Tempo medio" />
              </View>

              <View style={s.costRow}>
                <View style={s.costItem}>
                  <Text style={s.costLabel}>Costo stimato totale</Text>
                  <Text style={s.costValue}>{formatCost(stats!.estimatedCostUsd)}</Text>
                </View>
                {stats!.savedVsFullAi > 0.001 && (
                  <View style={[s.costItem, s.savingsItem]}>
                    <Text style={s.savingsLabel}>Risparmio vs Full AI</Text>
                    <Text style={s.savingsValue}>{formatCost(stats!.savedVsFullAi)}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Tier distribution ────────────────────────────────────────── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>DISTRIBUZIONE LIVELLI</Text>
              <View style={s.card}>
                {(['L1_cache', 'L2_schema', 'L3_full_ai'] as const).map((tier, i) => {
                  const count = stats!.byTier[tier];
                  const pct = stats!.total > 0 ? (count / stats!.total) * 100 : 0;
                  return (
                    <View key={tier}>
                      {i > 0 && <View style={s.divider} />}
                      <View style={s.tierRow}>
                        <View style={[s.tierDot, { backgroundColor: TIER_COLOR[tier] }]} />
                        <View style={s.tierMid}>
                          <View style={s.tierLabelRow}>
                            <Text style={s.tierLabel}>{TIER_LABEL[tier]}</Text>
                            <Text style={s.tierDesc}>{TIER_DESC[tier]}</Text>
                          </View>
                          <View style={s.barBg}>
                            <View
                              style={[
                                s.barFill,
                                {
                                  width: `${pct > 0 ? Math.max(pct, 4) : 0}%`,
                                  backgroundColor: TIER_COLOR[tier],
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={s.tierCount}>
                          {count} <Text style={s.tierPct}>({Math.round(pct)}%)</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Cost legend */}
              <View style={s.legend}>
                {(['L1_cache', 'L2_schema', 'L3_full_ai'] as const).map((tier) => (
                  <View key={tier} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: TIER_COLOR[tier] }]} />
                    <Text style={s.legendText}>
                      {TIER_LABEL[tier]}: {tier === 'L1_cache' ? 'gratis' : formatCost(TIER_COST_USD[tier])}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Model breakdown ──────────────────────────────────────────── */}
            {(stats!.byModel.openai > 0 || stats!.byModel.gemini > 0) && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>PER MODELLO AI</Text>
                <View style={s.modelRow}>
                  {(['openai', 'gemini'] as const).map((m) => {
                    const count = stats!.byModel[m];
                    if (!count) return null;
                    return (
                      <View key={m} style={s.modelCard}>
                        <Ionicons
                          name={m === 'openai' ? 'logo-electron' : 'sparkles'}
                          size={20}
                          color={Colors.accent.primary}
                        />
                        <Text style={s.modelNum}>{count}</Text>
                        <Text style={s.modelLabel}>{MODEL_LABEL[m]}</Text>
                      </View>
                    );
                  })}
                  {stats!.byTier.L1_cache > 0 && (
                    <View style={s.modelCard}>
                      <Ionicons name="flash" size={20} color={Colors.semantic.success} />
                      <Text style={s.modelNum}>{stats!.byTier.L1_cache}</Text>
                      <Text style={s.modelLabel}>Cache</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ── History ──────────────────────────────────────────────────── */}
            <View
              style={s.section}
              onLayout={(e) => { cronologiaY.current = e.nativeEvent.layout.y; }}
            >
              <Text style={s.sectionTitle}>CRONOLOGIA ({events.length})</Text>
              <View style={s.card}>
                {events.map((ev, i) => (
                  <View key={ev.id}>
                    {i > 0 && <View style={s.divider} />}
                    <View style={s.eventRow}>
                      <View style={[s.tierDot, { backgroundColor: TIER_COLOR[ev.tier] }]} />
                      <View style={s.eventBody}>
                        <View style={s.eventFileRow}>
                          <Text style={s.eventFile} numberOfLines={1}>{ev.fileName}</Text>
                          {ev.warning && (
                            <Ionicons name="warning-outline" size={13} color={Colors.semantic.warning} />
                          )}
                        </View>
                        <Text style={s.eventMeta}>
                          {formatDate(ev.timestamp)} · {TIER_LABEL[ev.tier]} · {MODEL_LABEL[ev.model]}
                        </Text>
                        {ev.warning && (
                          <Text style={s.eventWarningText} numberOfLines={2}>{ev.warning}</Text>
                        )}
                        <View style={s.eventStats}>
                          <Text style={s.eventStatText}>{ev.bankName}</Text>
                          <View style={s.dot} />
                          <Text style={s.eventStatText}>{ev.transactionsExtracted} tx</Text>
                          <View style={s.dot} />
                          <Text style={s.eventStatText}>{formatTime(ev.processingTimeMs)}</Text>
                          <View style={s.dot} />
                          <Text style={[s.eventStatText, { color: TIER_COLOR[ev.tier] }]}>
                            {ev.tier === 'L1_cache' ? '$0' : formatCost(TIER_COST_USD[ev.tier])}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Actions ──────────────────────────────────────────────────── */}
            <TouchableOpacity style={s.clearBtn} onPress={handleClear} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={Colors.semantic.danger} />
              <Text style={s.clearBtnText}>Svuota analytics</Text>
            </TouchableOpacity>

            <View style={s.disclaimer}>
              <Ionicons name="shield-checkmark-outline" size={12} color={Colors.text.muted} />
              <Text style={s.disclaimerText}>
                Questi dati non vengono mai cancellati con il reset dell'app — solo da qui.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryNum}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: {
    width: Touch.sm, height: Touch.sm, borderRadius: Touch.sm / 2,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border.default,
  },
  title: { ...Typography.h3, color: Colors.text.primary },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 24,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: { ...Typography.h3, color: Colors.text.primary },
  emptyText: {
    ...Typography.body,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
  },

  section: { gap: 10 },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  summaryNum: { ...Typography.h2, color: Colors.text.primary },
  summaryLabel: { ...Typography.micro, color: Colors.text.muted },

  costRow: {
    flexDirection: 'row',
    gap: 10,
  },
  costItem: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 12,
    gap: 2,
  },
  savingsItem: {
    borderColor: Colors.semantic.success + '50',
    backgroundColor: Colors.semantic.success + '10',
  },
  costLabel: { ...Typography.micro, color: Colors.text.muted },
  costValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  savingsLabel: { ...Typography.micro, color: Colors.semantic.success + 'cc' },
  savingsValue: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '700' },

  // Tier bars
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  tierDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  tierMid: { flex: 1, gap: 6 },
  tierLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  tierDesc: { ...Typography.micro, color: Colors.text.muted },
  barBg: {
    height: 6,
    backgroundColor: Colors.bg.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  tierCount: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700', minWidth: 44, textAlign: 'right' },
  tierPct: { ...Typography.micro, color: Colors.text.muted, fontWeight: '400' },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { ...Typography.micro, color: Colors.text.muted },

  // Models
  modelRow: { flexDirection: 'row', gap: 10 },
  modelCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  modelNum: { ...Typography.h2, color: Colors.text.primary },
  modelLabel: { ...Typography.caption, color: Colors.text.muted },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.semantic.warning + '18',
    borderWidth: 1,
    borderColor: Colors.semantic.warning + '55',
    borderRadius: Radius.md,
    padding: 12,
  },
  warningBannerText: {
    ...Typography.caption,
    color: Colors.semantic.warning,
    flex: 1,
    lineHeight: 18,
  },
  warningBannerLink: {
    ...Typography.caption,
    color: Colors.semantic.warning,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Events
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  eventBody: { flex: 1, gap: 3 },
  eventFileRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventFile: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600', flex: 1 },
  eventWarningText: { ...Typography.micro, color: Colors.semantic.warning, lineHeight: 15 },
  eventMeta: { ...Typography.caption, color: Colors.text.secondary },
  eventStats: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  eventStatText: { ...Typography.micro, color: Colors.text.muted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.border.default },

  // Bottom
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.semantic.danger + '50',
    backgroundColor: Colors.semantic.danger + '10',
  },
  clearBtnText: { ...Typography.bodyMedium, color: Colors.semantic.danger },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  disclaimerText: {
    ...Typography.micro,
    color: Colors.text.muted,
    textAlign: 'center',
    flex: 1,
    lineHeight: 16,
  },
});
