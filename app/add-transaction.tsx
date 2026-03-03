import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Radius } from '../constants/theme';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories';
import type { CategoryId } from '../constants/categories';
import { useData } from '../contexts/DataContext';
import type { TransactionSplit } from '../types';

type TxType = 'expense' | 'income';

export default function AddTransactionScreen() {
  const { addTransaction, accounts } = useData();

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');

  // Account / transfer
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [isTransfer, setIsTransfer] = useState(false);
  const [transferToAccountId, setTransferToAccountId] = useState<string | undefined>(undefined);

  // Tags
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Splits
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([
    { categoryId: 'food', amount: 0 },
  ]);

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleTypeToggle = (t: TxType) => {
    Haptics.selectionAsync();
    setType(t);
    setCategory(null);
    setIsTransfer(false);
    setSplitMode(false);
    setSplits([{ categoryId: 'food', amount: 0 }]);
  };

  // Tags helpers
  function commitTag() {
    const trimmed = tagInput.trim().replace(/^[,\s]+|[,\s]+$/g, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }

  function handleTagInput(v: string) {
    if (v.endsWith(' ') || v.endsWith(',')) {
      setTagInput(v.slice(0, -1));
      commitTag();
    } else {
      setTagInput(v);
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  // Splits helpers
  function addSplitRow() {
    setSplits((prev) => [...prev, { categoryId: 'other', amount: 0 }]);
  }

  function removeSplitRow(idx: number) {
    setSplits((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSplitCategory(idx: number, cat: CategoryId) {
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, categoryId: cat } : s)));
  }

  function updateSplitAmount(idx: number, val: string) {
    const num = parseFloat(val.replace(',', '.')) || 0;
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, amount: num } : s)));
  }

  const splitsTotal = splits.reduce((s, r) => s + r.amount, 0);
  const parsedAmount = parseFloat(amount.replace(',', '.'));

  const handleSubmit = () => {
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Importo non valido', 'Inserisci un importo maggiore di zero.');
      return;
    }
    if (!isTransfer && !category) {
      Alert.alert('Categoria mancante', 'Seleziona una categoria.');
      return;
    }
    if (splitMode && splitsTotal > parsedAmount) {
      Alert.alert('Split non valido', 'La somma degli split supera l\'importo totale.');
      return;
    }
    if (isTransfer && !transferToAccountId) {
      Alert.alert('Conto destinazione mancante', 'Seleziona il conto di destinazione.');
      return;
    }

    const finalAmount = type === 'expense' ? -parsedAmount : parsedAmount;
    const today = new Date().toISOString().split('T')[0];

    addTransaction({
      date: today,
      amount: finalAmount,
      description: description.trim() || (category ? CATEGORIES[category].label : 'Transazione'),
      category: isTransfer ? 'other' : (category ?? 'other'),
      merchant: merchant.trim() || undefined,
      note: note.trim() || undefined,
      accountId: accountId || undefined,
      transferToAccountId: isTransfer ? transferToAccountId : undefined,
      isTransfer: isTransfer || undefined,
      splits: splitMode && splits.length > 0 ? splits : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const isValid = parsedAmount > 0 && (isTransfer || category !== null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Nuova Transazione</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type Toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'expense' && styles.typeBtnExpense]}
            onPress={() => handleTypeToggle('expense')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-down-circle"
              size={18}
              color={type === 'expense' ? '#fff' : Colors.text.muted}
            />
            <Text style={[styles.typeBtnLabel, type === 'expense' && styles.typeBtnLabelActive]}>
              Uscita
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'income' && styles.typeBtnIncome]}
            onPress={() => handleTypeToggle('income')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-up-circle"
              size={18}
              color={type === 'income' ? '#fff' : Colors.text.muted}
            />
            <Text style={[styles.typeBtnLabel, type === 'income' && styles.typeBtnLabelActive]}>
              Entrata
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={styles.amountBlock}>
          <Text style={styles.currencySymbol}>€</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00"
            placeholderTextColor={Colors.text.muted}
            keyboardType="decimal-pad"
            maxLength={10}
          />
        </View>

        {/* Account selector */}
        {accounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Conto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !accountId && styles.chipActive]}
                onPress={() => { setAccountId(undefined); setIsTransfer(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipLabel, !accountId && styles.chipLabelActive]}>Nessuno</Text>
              </TouchableOpacity>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.chip, accountId === acc.id && styles.chipActive]}
                  onPress={() => { setAccountId(acc.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipLabel, accountId === acc.id && styles.chipLabelActive]}>
                    {acc.accountLabel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Transfer toggle */}
            {accountId && (
              <View style={styles.transferRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, isTransfer && styles.toggleBtnActive]}
                  onPress={() => { setIsTransfer((v) => !v); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={16}
                    color={isTransfer ? Colors.accent.primary : Colors.text.muted}
                  />
                  <Text style={[styles.toggleLabel, isTransfer && styles.toggleLabelActive]}>
                    Trasferimento tra conti
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Transfer destination */}
            {isTransfer && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Conto destinazione</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.chip, transferToAccountId === acc.id && styles.chipActive]}
                        onPress={() => setTransferToAccountId(acc.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipLabel, transferToAccountId === acc.id && styles.chipLabelActive]}>
                          {acc.accountLabel}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Category grid — hidden for transfers */}
        {!isTransfer && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Categoria</Text>
            <View style={styles.categoryGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catItem,
                    category === cat.id && { borderColor: cat.color, backgroundColor: cat.bgColor },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategory(cat.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catIcon, { backgroundColor: cat.bgColor }]}>
                    <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                  </View>
                  <Text
                    style={[
                      styles.catLabel,
                      category === cat.id && { color: cat.color, fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Fields */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Dettagli</Text>
          <View style={styles.fieldsCard}>
            <FieldRow
              icon="document-text-outline"
              placeholder="Descrizione"
              value={description}
              onChangeText={setDescription}
            />
            <View style={styles.fieldDivider} />
            <FieldRow
              icon="storefront-outline"
              placeholder="Merchant (opzionale)"
              value={merchant}
              onChangeText={setMerchant}
            />
            <View style={styles.fieldDivider} />
            <FieldRow
              icon="chatbubble-outline"
              placeholder="Nota (opzionale)"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <View style={styles.fieldDivider} />

            {/* Tags */}
            <View style={styles.tagsRow}>
              <Ionicons name="pricetag-outline" size={18} color={Colors.text.muted} />
              <View style={styles.tagsContent}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipLabel}>{tag}</Text>
                    <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={8}>
                      <Ionicons name="close" size={12} color={Colors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TextInput
                  style={styles.tagInput}
                  placeholder={tags.length === 0 ? 'Tag (spazio per aggiungere)' : ''}
                  placeholderTextColor={Colors.text.muted}
                  value={tagInput}
                  onChangeText={handleTagInput}
                  onSubmitEditing={commitTag}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Split mode toggle */}
            {!isTransfer && (
              <>
                <View style={styles.fieldDivider} />
                <TouchableOpacity
                  style={styles.splitToggleRow}
                  onPress={() => { setSplitMode((v) => !v); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="git-branch-outline"
                    size={18}
                    color={splitMode ? Colors.accent.primary : Colors.text.muted}
                  />
                  <Text style={[styles.fieldInput, splitMode && { color: Colors.accent.primary }]}>
                    Dividi per categoria
                  </Text>
                  <Ionicons
                    name={splitMode ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.text.muted}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Split rows */}
        {splitMode && !isTransfer && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Split — totale: €{splitsTotal.toFixed(2)}
              {parsedAmount > 0 && splitsTotal > parsedAmount ? (
                <Text style={{ color: Colors.semantic.danger }}> (supera importo)</Text>
              ) : null}
            </Text>
            {splits.map((split, idx) => (
              <View key={idx} style={styles.splitRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.splitCatRow}>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.splitCatChip, split.categoryId === cat.id && { backgroundColor: cat.bgColor, borderColor: cat.color }]}
                      onPress={() => updateSplitCategory(idx, cat.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.splitCatLabel, split.categoryId === cat.id && { color: cat.color }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.splitAmountRow}>
                  <TextInput
                    style={styles.splitAmountInput}
                    value={split.amount > 0 ? String(split.amount) : ''}
                    onChangeText={(v) => updateSplitAmount(idx, v)}
                    placeholder="€"
                    placeholderTextColor={Colors.text.muted}
                    keyboardType="decimal-pad"
                  />
                  {splits.length > 1 && (
                    <TouchableOpacity onPress={() => removeSplitRow(idx)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={Colors.semantic.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.addSplitBtn} onPress={addSplitRow} activeOpacity={0.7}>
              <Ionicons name="add" size={16} color={Colors.accent.primary} />
              <Text style={styles.addSplitLabel}>Aggiungi voce</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={!isValid}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.submitLabel}>Salva Transazione</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldRow({
  icon,
  placeholder,
  value,
  onChangeText,
  multiline,
}: {
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, multiline && styles.fieldRowMultiline]}>
      <Ionicons
        name={icon as any}
        size={18}
        color={Colors.text.muted}
        style={multiline ? { marginTop: 2 } : undefined}
      />
      <TextInput
        style={[styles.fieldInput, multiline && { minHeight: 60, textAlignVertical: 'top' }]}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.muted}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  title: { ...Typography.h3, color: Colors.text.primary },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 4,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  typeBtnExpense: { backgroundColor: Colors.semantic.danger },
  typeBtnIncome: { backgroundColor: Colors.semantic.success },
  typeBtnLabel: { ...Typography.bodyMedium, color: Colors.text.muted, fontWeight: '600' },
  typeBtnLabelActive: { color: '#fff' },
  amountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  currencySymbol: { fontSize: 32, fontWeight: '700', color: Colors.text.secondary },
  amountInput: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -2,
    minWidth: 120,
  },
  section: { gap: 10 },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  // Account / transfer
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  chipActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  chipLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  chipLabelActive: { color: Colors.accent.primary },
  transferRow: { marginTop: 4 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignSelf: 'flex-start',
  },
  toggleBtnActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.glow },
  toggleLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  toggleLabelActive: { color: Colors.accent.primary },
  // Category grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catItem: {
    width: '22%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catLabel: { ...Typography.micro, color: Colors.text.secondary, textAlign: 'center' },
  // Fields
  fieldsCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  fieldInput: {
    flex: 1,
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  fieldRowMultiline: { alignItems: 'flex-start' },
  fieldDivider: { height: 1, backgroundColor: Colors.border.subtle },
  // Tags
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  tagsContent: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.glow,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  tagChipLabel: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },
  tagInput: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    minWidth: 120,
    paddingVertical: 2,
  },
  // Split toggle
  splitToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  // Split rows
  splitRow: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 10,
    gap: 8,
  },
  splitCatRow: { flexDirection: 'row', gap: 6 },
  splitCatChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  splitCatLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  splitAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitAmountInput: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    borderStyle: 'dashed',
  },
  addSplitLabel: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },
  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.lg,
    paddingVertical: 16,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitLabel: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
});
