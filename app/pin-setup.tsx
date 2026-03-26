/**
 * Full-screen modal for PIN setup and change.
 * Presented over settings; uses the same lock-screen visual language.
 *
 * Route params:
 *   mode: 'setup' | 'change'
 */
import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Switch,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { PinPad } from './lock';
import { useAuth } from '../contexts/AuthContext';
import type { AutoLockDelay } from '../types';

// ── PinDots (same as lock screen) ─────────────────────────────────────────────

function PinDots({ filled, total }: { filled: number; total: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i < filled ? styles.dotFilled : styles.dotEmpty]}
        />
      ))}
    </View>
  );
}

// ── Step configs ──────────────────────────────────────────────────────────────

const AUTO_LOCK_OPTIONS: { value: AutoLockDelay; label: string }[] = [
  { value: 0,   label: 'Immediato' },
  { value: 60,  label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
];

// ── Setup flow ────────────────────────────────────────────────────────────────

type SetupStep = 'length' | 'enter' | 'confirm' | 'biometric' | 'autolock';

function SetupFlow() {
  const { setupAuth, biometricSupported, biometricEnrolled, biometricType } = useAuth();

  const [step, setStep]                     = useState<SetupStep>('length');
  const [pinLength, setPinLength]           = useState<4 | 6>(4);
  const [pin, setPin]                       = useState('');
  const [confirmPin, setConfirmPin]         = useState('');
  const [biometricEnabled, setBiometric]    = useState(false);
  const [autoLock, setAutoLock]             = useState<AutoLockDelay>(60);
  const [mismatch, setMismatch]             = useState(false);

  const shakingRef = useRef(false);
  const shakeX     = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = () => {
    if (shakingRef.current) return;
    shakingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
      withTiming(-8,  { duration: 60 }), withTiming(8,  { duration: 60 }),
      withTiming(0,   { duration: 60 })
    );
    setTimeout(() => {
      setConfirmPin('');
      setMismatch(true);
      shakingRef.current = false;
    }, 320);
  };

  const canBio    = biometricSupported && biometricEnrolled;
  const bioLabel  = biometricType === 'face' ? 'Face ID' : 'Touch ID';
  const bioIcon   = biometricType === 'face' ? 'scan-outline' : 'finger-print';

  const handleFirstDigit = (d: string) => {
    const next = pin + d;
    setPin(next);
    if (next.length === pinLength) setStep('confirm');
  };

  const handleConfirmDigit = (d: string) => {
    if (shakingRef.current) return;
    const next = confirmPin + d;
    setConfirmPin(next);
    if (next.length === pinLength) {
      if (next !== pin) { triggerShake(); return; }
      setMismatch(false);
      setStep(canBio ? 'biometric' : 'autolock');
    }
  };

  const handleActivate = async () => {
    await setupAuth({ pin, pinLength, biometricEnabled, autoLockDelay: autoLock });
    router.back();
  };

  const stepTitle: Record<SetupStep, string> = {
    length:   'Lunghezza PIN',
    enter:    'Crea il tuo PIN',
    confirm:  'Conferma PIN',
    biometric:`Abilita ${bioLabel}`,
    autolock: 'Auto-blocco',
  };

  const totalSteps = canBio ? 5 : 4;
  const stepIdx: Record<SetupStep, number> = {
    length: 1, enter: 2, confirm: 3, biometric: 4, autolock: canBio ? 5 : 4,
  };

  return (
    <View style={styles.flow}>
      {/* Progress */}
      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[styles.progressDot, i < stepIdx[step] && styles.progressDotActive]}
          />
        ))}
      </View>

      <Text style={styles.stepTitle}>{stepTitle[step]}</Text>

      {step === 'length' && (
        <>
          <View style={styles.pillRow}>
            {([4, 6] as const).map((l) => (
              <TouchableOpacity
                key={l}
                style={[styles.pill, pinLength === l && styles.pillActive]}
                onPress={() => setPinLength(l)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, pinLength === l && styles.pillTextActive]}>
                  {l} cifre
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.accentBtn} onPress={() => setStep('enter')} activeOpacity={0.8}>
            <Text style={styles.accentBtnText}>Continua</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'enter' && (
        <>
          <PinDots filled={pin.length} total={pinLength} />
          <PinPad onDigit={handleFirstDigit} onDelete={() => setPin((p) => p.slice(0, -1))} />
        </>
      )}

      {step === 'confirm' && (
        <>
          <Animated.View style={[{ alignItems: 'center', gap: 12 }, shakeStyle]}>
            {mismatch && <Text style={styles.errorText}>PIN non coincide, riprova</Text>}
            <PinDots filled={confirmPin.length} total={pinLength} />
          </Animated.View>
          <PinPad onDigit={handleConfirmDigit} onDelete={() => setConfirmPin((p) => p.slice(0, -1))} />
        </>
      )}

      {step === 'biometric' && (
        <View style={styles.centeredContent}>
          <View style={styles.bioIconCircle}>
            <Ionicons name={bioIcon as any} size={40} color={Colors.accent.primary} />
          </View>
          <Text style={styles.stepDesc}>
            Usa {bioLabel} per sbloccare l'app rapidamente senza inserire il PIN.
          </Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{bioLabel}</Text>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometric}
              trackColor={{ false: Colors.bg.elevated, true: Colors.accent.primary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={styles.accentBtn} onPress={() => setStep('autolock')} activeOpacity={0.8}>
            <Text style={styles.accentBtnText}>Continua</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'autolock' && (
        <View style={styles.centeredContent}>
          <Text style={styles.stepDesc}>
            Dopo quanto tempo di inattività bloccare automaticamente l'app?
          </Text>
          <View style={styles.pillRow}>
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, autoLock === opt.value && styles.pillActive]}
                onPress={() => setAutoLock(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, autoLock === opt.value && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.accentBtn} onPress={handleActivate} activeOpacity={0.8}>
            <Text style={styles.accentBtnText}>Attiva blocco</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Change PIN flow ───────────────────────────────────────────────────────────

type ChangeStep = 'current' | 'new' | 'confirm';

function ChangeFlow() {
  const { config, changePinSetup } = useAuth();
  const pinLength = config.pinLength ?? 4;

  const [step, setStep]         = useState<ChangeStep>('current');
  const [currentPin, setCurrent] = useState('');
  const [newPin, setNew]         = useState('');
  const [confirmPin, setConfirm] = useState('');
  const [error, setError]        = useState('');

  const shakingRef = useRef(false);
  const shakeX     = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = (msg: string) => {
    if (shakingRef.current) return;
    shakingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
      withTiming(-8,  { duration: 60 }), withTiming(8,  { duration: 60 }),
      withTiming(0,   { duration: 60 })
    );
    setTimeout(() => {
      setCurrent(''); setNew(''); setConfirm('');
      setError(msg);
      setStep('current');
      shakingRef.current = false;
    }, 320);
  };

  const handleCurrentDigit = (d: string) => {
    const next = currentPin + d;
    setCurrent(next);
    if (next.length === pinLength) setStep('new');
  };

  const handleNewDigit = (d: string) => {
    const next = newPin + d;
    setNew(next);
    if (next.length === pinLength) setStep('confirm');
  };

  const handleConfirmDigit = async (d: string) => {
    if (shakingRef.current) return;
    const next = confirmPin + d;
    setConfirm(next);
    if (next.length === pinLength) {
      if (next !== newPin) { triggerShake('PIN non coincide'); return; }
      const result = await changePinSetup({ currentPin, newPin, pinLength });
      if (!result.success) { triggerShake(result.error ?? 'Errore'); return; }
      router.back();
    }
  };

  const titles: Record<ChangeStep, string> = {
    current: 'PIN attuale',
    new:     'Nuovo PIN',
    confirm: 'Conferma nuovo PIN',
  };
  const filled = step === 'current' ? currentPin.length : step === 'new' ? newPin.length : confirmPin.length;
  const onDigit = step === 'current' ? handleCurrentDigit : step === 'new' ? handleNewDigit : handleConfirmDigit;
  const onDelete = () => {
    if (step === 'current') setCurrent((p) => p.slice(0, -1));
    else if (step === 'new') setNew((p) => p.slice(0, -1));
    else setConfirm((p) => p.slice(0, -1));
  };

  const stepIdx = step === 'current' ? 1 : step === 'new' ? 2 : 3;

  return (
    <View style={styles.flow}>
      <View style={styles.progressRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.progressDot, i <= stepIdx && styles.progressDotActive]} />
        ))}
      </View>

      <Text style={styles.stepTitle}>{titles[step]}</Text>

      <Animated.View style={[{ alignItems: 'center', gap: 12 }, shakeStyle]}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PinDots filled={filled} total={pinLength} />
      </Animated.View>

      <PinPad onDigit={onDigit} onDelete={onDelete} />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PinSetupScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'setup' | 'change' }>();

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'change' ? 'Cambia PIN' : 'Blocco app'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {mode === 'change' ? <ChangeFlow /> : <SetupFlow />}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text.primary,
  },
  flow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 28,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    top: 24,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  progressDotActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  stepTitle: {
    ...Typography.h2,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  stepDesc: {
    ...Typography.body,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
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
  centeredContent: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
  },
  bioIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accent.primary + '18',
    borderWidth: 2,
    borderColor: Colors.accent.primary + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  toggleLabel: {
    ...Typography.bodyMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.card,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    minWidth: 80,
    alignItems: 'center',
  },
  pillActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary + '18',
  },
  pillText: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  pillTextActive: {
    color: Colors.accent.primary,
  },
  accentBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
  },
  accentBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
});
