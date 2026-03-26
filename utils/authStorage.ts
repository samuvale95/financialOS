import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { AuthConfig } from '../types';

const AUTH_KEY = 'financialOS_auth_config';

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enabled: false,
  method: 'pin',
  biometricEnabled: false,
  autoLockDelay: 60,
  credentialHash: null,
  salt: null,
  pinLength: 4,
};

export async function loadAuthConfig(): Promise<AuthConfig> {
  try {
    const raw = await SecureStore.getItemAsync(AUTH_KEY);
    if (!raw) return { ...DEFAULT_AUTH_CONFIG };
    return { ...DEFAULT_AUTH_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AUTH_CONFIG };
  }
}

export async function saveAuthConfig(config: AuthConfig): Promise<void> {
  await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(config));
}

export async function clearAuthConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_KEY);
}

export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashCredential(salt: string, pin: string): Promise<string> {
  const input = `${salt}:${pin}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function verifyCredential(config: AuthConfig, candidate: string): Promise<boolean> {
  if (!config.credentialHash || !config.salt) return false;
  const hash = await hashCredential(config.salt, candidate);
  return hash === config.credentialHash;
}
