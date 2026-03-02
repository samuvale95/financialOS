import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { Colors, Gradients, Typography, Spacing, Radius, Shadow } from '../../constants/theme';
import type { MonthSummary } from '../../types';

const { width } = Dimensions.get('window');

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface NetWorthCardProps {
  summary: MonthSummary;
}

export function NetWorthCard({ summary }: NetWorthCardProps) {
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const savingsPositive = summary.savings >= 0;

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      <LinearGradient
        colors={Gradients.netWorth}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <Text style={styles.label}>Patrimonio Netto</Text>
          <View style={styles.badge}>
            <Ionicons name="trending-up" size={12} color="#fff" />
            <Text style={styles.badgeText}>+2.4%</Text>
          </View>
        </View>

        <Text style={styles.amount}>{formatCurrency(summary.netWorth)}</Text>

        <View style={styles.divider} />

        <View style={styles.bottomRow}>
          <View style={styles.statItem}>
            <View style={styles.statIcon}>
              <Ionicons name="arrow-down-circle" size={16} color="rgba(255,255,255,0.8)" />
            </View>
            <View>
              <Text style={styles.statLabel}>Entrate</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.income)}</Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={styles.statIcon}>
              <Ionicons name="arrow-up-circle" size={16} color="rgba(255,255,255,0.8)" />
            </View>
            <View>
              <Text style={styles.statLabel}>Uscite</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.expenses)}</Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={styles.statIcon}>
              <Ionicons name="wallet" size={16} color="rgba(255,255,255,0.8)" />
            </View>
            <View>
              <Text style={styles.statLabel}>Risparmi</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.savings)}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    ...Shadow.glow,
    overflow: 'hidden',
  },
  gradient: {
    padding: 24,
    borderRadius: Radius.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.75)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  badgeText: {
    ...Typography.micro,
    color: '#fff',
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -1,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statIcon: {
    opacity: 0.8,
  },
  statLabel: {
    ...Typography.micro,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 2,
  },
  statValue: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },
});
