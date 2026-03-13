import React, { useRef, useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../constants/theme';
import { useAnalysis } from '../contexts/AnalysisContext';

// Short Italian month label: "gen 2026", "feb 2026", …
function formatPill(ym: string): string {
  return new Date(ym + '-15').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
}

// Approximate pill width in pixels (used to scroll to active pill)
const PILL_W = 88;

export default function MonthSelectorStrip() {
  const { availableMonths, selectedMonth, setSelectedMonth } = useAnalysis();
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll so the active pill is visible
  useEffect(() => {
    const idx = availableMonths.indexOf(selectedMonth);
    if (idx < 0 || !scrollRef.current) return;
    // Scroll so the pill is roughly centred; clamp at 0
    const x = Math.max(0, idx * PILL_W - 40);
    scrollRef.current.scrollTo({ x, animated: true });
  }, [selectedMonth, availableMonths]);

  if (availableMonths.length <= 1) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scroll}
      contentContainerStyle={s.strip}
    >
      {availableMonths.map((month) => {
        const active = month === selectedMonth;
        return (
          <TouchableOpacity
            key={month}
            style={[s.pill, active && s.pillActive]}
            onPress={() => setSelectedMonth(month)}
            activeOpacity={0.7}
          >
            <Text style={[s.pillText, active && s.pillTextActive]}>
              {formatPill(month)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  strip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    minWidth: 80,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: Colors.accent.primary + '22',
    borderColor: Colors.accent.primary,
  },
  pillText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pillTextActive: {
    color: Colors.accent.primary,
  },
});
