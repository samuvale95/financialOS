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

type TxType = 'expense' | 'income';

export default function AddTransactionScreen() {
  const { addTransaction } = useData();

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleTypeToggle = (t: TxType) => {
    Haptics.selectionAsync();
    setType(t);
    setCategory(null);
  };

  const handleSubmit = () => {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0) {
      Alert.alert('Importo non valido', 'Inserisci un importo maggiore di zero.');
      return;
    }
    if (!category) {
      Alert.alert('Categoria mancante', 'Seleziona una categoria.');
      return;
    }

    const finalAmount = type === 'expense' ? -parsed : parsed;
    const today = new Date().toISOString().split('T')[0];

    addTransaction({
      date: today,
      amount: finalAmount,
      description: description.trim() || (category ? CATEGORIES[category].label : 'Transazione'),
      category,
      merchant: merchant.trim() || undefined,
      note: note.trim() || undefined,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const isValid = parseFloat(amount.replace(',', '.')) > 0 && category !== null;

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

        {/* Category grid */}
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
          </View>
        </View>

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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
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
  catLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
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
