import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Radius } from '../../constants/theme';
import { CATEGORIES } from '../../constants/categories';
import type { Transaction } from '../../types';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}€${Math.abs(amount).toFixed(2)}`;
}

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: (t: Transaction) => void;
}

export function TransactionItem({ transaction, onPress }: TransactionItemProps) {
  const category = CATEGORIES[transaction.category];
  const isPositive = transaction.amount >= 0;

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.(transaction);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.container}
    >
      <View style={[styles.iconBg, { backgroundColor: category.bgColor }]}>
        <Ionicons name={category.icon as any} size={18} color={category.color} />
      </View>

      <View style={styles.content}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.categoryPill, { backgroundColor: category.bgColor }]}>
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
          {transaction.merchant && (
            <Text style={styles.merchant} numberOfLines={1}>
              {transaction.merchant}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.amountBlock}>
        <Text
          style={[
            styles.amount,
            { color: isPositive ? Colors.semantic.success : Colors.text.primary },
          ]}
        >
          {formatAmount(transaction.amount)}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={Colors.text.muted}
          style={styles.chevron}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconBg: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  description: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  categoryLabel: {
    ...Typography.micro,
  },
  merchant: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  amountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amount: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  chevron: {
    marginTop: 1,
  },
});
