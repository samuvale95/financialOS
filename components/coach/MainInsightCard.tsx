import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Shadow } from '../../constants/theme';
import type { Insight } from '../../types';

const TYPE_COLORS: Record<Insight['type'], [string, string]> = {
  positive: ['#00D68F', '#00A36C'],
  warning: ['#FFB347', '#FF8C00'],
  tip: ['#6C63FF', '#4FC3F7'],
  alert: ['#FF6B6B', '#CC4444'],
};

interface MainInsightCardProps {
  insight: Insight;
  onAction?: () => void;
}

export function MainInsightCard({ insight, onAction }: MainInsightCardProps) {
  const gradientColors = TYPE_COLORS[insight.type];

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconBg}>
          <Ionicons name={insight.icon as any} size={28} color="#fff" />
        </View>
        <Text style={styles.title}>{insight.title}</Text>
        <Text style={styles.body}>{insight.body}</Text>
        {insight.action && (
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={onAction}>
            <Text style={styles.actionText}>{insight.action}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    ...Shadow.card,
    overflow: 'hidden',
  },
  gradient: {
    padding: 24,
    gap: 12,
  },
  iconBg: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    ...Typography.h2,
    color: '#fff',
  },
  body: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  actionText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '600',
  },
});
