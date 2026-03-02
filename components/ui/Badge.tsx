import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Typography } from '../../constants/theme';

interface BadgeProps {
  label: string;
  color: string;
  bgColor: string;
  icon?: string;
  style?: ViewStyle;
}

export function Badge({ label, color, bgColor, icon, style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      {icon && (
        <Ionicons
          name={icon as any}
          size={11}
          color={color}
          style={styles.icon}
        />
      )}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    ...Typography.micro,
  },
});
