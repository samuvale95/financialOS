import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, Typography, Radius, Shadow, Gradients, Spacing } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { useSettings } from '../../contexts/SettingsContext';
import { useData } from '../../contexts/DataContext';
import { parseWithGemini, hasGemini } from '../../utils/geminiParser';
import { getCachedResult, setCachedResult } from '../../utils/aiParserCache';
import { parseWithSmartParser } from '../../utils/smartImportParser';
import { logImportEvent } from '../../utils/importAnalytics';
import type { ImportModel, ImportTier, ImportStrategy } from '../../utils/importAnalytics';
import { startLogSession, finishLogSession } from '../../utils/importLogger';
import type { Transaction } from '../../types';
import type { ParseResult } from '../../utils/parsers';

type ImportPhase = 'idle' | 'queue' | 'background' | 'done' | 'error';

export default function ImportaScreen() {
  const { settings } = useSettings();
  const aiEnabled = settings.import.geminiParsing && hasGemini;
  const getParseFn = () => parseWithGemini;

  // Stores fresh AI results (not from cache) for the save-to-cache prompt
  const freshAiResultsRef = useRef<Map<string, ParseResult>>(new Map());

  const {
    importJobs,
    enqueueImport,
    clearImportJobs,
    accounts,
    updateAccount,
    transactions,
    goals,
    addGoal,
  } = useData();

  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [queuedFiles, setQueuedFiles] = useState<{ uri: string; name: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [balanceUpdated, setBalanceUpdated] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState('');
  const [emergencyMonths, setEmergencyMonths] = useState<3 | 6>(3);
  const [emergencyDone, setEmergencyDone] = useState(false);

  const avgMonthlyExp = useMemo(() => {
    const expTxs = transactions.filter(t => t.amount < 0 && t.category !== 'transfer');
    const months = new Set(expTxs.map(t => t.date.slice(0, 7)));
    if (months.size === 0) return 0;
    const total = expTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    return Math.round(total / months.size);
  }, [transactions]);

  // Transition to done when all enqueued jobs have settled
  useEffect(() => {
    if (phase !== 'background' || importJobs.length === 0) return;
    const allSettled = importJobs.every(j => j.status === 'done' || j.status === 'error');
    if (!allSettled) return;

    setPhase('done');

    // Offer to save fresh AI results to cache (only when not already auto-saved)
    const fresh = freshAiResultsRef.current;
    if (fresh.size > 0) {
      Alert.alert(
        'Salva in cache?',
        `${fresh.size} file elaborati dall'AI. Vuoi salvare i risultati per riutilizzarli nei test futuri?`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Salva',
            onPress: async () => {
              for (const [name, result] of fresh) {
                await setCachedResult(name, result);
              }
              fresh.clear();
            },
          },
        ]
      );
    }
  }, [importJobs, phase, settings.developer?.useAiCache]);

  const handlePickFiles = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const files = picked.assets.map(a => ({ uri: a.uri, name: a.name ?? 'file' }));
      setQueuedFiles(prev => [...prev, ...files]);
      setPhase('queue');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Errore selezione file: ${msg}`);
      setPhase('error');
    }
  };

  const handleStartProcessing = () => {
    if (queuedFiles.length === 0) return;
    if (!aiEnabled) {
      setErrorMsg('Configura una API key Gemini nelle impostazioni per usare il parser AI.');
      setPhase('error');
      return;
    }

    freshAiResultsRef.current.clear();
    const baseParser = getParseFn();
    const useCache = settings.developer?.useAiCache ?? false;
    const importStrategy = (settings.developer?.importStrategy ?? 'smart') as ImportStrategy;

    const parseFn = async (uri: string, name: string): Promise<ParseResult> => {
      const t0 = Date.now();
      startLogSession(name, 'gemini-2.5-flash', importStrategy);

      let result: ParseResult;

      try {
        if (importStrategy === 'smart') {
          result = await parseWithSmartParser(uri, name, {
            useCache,
            fullAIParser: baseParser,
            onSchemaLearned: (bankName) =>
              console.log('[Import] nuovo schema salvato per:', bankName),
          });
          // For smart: collect for cache-save prompt only if L3 and auto-cache is off
          if (result._tier === 'L3_full_ai' && !useCache) {
            freshAiResultsRef.current.set(name, result);
          }
        } else {
          // Full AI strategy: always call the full AI, no schema learning
          if (useCache) {
            const cached = await getCachedResult(name);
            if (cached) {
              console.log('[Cache] hit:', name);
              result = { ...cached, _tier: 'L1_cache' as const };
            } else {
              console.log('[Cache] miss:', name, '— chiamo AI');
              const raw = await baseParser(uri, name);
              result = { ...raw, _tier: 'L3_full_ai' as const };
              freshAiResultsRef.current.set(name, result);
            }
          } else {
            const raw = await baseParser(uri, name);
            result = { ...raw, _tier: 'L3_full_ai' as const };
            freshAiResultsRef.current.set(name, result);
          }
        }
      } catch (err) {
        const elapsed = Date.now() - t0;
        const errMsg = err instanceof Error ? err.message : String(err);
        await finishLogSession([], elapsed, undefined, errMsg);
        throw err;
      }

      const elapsed = Date.now() - t0;
      const tier: ImportTier = result._tier ?? 'L3_full_ai';
      const model: ImportModel = tier === 'L1_cache' ? 'none' : 'gemini';

      await finishLogSession(result.transactions, elapsed, tier);

      logImportEvent({
        fileName: name,
        strategy: importStrategy,
        tier,
        model,
        processingTimeMs: elapsed,
        transactionsExtracted: result.transactions.length,
        bankName: result.bankName,
      }).catch(() => {});

      return result;
    };

    clearImportJobs();
    enqueueImport(queuedFiles, parseFn);
    setPhase('background');
  };

  const handleGoHome = () => {
    handleReset();
    router.replace('/(tabs)');
  };

  const handleReset = () => {
    setPhase('idle');
    setQueuedFiles([]);
    setErrorMsg('');
    setBalanceUpdated(false);
    setSelectedAccountId(null);
    setNewBalance('');
    setEmergencyDone(false);
    setEmergencyMonths(3);
    clearImportJobs();
  };

  const handleUpdateBalance = () => {
    if (!selectedAccountId || !newBalance) return;
    updateAccount(selectedAccountId, {
      balance: parseFloat(newBalance.replace(',', '.')) || 0,
      lastUpdated: new Date().toISOString(),
    });
    setBalanceUpdated(true);
  };

  const totalAdded = importJobs.reduce((s, j) => s + (j.addedCount ?? 0), 0);
  const errorJobs = importJobs.filter(j => j.status === 'error');

  // ── Phase: background processing ──────────────────────────────────────────

  if (phase === 'background') {
    const doneCount = importJobs.filter(j => j.status === 'done' || j.status === 'error').length;
    const totalCount = importJobs.length;
    const currentJob = importJobs.find(j => j.status === 'processing');

    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
          <Text style={styles.loadingTitle}>Elaborazione in corso</Text>
          <Text style={styles.loadingSubText}>
            {currentJob ? `${currentJob.fileName}` : 'Preparazione…'}
          </Text>
          <Text style={styles.progressText}>{doneCount}/{totalCount} file</Text>

          <View style={styles.warningBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.semantic.warning} />
            <Text style={styles.warningText}>
              Non chiudere l'app. Riceverai una notifica al termine.
            </Text>
          </View>

          <View style={styles.jobsList}>
            {importJobs.map(job => (
              <View key={job.id} style={styles.jobRow}>
                {job.status === 'done' && (
                  <Ionicons name="checkmark-circle" size={16} color={Colors.semantic.success} />
                )}
                {job.status === 'error' && (
                  <Ionicons name="close-circle" size={16} color={Colors.semantic.danger} />
                )}
                {job.status === 'processing' && (
                  <ActivityIndicator size="small" color={Colors.accent.primary} />
                )}
                {job.status === 'pending' && (
                  <Ionicons name="ellipse-outline" size={16} color={Colors.text.muted} />
                )}
                <Text style={styles.jobName} numberOfLines={1}>{job.fileName}</Text>
                {job.addedCount !== undefined && (
                  <Text style={styles.jobCount}>{job.addedCount} tx</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: error ──────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={56} color={Colors.semantic.danger} />
          <Text style={styles.doneTitle}>Errore</Text>
          <Text style={styles.doneBody}>{errorMsg}</Text>
          <Button label="Riprova" onPress={handleReset} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: queue ──────────────────────────────────────────────────────────

  if (phase === 'queue') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>File selezionati</Text>
            <Text style={styles.subtitle}>{queuedFiles.length} {queuedFiles.length === 1 ? 'file pronto' : 'file pronti'} per l'elaborazione</Text>
          </View>

          <View style={styles.queueCard}>
            {queuedFiles.map((f, i) => (
              <View key={i}>
                <View style={styles.queueRow}>
                  <Ionicons name={getFileIcon(f.name)} size={20} color={Colors.accent.primary} />
                  <Text style={styles.queueFileName} numberOfLines={1}>{f.name}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const next = queuedFiles.filter((_, idx) => idx !== i);
                      if (next.length === 0) { setPhase('idle'); setQueuedFiles([]); }
                      else setQueuedFiles(next);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={18} color={Colors.text.muted} />
                  </TouchableOpacity>
                </View>
                {i < queuedFiles.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.addMoreBtn} onPress={handlePickFiles} activeOpacity={0.7}>
            <Ionicons name="add" size={18} color={Colors.accent.primary} />
            <Text style={styles.addMoreText}>Aggiungi altri file</Text>
          </TouchableOpacity>

          <View style={styles.aiNote}>
            <Ionicons
              name={(settings.developer?.importStrategy ?? 'smart') === 'smart' ? 'flash' : 'sparkles'}
              size={14}
              color={Colors.accent.primary}
            />
            <Text style={styles.aiNoteText}>
              {(settings.developer?.importStrategy ?? 'smart') === 'smart'
                ? 'Smart: schema locale + AI solo se necessario'
                : 'Full AI: Gemini 2.5 Flash analizzerà ogni file'}
            </Text>
          </View>

          <View style={styles.queueActions}>
            <Button label="Annulla" onPress={handleReset} variant="ghost" />
            <Button
              label={`Processa ${queuedFiles.length} ${queuedFiles.length === 1 ? 'file' : 'file'}`}
              onPress={handleStartProcessing}
            />
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Phase: done ───────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.centeredScroll}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.doneTitle}>Importazione completata</Text>
          <Text style={styles.doneBody}>
            {totalAdded} transazioni importate.
            {errorJobs.length > 0 && ` ${errorJobs.length} file con errori.`}
          </Text>

          {errorJobs.length > 0 && (
            <View style={styles.errorJobsCard}>
              {errorJobs.map(j => (
                <View key={j.id} style={styles.errorJobRow}>
                  <Ionicons name="close-circle" size={14} color={Colors.semantic.danger} />
                  <Text style={styles.errorJobText} numberOfLines={2}>{j.fileName}: {j.error}</Text>
                </View>
              ))}
            </View>
          )}

          {accounts.length > 0 && !balanceUpdated && (
            <View style={styles.balanceCard}>
              <Text style={styles.balanceCardTitle}>Aggiornare il saldo?</Text>
              <Text style={styles.balanceCardSub}>Seleziona il conto che hai appena importato</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accountChipBtn, selectedAccountId === acc.id && styles.accountChipBtnSelected]}
                    onPress={() => setSelectedAccountId(acc.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.accountChipBtnText, selectedAccountId === acc.id && styles.accountChipBtnTextSelected]}>
                      {acc.bankName}
                    </Text>
                    <Text style={styles.accountChipLabel}>{acc.accountLabel}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {selectedAccountId && (
                <TextInput
                  style={styles.balanceInput}
                  placeholder="Nuovo saldo (€)"
                  placeholderTextColor={Colors.text.muted}
                  value={newBalance}
                  onChangeText={setNewBalance}
                  keyboardType="decimal-pad"
                />
              )}
              <View style={styles.balanceActions}>
                <TouchableOpacity style={styles.ghostSmallBtn} onPress={() => setBalanceUpdated(true)} activeOpacity={0.7}>
                  <Text style={styles.ghostSmallBtnText}>Salta</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.accentBtn, (!selectedAccountId || !newBalance) && styles.accentBtnDisabled]}
                  onPress={handleUpdateBalance}
                  disabled={!selectedAccountId || !newBalance}
                  activeOpacity={0.8}
                >
                  <Text style={styles.accentBtnText}>Aggiorna</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!emergencyDone && !goals.some(g => g.title === 'Fondo di Emergenza') && avgMonthlyExp > 0 && (
            <View style={styles.emergencyCard}>
              <View style={styles.emergencyCardHeader}>
                <Text style={styles.emergencyEmoji}>🛡️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emergencyCardTitle}>Fondo di Emergenza</Text>
                  <Text style={styles.emergencyCardSub}>
                    Le tue spese medie sono ~€{avgMonthlyExp.toLocaleString('it-IT')}/mese
                  </Text>
                </View>
              </View>
              <View style={styles.emergencyPills}>
                {([3, 6] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.emergencyPill, emergencyMonths === m && styles.emergencyPillActive]}
                    onPress={() => setEmergencyMonths(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.emergencyPillText, emergencyMonths === m && styles.emergencyPillTextActive]}>
                      {m} mesi
                    </Text>
                    <Text style={[styles.emergencyPillAmount, emergencyMonths === m && styles.emergencyPillTextActive]}>
                      €{(avgMonthlyExp * m).toLocaleString('it-IT')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.emergencyActions}>
                <TouchableOpacity style={styles.emergencySkip} onPress={() => setEmergencyDone(true)} activeOpacity={0.7}>
                  <Text style={styles.emergencySkipText}>Non ora</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emergencyCreate}
                  onPress={() => {
                    const target = avgMonthlyExp * emergencyMonths;
                    const targetDate = new Date();
                    targetDate.setFullYear(targetDate.getFullYear() + 2);
                    addGoal({
                      title: 'Fondo di Emergenza',
                      emoji: '🛡️',
                      targetAmount: target,
                      savedAmount: 0,
                      targetDate: targetDate.toISOString().slice(0, 10),
                      color: '#FFB347',
                    });
                    setEmergencyDone(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emergencyCreateText}>Crea obiettivo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Button label="Vai alla Home" onPress={handleGoHome} fullWidth />
          <Button
            label="Vedi Transazioni"
            onPress={() => { handleReset(); router.push('/(tabs)/spese'); }}
            variant="ghost"
            fullWidth
          />
          <Button label="Importa altro" onPress={handleReset} variant="ghost" fullWidth />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Idle UI ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Importa Dati</Text>
          <Text style={styles.subtitle}>Carica le tue transazioni con AI</Text>
        </View>

        <LinearGradient
          colors={Gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Ionicons name="sparkles" size={36} color="#fff" />
          <Text style={styles.heroTitle}>Analisi AI dei tuoi file</Text>
          <Text style={styles.heroBody}>
            Seleziona uno o più estratti conto. L'AI estrarrà e categorizzerà automaticamente tutte le transazioni.
          </Text>
        </LinearGradient>

        <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFiles} activeOpacity={0.8}>
          <View style={styles.uploadBtnIcon}>
            <Ionicons name="cloud-upload-outline" size={32} color={Colors.accent.primary} />
          </View>
          <Text style={styles.uploadBtnTitle}>Seleziona file</Text>
          <Text style={styles.uploadBtnDesc}>PDF, Excel, CSV — anche più file alla volta</Text>
        </TouchableOpacity>

        <View style={styles.formatsRow}>
          {[
            { icon: 'document-text', label: 'PDF' },
            { icon: 'grid', label: 'Excel' },
            { icon: 'list', label: 'CSV' },
          ].map(f => (
            <View key={f.label} style={styles.formatChip}>
              <Ionicons name={f.icon as any} size={14} color={Colors.text.secondary} />
              <Text style={styles.formatChipText}>{f.label}</Text>
            </View>
          ))}
        </View>

        {settings.import.manual && (
          <View style={styles.manualSection}>
            <Text style={styles.sectionTitle}>Inserimento Manuale</Text>
            <Text style={styles.manualDesc}>Aggiungi una transazione compilando il modulo a mano.</Text>
            <Button label="Inserisci Manualmente" onPress={() => router.push('/add-transaction')} fullWidth />
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={14} color={Colors.text.muted} />
          <Text style={styles.noteText}>
            I dati vengono elaborati localmente. Solo il testo estratto viene inviato all'AI.
          </Text>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getFileIcon(name: string): any {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'document-text';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.ods')) return 'grid';
  return 'list';
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
    gap: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  centeredScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  header: {
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
  hero: {
    borderRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    ...Shadow.glow,
  },
  heroTitle: {
    ...Typography.h2,
    color: '#fff',
  },
  heroBody: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  uploadBtn: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border.accent,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  uploadBtnIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.glow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  uploadBtnDesc: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  formatsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  formatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  formatChipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  manualSection: {
    gap: 12,
  },
  manualDesc: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  noteText: {
    ...Typography.micro,
    color: Colors.text.muted,
    textAlign: 'center',
    flex: 1,
  },
  // Loading
  loadingTitle: {
    ...Typography.h2,
    color: Colors.text.primary,
  },
  loadingSubText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  progressText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.semantic.warning + '15',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.semantic.warning + '40',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  warningText: {
    ...Typography.caption,
    color: Colors.semantic.warning,
    flex: 1,
  },
  jobsList: {
    alignSelf: 'stretch',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 4,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  jobName: {
    ...Typography.caption,
    color: Colors.text.primary,
    flex: 1,
  },
  jobCount: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  // Queue
  queueCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  queueFileName: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    borderStyle: 'dashed',
  },
  addMoreText: {
    ...Typography.bodyMedium,
    color: Colors.accent.primary,
  },
  aiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  aiNoteText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  queueActions: {
    gap: 12,
  },
  // Error jobs
  errorJobsCard: {
    alignSelf: 'stretch',
    backgroundColor: Colors.semantic.danger + '15',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.semantic.danger + '40',
    padding: 12,
    gap: 6,
  },
  errorJobRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorJobText: {
    ...Typography.micro,
    color: Colors.semantic.danger,
    flex: 1,
  },
  // Balance update card
  balanceCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignSelf: 'stretch',
  },
  balanceCardTitle: { ...Typography.h3, color: Colors.text.primary },
  balanceCardSub: { ...Typography.caption, color: Colors.text.secondary },
  accountsScroll: { maxHeight: 72 },
  accountChipBtn: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
  },
  accountChipBtnSelected: {
    backgroundColor: Colors.accent.glow,
    borderColor: Colors.border.accent,
  },
  accountChipBtnText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  accountChipBtnTextSelected: { color: Colors.accent.primary },
  accountChipLabel: { ...Typography.micro, color: Colors.text.muted },
  balanceInput: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    ...Typography.body,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  ghostSmallBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  ghostSmallBtnText: { ...Typography.bodyMedium, color: Colors.text.secondary },
  accentBtn: {
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  accentBtnDisabled: { opacity: 0.4 },
  accentBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  // Emergency fund card
  emergencyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FFB347' + '66',
    padding: 16,
    gap: 12,
    alignSelf: 'stretch',
  },
  emergencyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emergencyEmoji: { fontSize: 28 },
  emergencyCardTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  emergencyCardSub: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  emergencyPills: { flexDirection: 'row', gap: 10 },
  emergencyPill: {
    flex: 1, borderRadius: Radius.md, padding: 12, alignItems: 'center', gap: 4,
    backgroundColor: Colors.bg.elevated, borderWidth: 1, borderColor: Colors.border.default,
  },
  emergencyPillActive: { backgroundColor: '#FFB347' + '20', borderColor: '#FFB347' },
  emergencyPillText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  emergencyPillAmount: { ...Typography.bodyMedium, color: Colors.text.secondary, fontWeight: '700' },
  emergencyPillTextActive: { color: '#FFB347' },
  emergencyActions: { flexDirection: 'row', gap: 10 },
  emergencySkip: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border.default, alignItems: 'center',
  },
  emergencySkipText: { ...Typography.bodyMedium, color: Colors.text.secondary },
  emergencyCreate: {
    flex: 2, paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: '#FFB347', alignItems: 'center',
  },
  emergencyCreateText: { ...Typography.bodyMedium, color: '#000', fontWeight: '700' },
  // Done
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.semantic.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneTitle: {
    ...Typography.h2,
    color: Colors.text.primary,
  },
  doneBody: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});
