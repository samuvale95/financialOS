import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

interface ElevatedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

Card.Elevated = function ElevatedCard({ children, style, padding = 20 }: ElevatedCardProps) {
  return (
    <View style={[styles.elevated, { padding }, style]}>
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
    ...Shadow.card,
  },
  elevated: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    ...Shadow.elevated,
  },
});
