import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Radius, Spacing } from '../../constants/theme';
import { CATEGORIES, EXPENSE_CATEGORIES } from '../../constants/categories';
import type { CategoryId } from '../../constants/categories';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useData } from '../../contexts/DataContext';
import { getMerchantKey } from '../../utils/categorizer';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}€${Math.abs(amount).toFixed(2)}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Category Picker Modal ─────────────────────────────────────────────────────

function CategoryPickerModal({
  visible,
  currentCategory,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentCategory: string;
  onSelect: (cat: CategoryId) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={cpStyles.overlay} onPress={onClose}>
        <Pressable style={cpStyles.sheet} onPress={() => {}}>
          <View style={cpStyles.handle} />
          <Text style={cpStyles.sheetTitle}>Cambia categoria</Text>
          <FlatList
            data={EXPENSE_CATEGORIES}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={cpStyles.grid}
            columnWrapperStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              const isActive = item.id === currentCategory;
              return (
                <TouchableOpacity
                  style={[
                    cpStyles.catItem,
                    isActive && { borderColor: item.color, backgroundColor: item.bgColor },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onSelect(item.id as CategoryId)}
                >
                  <View style={[cpStyles.catIcon, { backgroundColor: item.bgColor }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <Text style={[cpStyles.catLabel, isActive && { color: item.color }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, budgets, setMerchantRule } = useData();
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [reclassifyFeedback, setReclassifyFeedback] = useState<string | null>(null);

  const t = transactions.find((tx) => tx.id === id);

  if (!t) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Transazione non trovata</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const category = CATEGORIES[t.category];
  const isPositive = t.amount >= 0;
  const budget = budgets.find((b) => b.category === t.category);
  const budgetProgress = budget ? budget.spent / budget.limit : null;

  // Similar transactions: same category, excluding current
  const similar = transactions
    .filter((tx) => tx.category === t.category && tx.id !== t.id)
    .slice(0, 3);

  const handleReclassify = (newCategoryId: CategoryId) => {
    const merchantKey = getMerchantKey(t);
    const affectedCount = transactions.filter(
      (tx) => getMerchantKey(tx) === merchantKey && tx.id !== t.id
    ).length;
    setMerchantRule(merchantKey, newCategoryId);
    setShowCategoryPicker(false);
    setReclassifyFeedback(
      `Categoria aggiornata.${affectedCount > 0 ? ` ${affectedCount} transazioni simili riclassificate.` : ''}`
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setReclassifyFeedback(null), 4000);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn2}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dettaglio</Text>
        <View style={styles.backBtn2} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Amount Hero */}
        <View style={styles.hero}>
          <View style={[styles.categoryIconLg, { backgroundColor: category.bgColor }]}>
            <Ionicons name={category.icon as any} size={28} color={category.color} />
          </View>
          <Text
            style={[
              styles.amountLg,
              { color: isPositive ? Colors.semantic.success : Colors.text.primary },
            ]}
          >
            {formatAmount(t.amount)}
          </Text>
          <View style={[styles.categoryBadge, { backgroundColor: category.bgColor }]}>
            <Text style={[styles.categoryBadgeText, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <DetailRow icon="storefront-outline" label="Merchant" value={t.merchant ?? '—'} />
          <View style={styles.divider} />
          <DetailRow icon="calendar-outline" label="Data" value={formatFullDate(t.date)} />
          <View style={styles.divider} />
          <DetailRow icon="document-text-outline" label="Descrizione" value={t.description} />
          {t.note && (
            <>
              <View style={styles.divider} />
              <DetailRow icon="chatbubble-outline" label="Nota" value={t.note} />
            </>
          )}
        </View>

        {/* Reclassify */}
        {t.amount < 0 && (
          <TouchableOpacity
            style={styles.changeCatBtn}
            activeOpacity={0.7}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={Colors.accent.primary} />
            <Text style={styles.changeCatBtnText}>Cambia categoria</Text>
          </TouchableOpacity>
        )}
        {reclassifyFeedback && (
          <View style={styles.feedbackBanner}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.semantic.success} />
            <Text style={styles.feedbackText}>{reclassifyFeedback}</Text>
          </View>
        )}

        <CategoryPickerModal
          visible={showCategoryPicker}
          currentCategory={t.category}
          onSelect={handleReclassify}
          onClose={() => setShowCategoryPicker(false)}
        />

        {/* Budget Section */}
        {budget && budgetProgress !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Budget {category.label}</Text>
            <View style={styles.card}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSpent}>€{budget.spent.toFixed(0)} spesi</Text>
                <Text style={styles.budgetLimit}>di €{budget.limit.toFixed(0)}</Text>
              </View>
              <ProgressBar progress={budgetProgress} style={styles.progressBar} />
            </View>
          </View>
        )}

        {/* Similar Transactions */}
        {similar.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transazioni Simili</Text>
            <View style={styles.card}>
              {similar.map((s, i) => (
                <View key={s.id}>
                  <TouchableOpacity
                    style={styles.simRow}
                    activeOpacity={0.7}
                    onPress={() => router.replace(`/transaction/${s.id}`)}
                  >
                    <Text style={styles.simDesc} numberOfLines={1}>
                      {s.description}
                    </Text>
                    <Text
                      style={[
                        styles.simAmount,
                        { color: s.amount >= 0 ? Colors.semantic.success : Colors.text.primary },
                      ]}
                    >
                      {formatAmount(s.amount)}
                    </Text>
                  </TouchableOpacity>
                  {i < similar.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={icon as any} size={18} color={Colors.text.muted} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { ...Typography.body, color: Colors.text.secondary },
  backBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  backBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { ...Typography.h3, color: Colors.text.primary },
  backBtn2: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  categoryIconLg: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  amountLg: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  categoryBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  categoryBadgeText: { ...Typography.caption, fontWeight: '600' },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 16,
  },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { ...Typography.caption, color: Colors.text.muted },
  detailValue: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle },
  section: { gap: 10 },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  budgetSpent: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600' },
  budgetLimit: { ...Typography.bodyMedium, color: Colors.text.muted },
  progressBar: { marginBottom: 12 },
  simRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  simDesc: { ...Typography.bodyMedium, color: Colors.text.primary, flex: 1 },
  simAmount: { ...Typography.bodyMedium, fontWeight: '600' },
  changeCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent.glow,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    paddingHorizontal: 16,
    paddingVertical: 13,
    justifyContent: 'center',
  },
  changeCatBtnText: {
    ...Typography.bodyMedium,
    color: Colors.accent.primary,
    fontWeight: '600',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.semantic.success + '15',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.semantic.success + '40',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedbackText: {
    ...Typography.caption,
    color: Colors.semantic.success,
    fontWeight: '600',
    flex: 1,
  },
});

const cpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
    textAlign: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    marginBottom: 4,
  },
  grid: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  catItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});
