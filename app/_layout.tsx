import { useEffect, useState } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SettingsProvider } from '../contexts/SettingsContext';
import { DataProvider } from '../contexts/DataContext';
import { AnalysisProvider } from '../contexts/AnalysisContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { loadOnboardingData } from '../utils/storage';
import { requestNotificationPermission } from '../utils/notifications';
import * as istatCache from '../utils/istatCache';
import { ErrorBoundary } from '../components/ErrorBoundary';
import LockScreen from './lock';

SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Inner gate: can access AuthContext ────────────────────────────────────────

function AppGate() {
  const navState = useRootNavigationState();
  const { isLoading: isAuthLoading, isLocked } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      const [data] = await Promise.all([
        loadOnboardingData(),
        istatCache.initialize().catch((e) => console.warn('[istatCache] init failed:', e)),
        requestNotificationPermission().catch(() => {}),
      ]);
      setNeedsOnboarding(!data.completed);
      setOnboardingChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (!isAuthLoading && onboardingChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isAuthLoading, onboardingChecked]);

  useEffect(() => {
    if (!navState?.key || !onboardingChecked || isAuthLoading || isLocked) return;
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [navState?.key, onboardingChecked, needsOnboarding, isAuthLoading, isLocked]);

  if (isAuthLoading) return null;
  if (isLocked) return <LockScreen />;

  return (
    <>
      <StatusBar style="light" backgroundColor="#0A0B0F" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="onboarding"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="asset/[id]" />
        <Stack.Screen name="budget/[id]" />
        <Stack.Screen name="add-transaction" />
        <Stack.Screen
          name="goals"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="subscriptions"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="import-analytics"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="import-logs"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="pin-setup"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="monthly-report"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <AuthProvider>
          <SettingsProvider>
            <DataProvider>
              <AnalysisProvider>
                <AppGate />
              </AnalysisProvider>
            </DataProvider>
          </SettingsProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
