import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import type { AuthConfig, AutoLockDelay } from '../types';
import {
  DEFAULT_AUTH_CONFIG,
  generateSalt,
  hashCredential,
  loadAuthConfig,
  saveAuthConfig,
  clearAuthConfig,
  verifyCredential,
} from '../utils/authStorage';

// ── Types ─────────────────────────────────────────────────────────────────────

type BiometricType = 'face' | 'fingerprint' | 'none';

interface AuthContextValue {
  isLocked: boolean;
  isLoading: boolean;
  biometricSupported: boolean;
  biometricEnrolled: boolean;
  biometricType: BiometricType;
  config: AuthConfig;
  unlock: (pin: string) => Promise<{ success: boolean; error?: string }>;
  promptBiometric: () => Promise<{ success: boolean }>;
  setupAuth: (params: {
    pin: string;
    pinLength: 4 | 6;
    biometricEnabled: boolean;
    autoLockDelay: AutoLockDelay;
  }) => Promise<void>;
  disableAuth: () => Promise<void>;
  updateAutoLock: (delay: AutoLockDelay) => Promise<void>;
  updateBiometric: (enabled: boolean) => Promise<void>;
  changePinSetup: (params: {
    currentPin: string;
    newPin: string;
    pinLength: 4 | 6;
  }) => Promise<{ success: boolean; error?: string }>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');

  const backgroundTimeRef = useRef<number | null>(null);
  const configRef = useRef<AuthConfig>(DEFAULT_AUTH_CONFIG);

  // Keep ref in sync so AppState handler has latest value without stale closure
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [cfg, hasHardware, enrolled, types] = await Promise.all([
        loadAuthConfig(),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);

      setConfig(cfg);
      setBiometricSupported(hasHardware);
      setBiometricEnrolled(enrolled);

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }

      if (cfg.enabled) {
        setIsLocked(true);
      }
      setIsLoading(false);
    })();
  }, []);

  // ── AppState auto-lock ────────────────────────────────────────────────────

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const cfg = configRef.current;
      if (!cfg.enabled) return;

      if (nextState === 'background' || nextState === 'inactive') {
        if (cfg.autoLockDelay === 0) {
          // Lock immediately on background
          setIsLocked(true);
        } else {
          backgroundTimeRef.current = Date.now();
        }
      } else if (nextState === 'active') {
        if (backgroundTimeRef.current !== null) {
          const elapsed = (Date.now() - backgroundTimeRef.current) / 1000;
          backgroundTimeRef.current = null;
          if (elapsed >= cfg.autoLockDelay) {
            setIsLocked(true);
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const unlock = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    const ok = await verifyCredential(config, pin);
    if (ok) {
      setIsLocked(false);
      return { success: true };
    }
    return { success: false, error: 'PIN non corretto' };
  };

  const promptBiometric = async (): Promise<{ success: boolean }> => {
    if (!biometricSupported || !biometricEnrolled) return { success: false };
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sblocca FinancialOS',
      fallbackLabel: 'Usa PIN',
      cancelLabel: 'Annulla',
      disableDeviceFallback: true,
    });
    if (result.success) {
      setIsLocked(false);
    }
    return { success: result.success };
  };

  const setupAuth = async (params: {
    pin: string;
    pinLength: 4 | 6;
    biometricEnabled: boolean;
    autoLockDelay: AutoLockDelay;
  }): Promise<void> => {
    const salt = await generateSalt();
    const hash = await hashCredential(salt, params.pin);
    const newConfig: AuthConfig = {
      enabled: true,
      method: 'pin',
      biometricEnabled: params.biometricEnabled,
      autoLockDelay: params.autoLockDelay,
      credentialHash: hash,
      salt,
      pinLength: params.pinLength,
    };
    await saveAuthConfig(newConfig);
    setConfig(newConfig);
    setIsLocked(false);
  };

  const disableAuth = async (): Promise<void> => {
    await clearAuthConfig();
    const fresh = { ...DEFAULT_AUTH_CONFIG };
    setConfig(fresh);
    setIsLocked(false);
  };

  const updateAutoLock = async (delay: AutoLockDelay): Promise<void> => {
    const updated = { ...config, autoLockDelay: delay };
    await saveAuthConfig(updated);
    setConfig(updated);
  };

  const updateBiometric = async (enabled: boolean): Promise<void> => {
    const updated = { ...config, biometricEnabled: enabled };
    await saveAuthConfig(updated);
    setConfig(updated);
  };

  const changePinSetup = async (params: {
    currentPin: string;
    newPin: string;
    pinLength: 4 | 6;
  }): Promise<{ success: boolean; error?: string }> => {
    const ok = await verifyCredential(config, params.currentPin);
    if (!ok) return { success: false, error: 'PIN attuale non corretto' };

    const salt = await generateSalt();
    const hash = await hashCredential(salt, params.newPin);
    const updated: AuthConfig = {
      ...config,
      credentialHash: hash,
      salt,
      pinLength: params.pinLength,
    };
    await saveAuthConfig(updated);
    setConfig(updated);
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        isLocked,
        isLoading,
        biometricSupported,
        biometricEnrolled,
        biometricType,
        config,
        unlock,
        promptBiometric,
        setupAuth,
        disableAuth,
        updateAutoLock,
        updateBiometric,
        changePinSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
