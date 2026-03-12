import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import type { ReconciliationResult } from '../../utils/profileReconciler';

interface ReconciliationBannerProps {
  results: ReconciliationResult[];
  onAdjustBudget: (category: string, newValue: number) => void;
  onDismiss: () => void;
}

const CONFIDENCE_LABEL: Record<ReconciliationResult['confidence'], string> = {
  high: 'alta',
  medium: 'media',
  low: 'bassa',
};

export default function ReconciliationBanner({
  results,
  onAdjustBudget,
  onDismiss,
}: ReconciliationBannerProps) {
  if (results.length === 0) return null;

  const top = results[0];
  const isOver = top.suggestion === 'increase';
  const accentColor = isOver ? Colors.semantic.danger : Colors.semantic.success;
  const iconName = isOver ? 'trending-up' : 'trending-down';

  const handleAdjust = () => {
    Alert.alert(
      'Aggiorna budget',
      `Vuoi aggiornare il budget "${top.categoryName}" da €${top.estimatedMonthly} a €${top.realMonthly}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Aggiorna',
          onPress: () => onAdjustBudget(top.category, top.realMonthly),
        },
      ],
    );
  };

  const remaining = results.length - 1;

  return (
    <View style={[styles.banner, { borderColor: accentColor + '40' }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: accentColor + '18' }]}>
          <Ionicons name={iconName} size={16} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Budget da rivedere</Text>
          <Text style={styles.subtitle}>
            Confidenza: {CONFIDENCE_LABEL[top.confidence]}
            {remaining > 0 ? ` · +${remaining} altr${remaining === 1 ? 'a' : 'e'}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Ionicons name="close" size={18} color={Colors.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.categoryName}>{top.categoryName}</Text>
        <Text style={styles.message}>
          {isOver ? 'Sottostimato' : 'Sovrastimato'} del{' '}
          <Text style={[styles.highlight, { color: accentColor }]}>{top.divergencePct}%</Text>
          {' '}rispetto alle spese reali
        </Text>

        {/* Amounts row */}
        <View style={styles.amountsRow}>
          <View style={styles.amountItem}>
            <Text style={styles.amountLabel}>Budget attuale</Text>
            <Text style={styles.amountValue}>€{top.estimatedMonthly}</Text>
          </View>
          <Ionicons name="arrow-forward" size={14} color={Colors.text.muted} />
          <View style={styles.amountItem}>
            <Text style={styles.amountLabel}>Spesa reale media</Text>
            <Text style={[styles.amountValue, { color: accentColor }]}>€{top.realMonthly}</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onDismiss} activeOpacity={0.7}>
          <Text style={styles.btnSecondaryText}>Ignora</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: accentColor }]}
          onPress={handleAdjust}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Aggiorna a €{top.realMonthly}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  subtitle: {
    ...Typography.micro,
    color: Colors.text.muted,
    marginTop: 1,
  },
  body: {
    gap: 6,
  },
  categoryName: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  message: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  highlight: {
    fontWeight: '700',
  },
  amountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    padding: 10,
  },
  amountItem: {
    flex: 1,
    gap: 2,
  },
  amountLabel: {
    ...Typography.micro,
    color: Colors.text.muted,
  },
  amountValue: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
  },
  btnSecondaryText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  btnPrimaryText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
});
