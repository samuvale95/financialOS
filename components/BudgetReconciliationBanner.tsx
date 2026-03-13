import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Radius } from '../constants/theme';
import { useData } from '../contexts/DataContext';
import type { CategoryId } from '../constants/categories';
import type { ReconciliationResult } from '../utils/profileReconciler';

const DISMISS_FILE = FileSystem.documentDirectory + 'reconciliation_dismissed.json';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Row inside the bottom sheet ───────────────────────────────────────────────

function ReconcileRow({
  result,
  onUpdate,
  done,
}: {
  result: ReconciliationResult;
  onUpdate: () => void;
  done: boolean;
}) {
  const isIncrease = result.suggestion === 'increase';
  const accentColor = isIncrease ? Colors.semantic.danger : Colors.semantic.success;

  return (
    <View style={s.row}>
      <View style={s.rowInfo}>
        <Text style={s.rowCategory}>{result.categoryName}</Text>
        <View style={s.rowAmounts}>
          <Text style={s.rowCurrent}>€{result.estimatedMonthly}</Text>
          <Ionicons
            name={isIncrease ? 'arrow-up' : 'arrow-down'}
            size={12}
            color={accentColor}
            style={{ marginHorizontal: 4 }}
          />
          <Text style={[s.rowReal, { color: accentColor }]}>€{result.realMonthly}</Text>
          <Text style={s.rowPct}> ({result.divergencePct}%)</Text>
        </View>
      </View>
      {done ? (
        <View style={s.doneTag}>
          <Ionicons name="checkmark" size={14} color={Colors.semantic.success} />
        </View>
      ) : (
        <TouchableOpacity
          style={[s.updateBtn, { borderColor: accentColor }]}
          onPress={onUpdate}
          activeOpacity={0.8}
        >
          <Text style={[s.updateBtnText, { color: accentColor }]}>Aggiorna</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BudgetReconciliationBanner() {
  const { budgetReconciliation, setBudgetLimit } = useData();
  const insets = useSafeAreaInsets();

  const [dismissed, setDismissed] = useState(true); // true until AsyncStorage checked
  const [sheetOpen, setSheetOpen] = useState(false);
  const [updatedCategories, setUpdatedCategories] = useState<Set<string>>(new Set());

  // Check stored dismiss timestamp on mount
  useEffect(() => {
    FileSystem.readAsStringAsync(DISMISS_FILE).then((val) => {
      setDismissed(val ? new Date(val) > new Date() : false);
    }).catch(() => setDismissed(false));
  }, []);

  const highResults = budgetReconciliation.filter((r) => r.confidence === 'high');

  const handleDismiss = useCallback(() => {
    const until = new Date(Date.now() + DISMISS_DURATION_MS).toISOString();
    FileSystem.writeAsStringAsync(DISMISS_FILE, until).catch(() => {});
    setDismissed(true);
    setSheetOpen(false);
  }, []);

  const handleUpdate = useCallback(
    (result: ReconciliationResult) => {
      setBudgetLimit(result.category as CategoryId, Math.round(result.realMonthly));
      setUpdatedCategories((prev) => new Set(prev).add(result.category));
    },
    [setBudgetLimit],
  );

  if (dismissed || highResults.length < 2) return null;

  const allDone = highResults.every((r) => updatedCategories.has(r.category));

  return (
    <>
      {/* ── Collapsed banner ── */}
      <TouchableOpacity
        style={s.banner}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.85}
      >
        <View style={s.bannerLeft}>
          <View style={s.bannerIconWrap}>
            <Ionicons name="sync-circle" size={18} color={Colors.accent.primary} />
          </View>
          <Text style={s.bannerText} numberOfLines={2}>
            Il tuo comportamento reale suggerisce di aggiornare{' '}
            <Text style={s.bannerCount}>{highResults.length} budget</Text>
          </Text>
        </View>
        <View style={s.bannerRight}>
          <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={Colors.text.muted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* ── Bottom sheet ── */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={() => setSheetOpen(false)}
        />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Sheet handle */}
          <View style={s.handle} />

          {/* Sheet header */}
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>Aggiorna budget</Text>
              <Text style={s.sheetSubtitle}>
                Basato su {highResults.length} mesi di spesa reale
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView
            style={s.sheetScroll}
            contentContainerStyle={s.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {highResults.map((r) => (
              <ReconcileRow
                key={r.category}
                result={r}
                onUpdate={() => handleUpdate(r)}
                done={updatedCategories.has(r.category)}
              />
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={s.sheetFooter}>
            {allDone ? (
              <TouchableOpacity style={s.doneBtn} onPress={handleDismiss} activeOpacity={0.8}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.doneBtnText}>Fatto, non mostrare per 30 giorni</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.dismissBtn} onPress={handleDismiss} activeOpacity={0.7}>
                <Text style={s.dismissBtnText}>Ignora per 30 giorni</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '40',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  bannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accent.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  bannerCount: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Backdrop
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Sheet
  sheet: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.default,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  sheetTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  sheetSubtitle: {
    ...Typography.micro,
    color: Colors.text.muted,
    marginTop: 2,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 2,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowCategory: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  rowAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowCurrent: {
    ...Typography.caption,
    color: Colors.text.muted,
    textDecorationLine: 'line-through',
  },
  rowReal: {
    ...Typography.caption,
    fontWeight: '700',
  },
  rowPct: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  updateBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  updateBtnText: {
    ...Typography.micro,
    fontWeight: '700',
  },
  doneTag: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.semantic.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dismissBtn: {
    paddingVertical: 13,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
  },
  dismissBtnText: {
    ...Typography.caption,
    color: Colors.text.muted,
    fontWeight: '600',
  },
  doneBtn: {
    paddingVertical: 13,
    borderRadius: Radius.lg,
    backgroundColor: Colors.semantic.success,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  doneBtnText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
});
