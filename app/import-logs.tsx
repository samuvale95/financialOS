/**
 * Log Importazione
 *
 * Mostra le ultime sessioni di importazione con il testo completo inviato
 * all'AI e la risposta raw. Utile per confrontare il testo estratto dal PDF
 * con il documento originale e capire errori nel conteggio entrate/uscite.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius, Spacing } from '../constants/theme';
import { loadImportLogs, clearImportLogs } from '../utils/importLogger';
import type { ImportLogSession, ChunkLog } from '../utils/importLogger';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function tierColor(tier?: string): string {
  if (tier === 'L1_cache') return Colors.semantic.warning;
  if (tier === 'L2_schema') return Colors.semantic.success;
  if (tier === 'L3_full_ai') return Colors.accent.primary;
  return Colors.text.muted;
}

function tierLabel(tier?: string): string {
  if (tier === 'L1_cache') return 'Cache';
  if (tier === 'L2_schema') return 'Schema';
  if (tier === 'L3_full_ai') return 'Full AI';
  if (!tier) return 'Sconosciuto';
  return tier;
}

// ── ChunkDetail ────────────────────────────────────────────────────────────────

function ChunkDetail({ chunk }: { chunk: ChunkLog }) {
  const [showInput, setShowInput] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  return (
    <View style={s.chunkCard}>
      <View style={s.chunkHeader}>
        <Text style={s.chunkTitle}>
          Chunk {chunk.chunkIndex + 1}/{chunk.totalChunks}
        </Text>
        <Text style={s.chunkMeta}>
          {chunk.inputChars.toLocaleString('it-IT')} caratteri → {chunk.txCount} tx
        </Text>
      </View>

      {/* Input text toggle */}
      <TouchableOpacity
        style={s.sectionToggle}
        onPress={() => setShowInput((v) => !v)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="document-text-outline"
          size={14}
          color={Colors.text.secondary}
        />
        <Text style={s.sectionToggleLabel}>
          Testo inviato al modello ({chunk.inputChars.toLocaleString('it-IT')} chars)
        </Text>
        <Ionicons
          name={showInput ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.text.muted}
        />
      </TouchableOpacity>
      {showInput && (
        <ScrollView style={s.codeBox} nestedScrollEnabled>
          <Text style={s.codeText} selectable>{chunk.inputText}</Text>
        </ScrollView>
      )}

      {/* AI response toggle */}
      <TouchableOpacity
        style={s.sectionToggle}
        onPress={() => setShowResponse((v) => !v)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chatbubble-outline"
          size={14}
          color={Colors.text.secondary}
        />
        <Text style={s.sectionToggleLabel}>
          Risposta AI ({chunk.rawAIResponse.length.toLocaleString('it-IT')} chars)
        </Text>
        <Ionicons
          name={showResponse ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.text.muted}
        />
      </TouchableOpacity>
      {showResponse && (
        <ScrollView style={s.codeBox} nestedScrollEnabled>
          <Text style={s.codeText} selectable>{chunk.rawAIResponse}</Text>
        </ScrollView>
      )}
    </View>
  );
}

// ── SessionCard ────────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: ImportLogSession }) {
  const [expanded, setExpanded] = useState(false);
  const color = tierColor(session.tier);
  const hasChunks = session.chunks.length > 0;

  const handleShare = async () => {
    let text = `=== LOG IMPORTAZIONE ===\n`;
    text += `File: ${session.fileName}\n`;
    text += `Data: ${fmtDate(session.startedAt)}\n`;
    text += `Modello: ${session.model}\n`;
    text += `Strategia: ${session.strategy}\n`;
    text += `Tier: ${tierLabel(session.tier)}\n`;
    text += `Transazioni: ${session.totalTransactions}\n`;
    text += `Entrate: €${fmt(session.totalIncome)}\n`;
    text += `Uscite: €${fmt(session.totalExpenses)}\n`;
    text += `Tempo: ${fmtMs(session.processingTimeMs)}\n`;
    if (session.error) text += `ERRORE: ${session.error}\n`;
    text += '\n';

    session.chunks.forEach((chunk, i) => {
      text += `\n${'═'.repeat(60)}\n`;
      text += `CHUNK ${i + 1} DI ${chunk.totalChunks}\n`;
      text += `Input: ${chunk.inputChars.toLocaleString('it-IT')} caratteri | ${chunk.txCount} transazioni estratte\n`;
      text += `${'─'.repeat(40)}\n`;
      text += `--- TESTO INVIATO AL MODELLO ---\n${chunk.inputText}\n`;
      text += `${'─'.repeat(40)}\n`;
      text += `--- RISPOSTA AI ---\n${chunk.rawAIResponse}\n`;
    });

    try {
      await Share.share({ message: text, title: `Log: ${session.fileName}` });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={[s.sessionCard, session.error && s.sessionCardError]}>
      {/* Header row */}
      <TouchableOpacity
        style={s.sessionHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={s.sessionLeft}>
          <View style={[s.tierBadge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
            <Text style={[s.tierBadgeText, { color }]}>{tierLabel(session.tier)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sessionFileName} numberOfLines={1}>{session.fileName}</Text>
            <Text style={s.sessionDate}>{fmtDate(session.startedAt)}</Text>
          </View>
        </View>
        <View style={s.sessionRight}>
          <Text style={s.sessionModel}>{session.model}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.text.muted}
          />
        </View>
      </TouchableOpacity>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{session.totalTransactions}</Text>
          <Text style={s.statLabel}>tx</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statValue, { color: Colors.semantic.success }]}>
            +€{fmt(session.totalIncome)}
          </Text>
          <Text style={s.statLabel}>entrate</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statValue, { color: Colors.semantic.danger }]}>
            -€{fmt(session.totalExpenses)}
          </Text>
          <Text style={s.statLabel}>uscite</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{fmtMs(session.processingTimeMs)}</Text>
          <Text style={s.statLabel}>tempo</Text>
        </View>
      </View>

      {session.error && (
        <Text style={s.errorText}>{session.error}</Text>
      )}

      {/* Expanded: chunk details + share */}
      {expanded && (
        <View style={s.expandedSection}>
          {!hasChunks ? (
            <Text style={s.noChunksText}>
              {session.tier === 'L1_cache'
                ? 'Risultato dalla cache — nessuna chiamata AI.'
                : session.tier === 'L2_schema'
                ? 'Parsing locale tramite schema — nessuna chiamata AI.'
                : 'Nessun chunk registrato.'}
            </Text>
          ) : (
            session.chunks.map((chunk, i) => (
              <ChunkDetail key={i} chunk={chunk} />
            ))
          )}

          <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={16} color={Colors.accent.primary} />
            <Text style={s.shareBtnText}>Esporta log completo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ImportLogsScreen() {
  const [logs, setLogs] = useState<ImportLogSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const data = await loadImportLogs();
    setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleClear = () => {
    Alert.alert(
      'Svuota log',
      'Eliminare tutti i log di importazione? Questa azione non cancella le transazioni importate.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Svuota',
          style: 'destructive',
          onPress: async () => {
            await clearImportLogs();
            setLogs([]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-down" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Log Importazione</Text>
        {logs.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={handleClear} activeOpacity={0.7}>
            <Text style={s.clearBtnText}>Svuota</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={s.subtitle}>
        Testo inviato al modello e risposta raw — per confrontare con il PDF originale
      </Text>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
        </View>
      ) : logs.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="document-outline" size={48} color={Colors.text.muted} />
          <Text style={s.emptyText}>Nessun log ancora</Text>
          <Text style={s.emptySubText}>I log vengono generati ad ogni importazione con AI</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.countLabel}>{logs.length} sessioni registrate (ultime 30)</Text>
          {logs.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
          <Text style={s.disclaimer}>
            Questi dati non vengono mai cancellati con il reset dell'app
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.semantic.danger + '66',
  },
  clearBtnText: {
    ...Typography.caption,
    color: Colors.semantic.danger,
    fontWeight: '600',
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.muted,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: Spacing.xl,
  },
  emptyText: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  emptySubText: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.md,
    gap: 12,
    paddingBottom: 40,
  },
  countLabel: {
    ...Typography.caption,
    color: Colors.text.muted,
    marginBottom: 4,
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.text.muted,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },

  // Session card
  sessionCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  sessionCardError: {
    borderColor: Colors.semantic.danger + '66',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  sessionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tierBadgeText: {
    ...Typography.micro,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sessionFileName: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  sessionDate: {
    ...Typography.micro,
    color: Colors.text.muted,
    marginTop: 1,
  },
  sessionModel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border.default,
  },
  statValue: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  statLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },

  errorText: {
    ...Typography.caption,
    color: Colors.semantic.danger,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  // Expanded section
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    padding: 12,
    gap: 12,
  },
  noChunksText: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Chunk card
  chunkCard: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  chunkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  chunkTitle: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  chunkMeta: {
    ...Typography.micro,
    color: Colors.text.muted,
  },

  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  sectionToggleLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
  },
  codeBox: {
    maxHeight: 300,
    backgroundColor: Colors.bg.primary,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  codeText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text.secondary,
    fontFamily: 'Courier',
  },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '66',
  },
  shareBtnText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    fontWeight: '600',
  },
});
