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
import { Colors, Typography, Radius, Touch } from '../constants/theme';
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

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Summary header ────────────────────────────────────────────────────────────

function GoalsSummary({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const overallPct = totalTarget > 0 ? Math.min(totalSaved / totalTarget, 1) : 0;
  const completed = goals.filter((g) => g.savedAmount >= g.targetAmount).length;

  return (
    <View style={s.summaryCard}>
      <View style={s.summaryRow}>
        <View style={s.summaryItem}>
          <Text style={s.summaryValue}>€{fmt(totalSaved)}</Text>
          <Text style={s.summaryLabel}>Risparmiato</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryValue}>€{fmt(totalTarget - totalSaved)}</Text>
          <Text style={s.summaryLabel}>Mancante</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryValue, { color: Colors.accent.primary }]}>
            {Math.round(overallPct * 100)}%
          </Text>
          <Text style={s.summaryLabel}>Completato</Text>
        </View>
      </View>

      {/* Segmented progress bar */}
      <View style={s.segmentTrack}>
        {goals.map((g) => {
          const w = totalTarget > 0 ? (g.savedAmount / totalTarget) * 100 : 0;
          return w > 0 ? (
            <View
              key={g.id}
              style={[s.segmentFill, { width: `${w}%` as any, backgroundColor: g.color }]}
            />
          ) : null;
        })}
      </View>

      {completed > 0 && (
        <Text style={s.completedPill}>
          {completed} {completed === 1 ? 'obiettivo completato' : 'obiettivi completati'} 🎉
        </Text>
      )}
    </View>
  );
}

// ── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  monthlySavings,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  monthlySavings: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const progress = goal.targetAmount > 0 ? Math.min(goal.savedAmount / goal.targetAmount, 1) : 0;
  const pct = Math.round(progress * 100);
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const isComplete = progress >= 1;

  const now = new Date();
  const deadline = goal.targetDate ? new Date(goal.targetDate) : null;
  const monthsToDeadline = deadline ? monthsBetween(now, deadline) : null;

  // Projection: months needed at current savings pace
  const monthsNeeded =
    !isComplete && monthlySavings > 0 ? Math.ceil(remaining / monthlySavings) : null;

  // Status
  type Status = 'complete' | 'on-track' | 'off-track' | 'unknown';
  let status: Status = 'unknown';
  if (isComplete) {
    status = 'complete';
  } else if (monthsNeeded !== null && monthsToDeadline !== null) {
    status = monthsNeeded <= monthsToDeadline ? 'on-track' : 'off-track';
  } else if (monthsNeeded !== null) {
    status = 'on-track'; // no deadline set, just show projection
  }

  const statusConfig: Record<Status, { label: string; color: string; bg: string }> = {
    complete: { label: 'Completato', color: Colors.semantic.success, bg: Colors.semantic.success + '20' },
    'on-track': { label: 'In linea', color: Colors.semantic.success, bg: Colors.semantic.success + '20' },
    'off-track': { label: 'In ritardo', color: Colors.semantic.danger, bg: Colors.semantic.danger + '20' },
    unknown: { label: 'Nessun dato', color: Colors.text.muted, bg: Colors.bg.secondary },
  };
  const { label: statusLabel, color: statusColor, bg: statusBg } = statusConfig[status];

  // Deadline label
  let deadlineLabel = '';
  if (isComplete) {
    deadlineLabel = 'Obiettivo raggiunto!';
  } else if (monthsToDeadline !== null) {
    if (monthsToDeadline <= 0) deadlineLabel = 'Scadenza superata';
    else if (monthsToDeadline === 1) deadlineLabel = '1 mese alla scadenza';
    else deadlineLabel = `${monthsToDeadline} mesi alla scadenza`;
  }

  // Projection label
  let projectionLabel = '';
  if (isComplete) {
    projectionLabel = '';
  } else if (monthlySavings <= 0) {
    projectionLabel = 'Aggiungi dati di risparmio';
  } else if (monthsNeeded !== null) {
    projectionLabel =
      monthsNeeded <= 1
        ? 'Raggiungerai il target il prossimo mese'
        : `Raggiungerai il target in ~${monthsNeeded} mesi`;
  }

  return (
    <View style={[s.goalCard, isComplete && s.goalCardComplete]}>
      {/* Header */}
      <View style={s.goalHeader}>
        <Text style={s.goalEmoji}>{goal.emoji}</Text>
        <View style={s.goalInfo}>
          <Text style={s.goalTitle}>{goal.title}</Text>
          {deadlineLabel ? (
            <Text style={[s.goalDeadline, monthsToDeadline !== null && monthsToDeadline <= 0 && !isComplete && { color: Colors.semantic.danger }]}>
              {deadlineLabel}
            </Text>
          ) : null}
        </View>
        <View style={s.goalRight}>
          <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <View style={s.goalActions}>
            <TouchableOpacity onPress={onEdit} style={s.actionBtn} activeOpacity={0.7}>
              <Ionicons name="pencil-outline" size={15} color={Colors.text.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={s.actionBtn} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={15} color={Colors.semantic.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Prominent progress bar */}
      <View style={s.progressWrap}>
        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              {
                width: `${pct}%` as any,
                backgroundColor: isComplete ? Colors.semantic.success : goal.color,
              },
            ]}
          />
        </View>
        <Text style={[s.progressPct, { color: isComplete ? Colors.semantic.success : goal.color }]}>
          {pct}%
        </Text>
      </View>

      {/* Amounts row */}
      <View style={s.amountsRow}>
        <View>
          <Text style={s.amountMain}>€{fmt(goal.savedAmount)}</Text>
          <Text style={s.amountSub}>di €{fmt(goal.targetAmount)}</Text>
        </View>
        {!isComplete && (
          <View style={s.remainingPill}>
            <Text style={s.remainingLabel}>mancano €{fmt(remaining)}</Text>
          </View>
        )}
      </View>

      {/* Projection */}
      {projectionLabel ? (
        <View style={s.projectionRow}>
          <Ionicons
            name={status === 'off-track' ? 'warning-outline' : 'trending-up-outline'}
            size={13}
            color={statusColor}
          />
          <Text style={[s.projectionText, { color: statusColor }]}>{projectionLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { goals, addGoal, updateGoal, deleteGoal, monthSummary } = useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Monthly savings to use for projections
  const monthlySavings = monthSummary?.savings ?? 0;

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
      Alert.alert('Titolo mancante', "Inserisci un nome per l'obiettivo.");
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
      targetDate:
        form.targetDate ||
        new Date(new Date().setFullYear(new Date().getFullYear() + 1))
          .toISOString()
          .split('T')[0],
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
    Alert.alert('Elimina obiettivo', `Sei sicuro di voler eliminare "${title}"?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          deleteGoal(id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={s.title}>Obiettivi</Text>
        <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Inline form */}
        {showAdd && (
          <View style={s.formCard}>
            <Text style={s.formTitle}>{editingId ? 'Modifica Obiettivo' : 'Nuovo Obiettivo'}</Text>

            <View style={s.row}>
              <TextInput
                style={[s.input, s.emojiInput]}
                value={form.emoji}
                onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))}
                placeholder="🎯"
                placeholderTextColor={Colors.text.muted}
                maxLength={4}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder="Nome obiettivo"
                placeholderTextColor={Colors.text.muted}
              />
            </View>

            <View style={s.row}>
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Target (€)</Text>
                <TextInput
                  style={s.input}
                  value={form.targetAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, targetAmount: v }))}
                  placeholder="10000"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Risparmiato (€)</Text>
                <TextInput
                  style={s.input}
                  value={form.savedAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, savedAmount: v }))}
                  placeholder="0"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Scadenza (AAAA-MM-GG)</Text>
              <TextInput
                style={s.input}
                value={form.targetDate}
                onChangeText={(v) => setForm((f) => ({ ...f, targetDate: v }))}
                placeholder="2027-12-31"
                placeholderTextColor={Colors.text.muted}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Colore</Text>
              <View style={s.colorRow}>
                {GOAL_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      s.colorDot,
                      { backgroundColor: c },
                      form.color === c && s.colorDotSelected,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, color: c }))}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <View style={s.formActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={cancelForm} activeOpacity={0.7}>
                <Text style={s.cancelLabel}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                <Text style={s.saveLabel}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Summary */}
        <GoalsSummary goals={goals} />

        {/* Goals list */}
        {goals.length === 0 && !showAdd ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>🎯</Text>
            <Text style={s.emptyTitle}>Nessun obiettivo</Text>
            <Text style={s.emptyBody}>Aggiungi il tuo primo obiettivo di risparmio.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Aggiungi Obiettivo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              monthlySavings={monthlySavings}
              onEdit={() => openEdit(goal)}
              onDelete={() => handleDelete(goal.id, goal.title)}
            />
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  // ── Summary card ────────────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: { alignItems: 'center', gap: 3, flex: 1 },
  summaryValue: { ...Typography.h3, color: Colors.text.primary, fontWeight: '700' },
  summaryLabel: { ...Typography.micro, color: Colors.text.muted },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border.default,
  },
  segmentTrack: {
    height: 8,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
  },
  segmentFill: {
    height: '100%',
    borderRadius: 4,
  },
  completedPill: {
    ...Typography.caption,
    color: Colors.semantic.success,
    textAlign: 'center',
    fontWeight: '600',
  },

  // ── Goal card ───────────────────────────────────────────────────────────────
  goalCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 16,
    gap: 12,
  },
  goalCardComplete: {
    borderColor: Colors.semantic.success + '40',
  },
  goalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  goalEmoji: { fontSize: 28, marginTop: 2 },
  goalInfo: { flex: 1, gap: 3 },
  goalTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  goalDeadline: { ...Typography.caption, color: Colors.text.muted },
  goalRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusLabel: { ...Typography.micro, fontWeight: '700' },
  goalActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: Touch.xs,
    height: Touch.xs,
    borderRadius: Touch.xs / 2,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Progress bar
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: {
    flex: 1,
    height: 10,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressPct: {
    ...Typography.caption,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },

  // Amounts row
  amountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountMain: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  amountSub: { ...Typography.caption, color: Colors.text.muted, marginTop: 1 },
  remainingPill: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  remainingLabel: { ...Typography.micro, color: Colors.text.secondary, fontWeight: '600' },

  // Projection
  projectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  projectionText: { ...Typography.caption, fontWeight: '600', flex: 1 },

  // ── Form ────────────────────────────────────────────────────────────────────
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

  // ── Empty state ──────────────────────────────────────────────────────────────
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
});
