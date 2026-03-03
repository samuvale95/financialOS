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
import { useData } from '../contexts/DataContext';
import type { Goal } from '../types';

const GOAL_COLORS = ['#6C63FF', '#00D68F', '#FFB347', '#FF6B6B', '#4FC3F7', '#BF5AF2'];

type FormState = {
  title: string;
  emoji: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
  color: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  emoji: '🎯',
  targetAmount: '',
  savedAmount: '',
  targetDate: '',
  color: GOAL_COLORS[0],
};

export default function GoalsScreen() {
  const { goals, addGoal, updateGoal, deleteGoal } = useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowAdd(true);
    Haptics.selectionAsync();
  }

  function openEdit(goal: Goal) {
    setForm({
      title: goal.title,
      emoji: goal.emoji,
      targetAmount: String(goal.targetAmount),
      savedAmount: String(goal.savedAmount),
      targetDate: goal.targetDate,
      color: goal.color,
    });
    setEditingId(goal.id);
    setShowAdd(true);
    Haptics.selectionAsync();
  }

  function cancelForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    const target = parseFloat(form.targetAmount.replace(',', '.'));
    const saved = parseFloat(form.savedAmount.replace(',', '.') || '0');
    if (!form.title.trim()) {
      Alert.alert('Titolo mancante', 'Inserisci un nome per l\'obiettivo.');
      return;
    }
    if (!target || target <= 0) {
      Alert.alert('Importo non valido', 'Inserisci un importo target maggiore di zero.');
      return;
    }
    const goalData = {
      title: form.title.trim(),
      emoji: form.emoji || '🎯',
      targetAmount: target,
      savedAmount: isNaN(saved) ? 0 : saved,
      targetDate: form.targetDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      color: form.color,
    };
    if (editingId) {
      updateGoal(editingId, goalData);
    } else {
      addGoal(goalData);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelForm();
  }

  function handleDelete(id: string, title: string) {
    Alert.alert(
      'Elimina obiettivo',
      `Sei sicuro di voler eliminare "${title}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            deleteGoal(id);
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
        <Text style={styles.title}>Obiettivi</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color={Colors.accent.primary} />
        </TouchableOpacity>
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
            <Text style={styles.formTitle}>{editingId ? 'Modifica Obiettivo' : 'Nuovo Obiettivo'}</Text>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.emojiInput]}
                value={form.emoji}
                onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))}
                placeholder="🎯"
                placeholderTextColor={Colors.text.muted}
                maxLength={4}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder="Nome obiettivo"
                placeholderTextColor={Colors.text.muted}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target (€)</Text>
                <TextInput
                  style={styles.input}
                  value={form.targetAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, targetAmount: v }))}
                  placeholder="10000"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Risparmiato (€)</Text>
                <TextInput
                  style={styles.input}
                  value={form.savedAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, savedAmount: v }))}
                  placeholder="0"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Scadenza (AAAA-MM-GG)</Text>
              <TextInput
                style={styles.input}
                value={form.targetDate}
                onChangeText={(v) => setForm((f) => ({ ...f, targetDate: v }))}
                placeholder="2027-12-31"
                placeholderTextColor={Colors.text.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Colore</Text>
              <View style={styles.colorRow}>
                {GOAL_COLORS.map((c) => (
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

        {/* Goals list */}
        {goals.length === 0 && !showAdd ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>Nessun obiettivo</Text>
            <Text style={styles.emptyBody}>Aggiungi il tuo primo obiettivo di risparmio.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Aggiungi Obiettivo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.map((goal) => {
            const progress = goal.targetAmount > 0 ? Math.min(goal.savedAmount / goal.targetAmount, 1) : 0;
            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    <Text style={styles.goalDates}>Scadenza: {goal.targetDate}</Text>
                  </View>
                  <View style={styles.goalActions}>
                    <TouchableOpacity
                      onPress={() => openEdit(goal)}
                      style={styles.actionBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={16} color={Colors.text.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(goal.id, goal.title)}
                      style={styles.actionBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.semantic.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: goal.color }]} />
                </View>

                <View style={styles.goalAmounts}>
                  <Text style={styles.savedText}>
                    <Text style={{ color: goal.color }}>€{goal.savedAmount.toLocaleString('it-IT')}</Text>
                    {' '}/ €{goal.targetAmount.toLocaleString('it-IT')}
                  </Text>
                  <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.glow,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  inputGroup: { flex: 1, gap: 6 },
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
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
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

  // Goal card
  goalCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 10,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalEmoji: { fontSize: 28 },
  goalInfo: { flex: 1 },
  goalTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  goalDates: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  goalActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savedText: { ...Typography.caption, color: Colors.text.secondary },
  progressPct: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
});
