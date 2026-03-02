import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Colors, Typography } from '../../constants/theme';

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

export function DonutChart({
  segments,
  size = 160,
  strokeWidth = 20,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let cumulativePercent = 0;

  const arcs = segments.map((segment, i) => {
    const percent = segment.value / total;
    const dashArray = circumference * percent - 2;
    const dashOffset = circumference * (1 - cumulativePercent);
    cumulativePercent += percent;

    return (
      <Circle
        key={i}
        cx={center}
        cy={center}
        r={radius}
        stroke={segment.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashArray} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="butt"
        fill="none"
        rotation={-90}
        origin={`${center}, ${center}`}
      />
    );
  });

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <G>{arcs}</G>
        </Svg>
        {/* Center text */}
        {(centerLabel || centerSubLabel) && (
          <View style={[styles.center, { width: size, height: size }]}>
            {centerLabel && (
              <Text style={styles.centerLabel}>{centerLabel}</Text>
            )}
            {centerSubLabel && (
              <Text style={styles.centerSubLabel}>{centerSubLabel}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabel: {
    ...Typography.h3,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  centerSubLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
