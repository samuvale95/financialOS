import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { FiscalProfile } from '../types';
import { loadFiscalProfile, saveFiscalProfile } from '../utils/storage';

const STORAGE_KEY = 'financialOS_settings';

export interface AppSettings {
  features: {
    budgets: boolean;
    goals: boolean;
    portfolio: boolean;
    coach: boolean;
  };
  import: {
    pdf: boolean;
    csv: boolean;
    excel: boolean;
    manual: boolean;
  };
  preferences: {
    haptics: boolean;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  features: { budgets: true, goals: true, portfolio: true, coach: true },
  import: { pdf: true, csv: true, excel: true, manual: true },
  preferences: { haptics: true },
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSetting: <
    S extends keyof AppSettings,
    K extends keyof AppSettings[S]
  >(
    section: S,
    key: K,
    value: AppSettings[S][K]
  ) => void;
  fiscalProfile: FiscalProfile;
  setFiscalProfile: (p: FiscalProfile) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      features: { ...DEFAULT_SETTINGS.features, ...(parsed.features ?? {}) },
      import: { ...DEFAULT_SETTINGS.import, ...(parsed.import ?? {}) },
      preferences: { ...DEFAULT_SETTINGS.preferences, ...(parsed.preferences ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(s: AppSettings): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore write failures
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [fiscalProfile, setFiscalProfileState] = useState<FiscalProfile>({ type: 'dipendente' });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    loadFiscalProfile().then(setFiscalProfileState);
  }, []);

  const updateSetting = useCallback(
    <S extends keyof AppSettings, K extends keyof AppSettings[S]>(
      section: S,
      key: K,
      value: AppSettings[S][K]
    ) => {
      setSettings((prev) => {
        const next: AppSettings = {
          ...prev,
          [section]: { ...(prev[section] as object), [key]: value },
        };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const setFiscalProfile = useCallback((p: FiscalProfile) => {
    setFiscalProfileState(p);
    saveFiscalProfile(p);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, fiscalProfile, setFiscalProfile }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
