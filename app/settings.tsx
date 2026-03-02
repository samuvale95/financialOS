import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius, Spacing } from '../constants/theme';
import { useSettings } from '../contexts/SettingsContext';
import { useData } from '../contexts/DataContext';
import { ITALIAN_BANKS } from '../constants/italianBanks';
import type { ItalianBank } from '../constants/italianBanks';
import type { BankAccount } from '../types';

// ── Shared ──────────────────────────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

function SettingRow({ label, description, value, onToggle }: SettingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowDesc}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.bg.elevated, true: Colors.accent.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// ── BankPicker (inline) ─────────────────────────────────────────────────────

interface BankPickerProps {
  onConfirm: (acc: Omit<BankAccount, 'id'>) => void;
  onCancel: () => void;
}

function BankPickerForm({ onConfirm, onCancel }: BankPickerProps) {
  const [bankQuery, setBankQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<ItalianBank | null>(null);
  const [label, setLabel] = useState('');
  const [balanceStr, setBalanceStr] = useState('');

  const filteredBanks = useMemo(() => {
    if (!bankQuery) return ITALIAN_BANKS.slice(0, 8);
    const q = bankQuery.toLowerCase();
    return ITALIAN_BANKS.filter(
      (b) => b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [bankQuery]);

  const canConfirm =
    selectedBank !== null &&
    label.trim().length > 0 &&
    balanceStr.length > 0;

  const handleConfirm = () => {
    if (!selectedBank || !canConfirm) return;
    onConfirm({
      bankId: selectedBank.id,
      bankName: selectedBank.name,
      accountLabel: label.trim(),
      balance: parseFloat(balanceStr.replace(',', '.')) || 0,
      lastUpdated: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.pickerForm}>
      {!selectedBank ? (
        <>
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca la tua banca…"
            placeholderTextColor={Colors.text.muted}
            value={bankQuery}
            onChangeText={setBankQuery}
            autoFocus
          />
          <ScrollView style={styles.bankList} nestedScrollEnabled>
            {filteredBanks.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.bankRow}
                onPress={() => setSelectedBank(b)}
                activeOpacity={0.7}
              >
                <View style={[styles.bankBadge, { backgroundColor: b.color + '33' }]}>
                  <Text style={[styles.bankBadgeText, { color: b.color }]}>{b.shortName[0]}</Text>
                </View>
                <Text style={styles.bankRowName}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.bankSelected}>
            <View style={[styles.bankBadge, { backgroundColor: selectedBank.color + '33' }]}>
              <Text style={[styles.bankBadgeText, { color: selectedBank.color }]}>
                {selectedBank.shortName[0]}
              </Text>
            </View>
            <Text style={styles.bankSelectedName}>{selectedBank.name}</Text>
            <TouchableOpacity onPress={() => setSelectedBank(null)}>
              <Ionicons name="close-circle" size={20} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.textInput}
            placeholder='Label (es. "Conto corrente")'
            placeholderTextColor={Colors.text.muted}
            value={label}
            onChangeText={setLabel}
          />
          <TextInput
            style={styles.textInput}
            placeholder="Saldo attuale (€)"
            placeholderTextColor={Colors.text.muted}
            value={balanceStr}
            onChangeText={setBalanceStr}
            keyboardType="decimal-pad"
          />
        </>
      )}
      <View style={styles.pickerActions}>
        <TouchableOpacity style={styles.ghostBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.ghostBtnText}>Annulla</Text>
        </TouchableOpacity>
        {selectedBank && (
          <TouchableOpacity
            style={[styles.accentBtn, !canConfirm && styles.accentBtnDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.8}
          >
            <Text style={styles.accentBtnText}>Conferma</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── AccountRow ──────────────────────────────────────────────────────────────

interface AccountRowProps {
  account: BankAccount;
  onUpdate: (id: string, updates: Partial<BankAccount>) => void;
  onDelete: (id: string) => void;
}

function AccountRow({ account, onUpdate, onDelete }: AccountRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editLabel, setEditLabel] = useState(account.accountLabel);
  const [editBalance, setEditBalance] = useState(String(account.balance));

  const bank = ITALIAN_BANKS.find((b) => b.id === account.bankId);
  const color = bank?.color ?? Colors.accent.primary;

  const handleSave = () => {
    onUpdate(account.id, {
      accountLabel: editLabel.trim() || account.accountLabel,
      balance: parseFloat(editBalance.replace(',', '.')) || account.balance,
      lastUpdated: new Date().toISOString(),
    });
    setExpanded(false);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.accountRow}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
      >
        <View style={[styles.accountBadge, { backgroundColor: color + '33' }]}>
          <Text style={[styles.accountBadgeText, { color }]}>
            {account.bankName[0]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.accountName}>{account.bankName}</Text>
          <Text style={styles.accountLabel}>{account.accountLabel}</Text>
        </View>
        <Text style={styles.accountBalance}>€{account.balance.toLocaleString('it-IT')}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-forward'}
          size={16}
          color={Colors.text.muted}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.accountExpanded}>
          <TextInput
            style={styles.textInput}
            value={editLabel}
            onChangeText={setEditLabel}
            placeholder="Label"
            placeholderTextColor={Colors.text.muted}
          />
          <TextInput
            style={styles.textInput}
            value={editBalance}
            onChangeText={setEditBalance}
            placeholder="Saldo"
            placeholderTextColor={Colors.text.muted}
            keyboardType="decimal-pad"
          />
          <View style={styles.expandedActions}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDelete(account.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.semantic.danger} />
              <Text style={styles.deleteBtnText}>Elimina</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.accentBtn}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={styles.accentBtnText}>Salva</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Settings Screen ────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const { accounts, addAccount, updateAccount, deleteAccount, resetAll } = useData();
  const [showAddAccount, setShowAddAccount] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Impostazioni</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Conti bancari */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTI BANCARI</Text>
          <View style={styles.card}>
            {accounts.length === 0 && !showAddAccount && (
              <View style={styles.emptyAccounts}>
                <Text style={styles.rowDesc}>Nessun conto aggiunto</Text>
              </View>
            )}
            {accounts.map((acc, i) => (
              <View key={acc.id}>
                <AccountRow
                  account={acc}
                  onUpdate={updateAccount}
                  onDelete={deleteAccount}
                />
                {i < accounts.length - 1 && <View style={styles.separator} />}
              </View>
            ))}
            {accounts.length > 0 && !showAddAccount && (
              <View style={styles.separator} />
            )}
            {showAddAccount ? (
              <BankPickerForm
                onConfirm={(acc) => {
                  addAccount(acc);
                  setShowAddAccount(false);
                }}
                onCancel={() => setShowAddAccount(false)}
              />
            ) : (
              <TouchableOpacity
                style={styles.addRow}
                onPress={() => setShowAddAccount(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle" size={20} color={Colors.accent.primary} />
                <Text style={styles.addRowText}>Aggiungi conto</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Funzionalità */}
        <Section title="Funzionalità">
          <SettingRow
            label="Budget"
            description="Traccia i limiti di spesa per categoria"
            value={settings.features.budgets}
            onToggle={(v) => updateSetting('features', 'budgets', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Obiettivi"
            description="Monitora i tuoi obiettivi di risparmio"
            value={settings.features.goals}
            onToggle={(v) => updateSetting('features', 'goals', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Portfolio"
            description="Gestisci i tuoi investimenti"
            value={settings.features.portfolio}
            onToggle={(v) => updateSetting('features', 'portfolio', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Coach AI"
            description="Ricevi consigli finanziari personalizzati"
            value={settings.features.coach}
            onToggle={(v) => updateSetting('features', 'coach', v)}
          />
        </Section>

        {/* Importazione */}
        <Section title="Importazione">
          <SettingRow
            label="PDF"
            description="Importa estratti conto in PDF"
            value={settings.import.pdf}
            onToggle={(v) => updateSetting('import', 'pdf', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Excel"
            description="Importa file Excel (.xlsx)"
            value={settings.import.excel}
            onToggle={(v) => updateSetting('import', 'excel', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="CSV"
            description="Importa file CSV"
            value={settings.import.csv}
            onToggle={(v) => updateSetting('import', 'csv', v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Inserimento Manuale"
            description="Aggiungi transazioni a mano"
            value={settings.import.manual}
            onToggle={(v) => updateSetting('import', 'manual', v)}
          />
        </Section>

        {/* Preferenze */}
        <Section title="Preferenze">
          <SettingRow
            label="Feedback Aptico"
            description="Vibrazione al tocco"
            value={settings.preferences.haptics}
            onToggle={(v) => updateSetting('preferences', 'haptics', v)}
          />
        </Section>

        {/* Developer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEVELOPER</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.resetRow}
              onPress={() =>
                Alert.alert(
                  'Reset completo',
                  'Verranno cancellati tutti i dati: transazioni, budget, investimenti, conti e configurazione onboarding. L\'app ripartirà dal primo accesso.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    {
                      text: 'Cancella tutto',
                      style: 'destructive',
                      onPress: async () => {
                        await resetAll();
                        router.replace('/onboarding');
                      },
                    },
                  ]
                )
              }
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.semantic.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resetLabel}>Cancella tutti i dati</Text>
                <Text style={styles.resetDesc}>Riparte dall'onboarding come al primo accesso</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.text.muted} />
          <View style={styles.infoText}>
            <Text style={styles.infoApp}>FinancialOS</Text>
            <Text style={styles.infoVersion}>Versione 1.0.0</Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  title: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 24,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 16,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowLabel: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  rowDesc: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.subtle,
  },

  // Account rows
  emptyAccounts: { paddingVertical: 14 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  accountBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountBadgeText: { fontWeight: '700', fontSize: 14 },
  accountName: { ...Typography.bodyMedium, color: Colors.text.primary },
  accountLabel: { ...Typography.caption, color: Colors.text.muted },
  accountBalance: { ...Typography.bodyMedium, color: Colors.semantic.success, fontWeight: '600' },
  accountExpanded: {
    paddingBottom: 12,
    gap: Spacing.sm,
  },
  expandedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteBtnText: { ...Typography.caption, color: Colors.semantic.danger },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  addRowText: { ...Typography.bodyMedium, color: Colors.accent.primary },

  // BankPicker
  pickerForm: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  bankList: { maxHeight: 220 },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  bankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankBadgeText: { fontWeight: '700', fontSize: 14 },
  bankRowName: { ...Typography.bodyMedium, color: Colors.text.primary, flex: 1 },
  bankSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  bankSelectedName: { ...Typography.bodyMedium, color: Colors.text.primary, flex: 1 },
  pickerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
  },

  // Buttons
  accentBtn: {
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  accentBtnDisabled: { opacity: 0.4 },
  accentBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  ghostBtn: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ghostBtnText: { ...Typography.bodyMedium, color: Colors.text.secondary },
  searchInput: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    ...Typography.body,
  },
  textInput: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    ...Typography.body,
  },

  // Developer section
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  resetLabel: {
    ...Typography.bodyMedium,
    color: Colors.semantic.danger,
  },
  resetDesc: {
    ...Typography.caption,
    color: Colors.text.muted,
    marginTop: 2,
  },

  // Info card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
  },
  infoText: { gap: 2 },
  infoApp: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  infoVersion: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
});
