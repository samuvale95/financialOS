import React, { ReactNode } from 'react';
import { ScrollView, View, Text, StyleSheet, ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '../../constants/theme';

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  /** Large heading text shown in the page header. */
  title?: string;
  /** Typography variant for the title (default 'h1'). */
  titleVariant?: 'h1' | 'h2' | 'h3';
  /** Smaller text below the title. */
  subtitle?: string;
  /** Element rendered to the right of the title (icon button, chip, etc.). */
  rightAction?: ReactNode;
  /** Gap between direct children in the scroll content (default 16). */
  gap?: number;
  children: ReactNode;
  /** Extra props forwarded to the inner ScrollView. */
  scrollProps?: ScrollViewProps;
  /** Ref forwarded to the inner ScrollView for programmatic scroll. */
  scrollViewRef?: React.RefObject<ScrollView | null>;
}

export function Page({
  title,
  titleVariant = 'h1',
  subtitle,
  rightAction,
  gap = 16,
  children,
  scrollProps,
  scrollViewRef,
}: PageProps) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        ref={scrollViewRef}
        style={s.scroll}
        contentContainerStyle={[s.content, gap !== 16 && { gap }]}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {(title || rightAction) && (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              {title && (
                <Text style={[{ color: Colors.text.primary }, Typography[titleVariant]]}>
                  {title}
                </Text>
              )}
              {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            </View>
            {rightAction && <View>{rightAction}</View>}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── PageSection ───────────────────────────────────────────────────────────────

interface PageSectionProps {
  /** Section heading (h3 weight). */
  title?: string;
  /** Subtitle line below the heading. */
  subtitle?: string;
  /** Ionicons name for the icon to the left of the title. */
  iconName?: string;
  /** Text or node rendered at the right of the header row (e.g. "1/3" counter). */
  rightLabel?: string | ReactNode;
  children: ReactNode;
}

export function PageSection({ title, subtitle, iconName, rightLabel, children }: PageSectionProps) {
  const hasHeader = title || iconName || rightLabel;
  return (
    <View style={s.section}>
      {hasHeader && (
        <View style={s.sectionHead}>
          {iconName && (
            <Ionicons name={iconName as any} size={16} color={Colors.accent.primary} />
          )}
          {title && <Text style={s.sectionTitle}>{title}</Text>}
          {typeof rightLabel === 'string'
            ? <Text style={s.sectionRight}>{rightLabel}</Text>
            : rightLabel ?? null}
        </View>
      )}
      {subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  // Section
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary, flex: 1 },
  sectionRight: { ...Typography.caption, color: Colors.text.muted },
  sectionSubtitle: { ...Typography.caption, color: Colors.text.secondary },
});
