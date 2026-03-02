import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius } from '../../constants/theme';

interface ProgressBarProps {
  progress: number; // 0 to 1+
  style?: ViewStyle;
  height?: number;
}

function getBudgetColor(progress: number): string {
  if (progress >= 0.9) return Colors.semantic.danger;
  if (progress >= 0.7) return Colors.semantic.warning;
  return Colors.semantic.success;
}

export function ProgressBar({ progress, style, height = 6 }: ProgressBarProps) {
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(Math.min(progress, 1), {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const color = getBudgetColor(progress);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
    backgroundColor: color,
  }));

  return (
    <View style={[styles.track, { height }, style]}>
      <Animated.View style={[styles.fill, { height, borderRadius: height / 2 }, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
