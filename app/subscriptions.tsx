import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Radius, Touch } from '../constants/theme';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../constants/categories';
import type { CategoryId } from '../constants/categories';
import { useData } from '../contexts/DataContext';
import type { Subscription, SubscriptionFrequency } from '../types';

const SUB_COLORS = ['#6C63FF', '#00D68F', '#FFB347', '#FF6B6B', '#4FC3F7', '#BF5AF2'];

export function toMonthly(s: Subscription): number {
  if (s.frequency === 'monthly') return s.amount;
  if (s.frequency === 'quarterly') return s.amount / 3;
  return s.amount / 12;
}

const FREQ_LABELS: Record<SubscriptionFrequency, string> = {
  monthly: 'Mensile',
  quarterly: 'Trimestrale',
  annual: 'Annuale',
};

type FormState = {
  name: string;
  emoji: string;
  amount: string;
  frequency: SubscriptionFrequency;
  nextDueDate: string;
  category: CategoryId;
  color: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  emoji: '',
  amount: '',
  frequency: 'monthly',
  nextDueDate: '',
  category: 'subscriptions',
  color: SUB_COLORS[0],
};

export default function SubscriptionsScreen() {
  const { subscriptions, addSubscription, updateSubscription, deleteSubscription } = useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const totalMonthly = subscriptions
    .filter((s) => s.active)
    .reduce((sum, s) => sum + toMonthly(s), 0);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowAdd(true);
    Haptics.selectionAsync();
  }

  function openEdit(sub: Subscription) {
    setForm({
      name: sub.name,
      emoji: sub.emoji ?? '',
      amount: String(sub.amount),
      frequency: sub.frequency,
      nextDueDate: sub.nextDueDate,
      category: sub.category,
      color: sub.color,
    });
    setEditingId(sub.id);
    setShowAdd(true);
    Haptics.selectionAsync();
  }

  function cancelForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!form.name.trim()) {
      Alert.alert('Nome mancante', 'Inserisci il nome dell\'abbonamento.');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Importo non valido', 'Inserisci un importo maggiore di zero.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const subData = {
      name: form.name.trim(),
      emoji: form.emoji || undefined,
      amount,
      frequency: form.frequency,
      nextDueDate: form.nextDueDate || today,
      category: form.category,
      color: form.color,
      active: true,
    };
    if (editingId) {
      updateSubscription(editingId, subData);
    } else {
      addSubscription(subData);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelForm();
  }

  function handleDelete(id: string, name: string) {
    Alert.alert(
      'Elimina abbonamento',
      `Sei sicuro di voler eliminare "${name}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            deleteSubscription(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Abbonamenti</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Monthly total */}
      <View style={styles.totalBanner}>
        <Text style={styles.totalLabel}>Impatto mensile totale</Text>
        <Text style={styles.totalAmount}>€{totalMonthly.toFixed(2)}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Inline form */}
        {showAdd && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editingId ? 'Modifica Abbonamento' : 'Nuovo Abbonamento'}</Text>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.emojiInput]}
                value={form.emoji}
                onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))}
                placeholder="📱"
                placeholderTextColor={Colors.text.muted}
                maxLength={4}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Nome abbonamento"
                placeholderTextColor={Colors.text.muted}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Importo (€)</Text>
                <TextInput
                  style={styles.input}
                  value={form.amount}
                  onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                  placeholder="9,99"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prossima scadenza</Text>
                <TextInput
                  style={styles.input}
                  value={form.nextDueDate}
                  onChangeText={(v) => setForm((f) => ({ ...f, nextDueDate: v }))}
                  placeholder="2026-04-01"
                  placeholderTextColor={Colors.text.muted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Frequenza</Text>
              <View style={styles.freqRow}>
                {(['monthly', 'quarterly', 'annual'] as SubscriptionFrequency[]).map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.freqBtn, form.frequency === freq && styles.freqBtnActive]}
                    onPress={() => setForm((f) => ({ ...f, frequency: freq }))}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.freqLabel, form.frequency === freq && styles.freqLabelActive]}>
                      {FREQ_LABELS[freq]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, form.category === cat.id && { backgroundColor: cat.bgColor, borderColor: cat.color }]}
                    onPress={() => setForm((f) => ({ ...f, category: cat.id }))}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={cat.icon as any} size={14} color={form.category === cat.id ? cat.color : Colors.text.muted} />
                    <Text style={[styles.catChipLabel, form.category === cat.id && { color: cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Colore</Text>
              <View style={styles.colorRow}>
                {SUB_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorDotSelected]}
                    onPress={() => setForm((f) => ({ ...f, color: c }))}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelForm} activeOpacity={0.7}>
                <Text style={styles.cancelLabel}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                <Text style={styles.saveLabel}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Subscriptions list */}
        {subscriptions.length === 0 && !showAdd ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📱</Text>
            <Text style={styles.emptyTitle}>Nessun abbonamento</Text>
            <Text style={styles.emptyBody}>Aggiungi i tuoi abbonamenti per tenere traccia delle spese ricorrenti.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Aggiungi Abbonamento</Text>
            </TouchableOpacity>
          </View>
        ) : (
          subscriptions.map((sub) => {
            const cat = CATEGORIES[sub.category];
            const monthly = toMonthly(sub);
            return (
              <View key={sub.id} style={[styles.subCard, !sub.active && styles.subCardInactive]}>
                <View style={styles.subLeft}>
                  <View style={[styles.subDot, { backgroundColor: sub.color }]}>
                    <Text style={styles.subEmoji}>{sub.emoji || cat.label.charAt(0)}</Text>
                  </View>
                  <View style={styles.subInfo}>
                    <Text style={styles.subName}>{sub.name}</Text>
                    <Text style={styles.subMeta}>
                      €{sub.amount} · {FREQ_LABELS[sub.frequency]} · {sub.nextDueDate}
                    </Text>
                  </View>
                </View>
                <View style={styles.subRight}>
                  <Text style={[styles.subMonthly, !sub.active && { color: Colors.text.muted }]}>
                    €{monthly.toFixed(2)}/m
                  </Text>
                  <Switch
                    value={sub.active}
                    onValueChange={(v) => {
                      updateSubscription(sub.id, { active: v });
                      Haptics.selectionAsync();
                    }}
                    trackColor={{ false: Colors.bg.secondary, true: Colors.accent.glow }}
                    thumbColor={sub.active ? Colors.accent.primary : Colors.text.muted}
                    ios_backgroundColor={Colors.bg.secondary}
                  />
                  <TouchableOpacity onPress={() => openEdit(sub)} style={styles.actionBtn} activeOpacity={0.7}>
                    <Ionicons name="pencil-outline" size={15} color={Colors.text.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(sub.id, sub.name)} style={styles.actionBtn} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={15} color={Colors.semantic.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
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
    width: Touch.sm,
    height: Touch.sm,
    borderRadius: Touch.sm / 2,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  addBtn: {
    width: Touch.sm,
    height: Touch.sm,
    borderRadius: Touch.sm / 2,
    backgroundColor: Colors.accent.glow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  totalLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  totalAmount: { ...Typography.h3, color: Colors.text.primary },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  // Form
  formCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: 16,
    gap: 12,
  },
  formTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  inputGroup: { gap: 6 },
  inputLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  emojiInput: { width: 52, textAlign: 'center', fontSize: 20 },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  freqBtnActive: { backgroundColor: Colors.accent.glow, borderColor: Colors.accent.primary },
  freqLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  freqLabelActive: { color: Colors.accent.primary },
  catRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  catChipLabel: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  colorRow: { flexDirection: 'row', gap: 8 },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: { borderColor: Colors.text.primary, transform: [{ scale: 1.15 }] },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  cancelLabel: { ...Typography.bodyMedium, color: Colors.text.secondary, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
  },
  saveLabel: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { ...Typography.h3, color: Colors.text.primary },
  emptyBody: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center' },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  emptyBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },

  // Sub card
  subCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subCardInactive: { opacity: 0.5 },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  subDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subEmoji: { fontSize: 18 },
  subInfo: { flex: 1 },
  subName: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  subMeta: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subMonthly: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '700' },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
