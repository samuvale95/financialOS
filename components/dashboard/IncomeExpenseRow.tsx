import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, Typography, Radius, Shadow } from '../../constants/theme';

function formatCurrency(value: number): string {
  return `€${value.toLocaleString('it-IT')}`;
}

interface IncomeExpenseRowProps {
  income: number;
  expenses: number;
  savingsRate: number;
}

export function IncomeExpenseRow({ income, expenses, savingsRate }: IncomeExpenseRowProps) {
  return (
    <View style={styles.row}>
      {/* Income */}
      <LinearGradient
        colors={Gradients.income}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconRow}>
          <View style={styles.iconBg}>
            <Ionicons name="arrow-down" size={16} color={Colors.semantic.success} />
          </View>
          <Text style={styles.cardLabel}>Entrate</Text>
        </View>
        <Text style={styles.cardAmount}>{formatCurrency(income)}</Text>
        <Text style={styles.cardSub}>questo mese</Text>
      </LinearGradient>

      {/* Expenses */}
      <LinearGradient
        colors={Gradients.expense}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconRow}>
          <View style={[styles.iconBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="arrow-up" size={16} color="#fff" />
          </View>
          <Text style={styles.cardLabel}>Uscite</Text>
        </View>
        <Text style={styles.cardAmount}>{formatCurrency(expenses)}</Text>
        <Text style={styles.cardSub}>risparmio {savingsRate.toFixed(0)}%</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: 16,
    ...Shadow.card,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  cardSub: {
    ...Typography.micro,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
});
