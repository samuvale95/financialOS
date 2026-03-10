import { useEffect, useState } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SettingsProvider } from '../contexts/SettingsContext';
import { DataProvider } from '../contexts/DataContext';
import { loadOnboardingData } from '../utils/storage';
import { requestNotificationPermission } from '../utils/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const navState = useRootNavigationState();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    loadOnboardingData().then((data) => {
      setNeedsOnboarding(!data.completed);
      setOnboardingChecked(true);
      SplashScreen.hideAsync().catch(() => {});
    });
    requestNotificationPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (!navState?.key || !onboardingChecked) return;
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [navState?.key, onboardingChecked, needsOnboarding]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SettingsProvider>
        <DataProvider>
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
          </Stack>
        </DataProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
