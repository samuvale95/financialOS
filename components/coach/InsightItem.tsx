import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';
import { Card } from '../ui/Card';
import type { Insight } from '../../types';

const TYPE_STYLE: Record<
  Insight['type'],
  { color: string; bgColor: string; label: string }
> = {
  positive: {
    color: Colors.semantic.success,
    bgColor: Colors.semantic.successDim,
    label: 'Ottimo',
  },
  warning: {
    color: Colors.semantic.warning,
    bgColor: Colors.semantic.warningDim,
    label: 'Attenzione',
  },
  tip: {
    color: Colors.accent.primary,
    bgColor: Colors.accent.glow,
    label: 'Consiglio',
  },
  alert: {
    color: Colors.semantic.danger,
    bgColor: Colors.semantic.dangerDim,
    label: 'Allerta',
  },
};

interface InsightItemProps {
  insight: Insight;
  onAction?: () => void;
}

export function InsightItem({ insight, onAction }: InsightItemProps) {
  const style = TYPE_STYLE[insight.type];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconBg, { backgroundColor: style.bgColor }]}>
          <Ionicons name={insight.icon as any} size={18} color={style.color} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {insight.title}
            </Text>
            <View style={[styles.badge, { backgroundColor: style.bgColor }]}>
              <Text style={[styles.badgeText, { color: style.color }]}>
                {style.label}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.body}>{insight.body}</Text>
      {insight.action && (
        <TouchableOpacity onPress={onAction} style={styles.action} activeOpacity={0.7}>
          <Text style={[styles.actionText, { color: style.color }]}>{insight.action}</Text>
          <Ionicons name="arrow-forward-circle" size={16} color={style.color} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    flex: 1,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: {
    ...Typography.micro,
    fontWeight: '600',
  },
  body: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  actionText: {
    ...Typography.caption,
    fontWeight: '600',
  },
});
