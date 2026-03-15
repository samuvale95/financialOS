import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Radius, Shadow } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}

// ── Card ─────────────────────────────────────────────────────────────────────
// bg.card · border.default · radius.lg · configurable padding

export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

// ── ElevatedCard ─────────────────────────────────────────────────────────────
// Card + Shadow.elevated — for floating widgets

export function ElevatedCard({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, styles.elevatedShadow, { padding }, style]}>
      {children}
    </View>
  );
}

// ── AccentCard ────────────────────────────────────────────────────────────────
// Card + border.accent (purple) — for questions, forecasts, callouts

export function AccentCard({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, styles.accent, { padding }, style]}>
      {children}
    </View>
  );
}

// Legacy compound usage (kept for backward compat)
Card.Elevated = function LegacyElevated({ children, style, padding = 20 }: CardProps) {
  return (
    <View style={[styles.legacyElevated, { padding }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  elevatedShadow: {
    ...Shadow.elevated,
  },
  accent: {
    borderColor: Colors.border.accent,
  },
  // Legacy Card.Elevated style
  legacyElevated: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    ...Shadow.elevated,
  },
});
