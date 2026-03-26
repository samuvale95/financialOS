import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

// ── PinDots ───────────────────────────────────────────────────────────────────

function PinDots({ filled, total }: { filled: number; total: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < filled ? styles.dotFilled : styles.dotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

// ── PinPad (full size — used on lock screen) ──────────────────────────────────

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

interface PinPadBaseProps {
  onDigit: (d: string) => void;
  onDelete: () => void;
  compact?: boolean;
}

function PinPadBase({ onDigit, onDelete, compact = false }: PinPadBaseProps) {
  const cellSize = compact ? 64 : 80;
  const iconSize = compact ? 18 : 22;
  const gridWidth = compact ? 216 : 264;
  const gap = compact ? 8 : 12;

  return (
    <View style={[styles.padGrid, { width: gridWidth, gap }]}>
      {PAD_KEYS.map((key, idx) => {
        if (key === '') return <View key={idx} style={{ width: cellSize, height: cellSize }} />;
        const isDelete = key === '⌫';
        return (
          <TouchableOpacity
            key={idx}
            style={[
              styles.padCell,
              { width: cellSize, height: cellSize, borderRadius: cellSize / 2 },
              compact && styles.padCellCompact,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (isDelete) onDelete();
              else onDigit(key);
            }}
          >
            {isDelete ? (
              <Ionicons name="backspace-outline" size={iconSize} color={Colors.text.secondary} />
            ) : (
              <Text style={compact ? styles.padKeyCompact : styles.padKey}>{key}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Full-size PinPad exported for the lock screen */
export function PinPad({ onDigit, onDelete }: Omit<PinPadBaseProps, 'compact'>) {
  return <PinPadBase onDigit={onDigit} onDelete={onDelete} compact={false} />;
}

/** Compact PinPad for use inside settings cards */
export function CompactPinPad({ onDigit, onDelete }: Omit<PinPadBaseProps, 'compact'>) {
  return <PinPadBase onDigit={onDigit} onDelete={onDelete} compact={true} />;
}

// ── LockScreen ────────────────────────────────────────────────────────────────

export default function LockScreen() {
  const {
    config,
    unlock,
    promptBiometric,
    biometricType,
    biometricSupported,
    biometricEnrolled,
    isLoading,
  } = useAuth();

  const pinLength = config.pinLength ?? 4;
  const canUseBiometric = biometricSupported && biometricEnrolled && config.biometricEnabled;

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  // Default to PIN view; switch to biometric-primary after auth finishes loading
  const [showPin, setShowPin] = useState(true);

  const shakeX = useSharedValue(0);
  const shakingRef = useRef(false);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // Once the auth config is fully loaded, decide which mode to show
  // and auto-trigger biometric if configured
  useEffect(() => {
    if (isLoading) return;
    if (canUseBiometric) {
      setShowPin(false);
      promptBiometric();
    } else {
      setShowPin(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const triggerShake = () => {
    if (shakingRef.current) return;
    shakingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
    setTimeout(() => {
      setPin('');
      setError('PIN non corretto');
      shakingRef.current = false;
    }, 320);
  };

  const handleDigit = async (d: string) => {
    if (shakingRef.current) return;
    const next = pin + d;
    setPin(next);
    setError('');

    if (next.length === pinLength) {
      const result = await unlock(next);
      if (!result.success) {
        triggerShake();
      }
    }
  };

  const handleDelete = () => {
    if (shakingRef.current) return;
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const biometricIcon = biometricType === 'face' ? 'scan-outline' : 'finger-print';

  // ── Biometric-primary view ─────────────────────────────────────────────────
  if (!showPin && canUseBiometric) {
    return (
      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={[styles.lockRing, Shadow.glow]}>
            <Ionicons name="lock-closed" size={32} color={Colors.accent.primary} />
          </View>
          <Text style={styles.appName}>FinancialOS</Text>
          <Text style={styles.subtitle}>
            {biometricType === 'face' ? 'Usa Face ID per sbloccare' : 'Usa Touch ID per sbloccare'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.biometricPrimary, Shadow.glow]}
          onPress={() => promptBiometric()}
          activeOpacity={0.8}
        >
          <Ionicons name={biometricIcon as any} size={36} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.usePinBtn}
          onPress={() => setShowPin(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.usePinText}>Usa PIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── PIN-primary view ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={[styles.lockRing, Shadow.glow]}>
          <Ionicons name="lock-closed" size={32} color={Colors.accent.primary} />
        </View>
        <Text style={styles.appName}>FinancialOS</Text>
        <Text style={styles.subtitle}>Inserisci il PIN per sbloccare</Text>
      </View>

      <Animated.View style={[styles.pinArea, shakeStyle]}>
        <PinDots filled={pin.length} total={pinLength} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Animated.View>

      <PinPad onDigit={handleDigit} onDelete={handleDelete} />

      {canUseBiometric && (
        <TouchableOpacity
          style={styles.biometricBtn}
          onPress={() => {
            setShowPin(false);
            promptBiometric();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={biometricIcon as any} size={20} color={Colors.accent.primary} />
          <Text style={styles.biometricBtnText}>
            {biometricType === 'face' ? 'Usa Face ID' : 'Usa Touch ID'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 32,
  },
  topSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent.primary + '18',
    borderWidth: 2,
    borderColor: Colors.accent.primary + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  appName: {
    ...Typography.h2,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  pinArea: {
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotFilled: {
    backgroundColor: Colors.accent.primary,
  },
  dotEmpty: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.semantic.danger,
  },
  padGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  padCell: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  padCellCompact: {
    backgroundColor: Colors.bg.secondary,
    borderColor: Colors.border.subtle,
  },
  padKey: {
    ...Typography.h2,
    color: Colors.text.primary,
  },
  padKeyCompact: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  biometricPrimary: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usePinBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  usePinText: {
    ...Typography.bodyMedium,
    color: Colors.text.muted,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent.primary + '18',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '40',
    marginTop: -16,
  },
  biometricBtnText: {
    ...Typography.bodyMedium,
    color: Colors.accent.primary,
    fontWeight: '600',
  },
});
