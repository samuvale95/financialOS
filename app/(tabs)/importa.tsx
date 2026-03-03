import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Typography, Radius, Shadow, Gradients, Spacing } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { useSettings } from '../../contexts/SettingsContext';
import { useData } from '../../contexts/DataContext';
import { parseCSV, type ParseResult } from '../../utils/parsers';
import { parseExcel } from '../../utils/excelParser';
import type { Transaction } from '../../types';

type ImportPhase = 'idle' | 'picking' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

interface PreviewState {
  result: ParseResult;
  importedCount?: number;
}

export default function ImportaScreen() {
  const { settings } = useSettings();
  const { addTransactions, accounts, updateAccount } = useData();
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [balanceUpdated, setBalanceUpdated] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState('');

  const handleCSV = async () => {
    setPhase('picking');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) { setPhase('idle'); return; }
      setPhase('parsing');
      const content = await FileSystem.readAsStringAsync(picked.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const result = parseCSV(content);
      if (result.transactions.length === 0) {
        setErrorMsg('Nessuna transazione valida trovata nel file CSV.');
        setPhase('error');
        return;
      }
      setPreview({ result });
      setPhase('preview');
    } catch (e) {
      setErrorMsg('Errore durante la lettura del file CSV.');
      setPhase('error');
    }
  };

  const handleExcel = async () => {
    setPhase('picking');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) { setPhase('idle'); return; }
      setPhase('parsing');
      const result = await parseExcel(picked.assets[0].uri);
      if (result.transactions.length === 0) {
        setErrorMsg('Nessuna transazione valida trovata nel file Excel.');
        setPhase('error');
        return;
      }
      setPreview({ result });
      setPhase('preview');
    } catch (e) {
      setErrorMsg('Errore durante la lettura del file Excel.');
      setPhase('error');
    }
  };

  const handlePDF = async () => {
    try {
      await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: false,
      });
    } catch {}
    Alert.alert(
      'PDF selezionato',
      'Il parsing PDF è in sviluppo. Per ora usa CSV o Excel per importare le transazioni.',
      [{ text: 'OK' }]
    );
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setPhase('importing');
    const added = addTransactions(preview.result.transactions as Omit<Transaction, 'id'>[]);
    setPreview((prev) => prev ? { ...prev, importedCount: added } : null);
    setPhase('done');
  };

  const handleReset = () => {
    setPhase('idle');
    setPreview(null);
    setErrorMsg('');
    setBalanceUpdated(false);
    setSelectedAccountId(null);
    setNewBalance('');
  };

  const handleUpdateBalance = () => {
    if (!selectedAccountId || !newBalance) return;
    updateAccount(selectedAccountId, {
      balance: parseFloat(newBalance.replace(',', '.')) || 0,
      lastUpdated: new Date().toISOString(),
    });
    setBalanceUpdated(true);
  };

  // ── Phases UI ──────────────────────────────────────────────────────────────

  if (phase === 'picking' || phase === 'parsing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
          <Text style={styles.loadingText}>
            {phase === 'picking' ? 'Selezione file…' : 'Analisi in corso…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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

  if (phase === 'preview' && preview) {
    const { result } = preview;
    const sample = result.transactions.slice(0, 3);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Anteprima</Text>

          <View style={styles.bankChip}>
            <Ionicons name="business-outline" size={14} color={Colors.accent.primary} />
            <Text style={styles.bankChipText}>Rilevato: {result.bankName}</Text>
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewCount}>
              {result.transactions.length} transazioni trovate
            </Text>
            {result.skipped > 0 && (
              <Text style={styles.previewSkipped}>
                {result.skipped} {result.skipped === 1 ? 'riga non valida ignorata' : 'righe non valide ignorate'}
              </Text>
            )}
          </View>

          <View style={styles.sampleCard}>
            <Text style={styles.sampleTitle}>Prime transazioni</Text>
            {sample.map((t, i) => (
              <View key={i}>
                <View style={styles.sampleRow}>
                  <View style={styles.sampleInfo}>
                    <Text style={styles.sampleDesc} numberOfLines={1}>{t.description}</Text>
                    <Text style={styles.sampleDate}>{t.date}</Text>
                  </View>
                  <Text
                    style={[
                      styles.sampleAmount,
                      { color: t.amount >= 0 ? Colors.semantic.success : Colors.semantic.danger },
                    ]}
                  >
                    {t.amount >= 0 ? '+' : ''}€{Math.abs(t.amount).toFixed(2)}
                  </Text>
                </View>
                {i < sample.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          <View style={styles.previewActions}>
            <Button label="Annulla" onPress={handleReset} variant="ghost" />
            <Button
              label={`Importa ${result.transactions.length} transazioni`}
              onPress={handleConfirmImport}
            />
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'importing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
          <Text style={styles.loadingText}>Importazione in corso…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'done' && preview) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.centeredScroll}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.doneTitle}>Importazione completata</Text>
          <Text style={styles.doneBody}>
            {preview.importedCount ?? 0} transazioni importate con successo.
          </Text>

          {accounts.length > 0 && !balanceUpdated && (
            <View style={styles.balanceCard}>
              <Text style={styles.balanceCardTitle}>Aggiornare il saldo?</Text>
              <Text style={styles.balanceCardSub}>
                Seleziona il conto che hai appena importato
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountChipBtn,
                      selectedAccountId === acc.id && styles.accountChipBtnSelected,
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.accountChipBtnText,
                        selectedAccountId === acc.id && styles.accountChipBtnTextSelected,
                      ]}
                    >
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
                <TouchableOpacity
                  style={styles.ghostSmallBtn}
                  onPress={() => setBalanceUpdated(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ghostSmallBtnText}>Salta</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.accentBtn,
                    (!selectedAccountId || !newBalance) && styles.accentBtnDisabled,
                  ]}
                  onPress={handleUpdateBalance}
                  disabled={!selectedAccountId || !newBalance}
                  activeOpacity={0.8}
                >
                  <Text style={styles.accentBtnText}>Aggiorna</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Button
            label="Vedi Transazioni"
            onPress={() => { handleReset(); router.push('/(tabs)/spese'); }}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Importa Dati</Text>
          <Text style={styles.subtitle}>Carica o inserisci le tue transazioni</Text>
        </View>

        {/* Hero */}
        <LinearGradient
          colors={Gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Ionicons name="lock-closed" size={36} color="#fff" />
          <Text style={styles.heroTitle}>I tuoi file sono al sicuro</Text>
          <Text style={styles.heroBody}>
            I dati vengono elaborati localmente sul tuo dispositivo e non vengono mai condivisi con terze parti.
          </Text>
        </LinearGradient>

        {/* File cards */}
        <View>
          <Text style={styles.sectionTitle}>Carica Estratto Conto</Text>
          <View style={styles.fileGrid}>
            {settings.import.pdf && (
              <TouchableOpacity
                style={styles.fileCard}
                activeOpacity={0.7}
                onPress={handlePDF}
              >
                <View style={styles.fileIcon}>
                  <Ionicons name="document-text" size={24} color={Colors.accent.primary} />
                </View>
                <Text style={styles.fileLabel}>PDF</Text>
                <Text style={styles.fileDesc}>Estratto conto PDF</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Prossimamente</Text>
                </View>
              </TouchableOpacity>
            )}
            {settings.import.excel && (
              <TouchableOpacity
                style={styles.fileCard}
                activeOpacity={0.7}
                onPress={handleExcel}
              >
                <View style={styles.fileIcon}>
                  <Ionicons name="grid" size={24} color={Colors.accent.primary} />
                </View>
                <Text style={styles.fileLabel}>Excel</Text>
                <Text style={styles.fileDesc}>File .xlsx</Text>
              </TouchableOpacity>
            )}
            {settings.import.csv && (
              <TouchableOpacity
                style={styles.fileCard}
                activeOpacity={0.7}
                onPress={handleCSV}
              >
                <View style={styles.fileIcon}>
                  <Ionicons name="list" size={24} color={Colors.accent.primary} />
                </View>
                <Text style={styles.fileLabel}>CSV</Text>
                <Text style={styles.fileDesc}>File CSV</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Manual entry */}
        {settings.import.manual && (
          <View style={styles.manualSection}>
            <Text style={styles.sectionTitle}>Inserimento Manuale</Text>
            <Text style={styles.manualDesc}>
              Aggiungi una transazione compilando il modulo a mano.
            </Text>
            <Button
              label="Inserisci Manualmente"
              onPress={() => router.push('/add-transaction')}
              fullWidth
            />
          </View>
        )}

        {/* Note */}
        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={14} color={Colors.text.muted} />
          <Text style={styles.noteText}>
            Tutti i dati rimangono sul dispositivo. Nessun dato viene inviato a server esterni.
          </Text>
        </View>

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
    gap: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
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
  loadingText: {
    ...Typography.body,
    color: Colors.text.secondary,
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
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  fileGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  fileCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.glow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileLabel: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  fileDesc: {
    ...Typography.micro,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  comingSoonBadge: {
    backgroundColor: Colors.bg.elevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  comingSoonText: {
    ...Typography.micro,
    color: Colors.text.muted,
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
  // Preview styles
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  bankChipText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    fontWeight: '600',
  },
  previewCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 6,
  },
  previewCount: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  previewSkipped: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  sampleCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  sampleTitle: {
    ...Typography.caption,
    color: Colors.text.muted,
    paddingVertical: 12,
  },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sampleInfo: {
    flex: 1,
    gap: 2,
  },
  sampleDesc: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  sampleDate: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  sampleAmount: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
  },
  previewActions: {
    gap: 12,
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

  // Done styles
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
