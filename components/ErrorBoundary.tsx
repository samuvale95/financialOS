import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../constants/theme';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'Errore sconosciuto';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Log silently — could pipe to Sentry or similar
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Qualcosa è andato storto</Text>
        <Text style={styles.body}>
          L'app ha riscontrato un problema imprevisto. Prova a riprendere o
          riavvia l'app.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={this.reset} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    ...Typography.h2,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  body: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  primaryBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
});
