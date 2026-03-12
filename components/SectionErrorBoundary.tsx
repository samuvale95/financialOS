import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../constants/theme';

interface SectionBoundaryState {
  hasError: boolean;
}

class SectionBoundaryClass extends React.Component<
  { children: React.ReactNode; label?: string },
  SectionBoundaryState
> {
  state: SectionBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[SectionErrorBoundary]', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.box}>
        <Text style={styles.text}>
          {this.props.label ?? 'Questa sezione non è disponibile'}
        </Text>
      </View>
    );
  }
}

/** Functional wrapper — usage: <SectionErrorBoundary label="Coach">…</SectionErrorBoundary> */
export function SectionErrorBoundary({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <SectionBoundaryClass label={label}>{children}</SectionBoundaryClass>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.semantic.danger + '44',
    padding: 16,
    alignItems: 'center',
  },
  text: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
  },
});
