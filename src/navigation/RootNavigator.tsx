import React, { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../app/AppContext';
import { navigate, navigationRef, type RootStackParamList } from './navigationRef';
import { OnboardingScreen, LanguageScreen, AccessibilitySetupScreen } from '../screens/OnboardingScreens';
import { HomeScreen } from '../screens/HomeScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { RemindersScreen } from '../screens/RemindersScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { EmergencyScreen } from '../screens/EmergencyScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WakeScreen } from '../screens/WakeScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { settings, theme, prefs } = useApp();

  // "Hey ROOSTER" opens the app with rooster://wake — show the assistant pop-up.
  const openWake = useCallback(
    (url: string | null | undefined) => {
      if (!url || !url.startsWith('rooster://wake') || !settings.onboarded) return;
      const current = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      if (current === 'Wake') return;
      navigate('Wake', { at: Date.now() });
    },
    [settings.onboarded],
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', e => openWake(e.url));
    return () => sub.remove();
  }, [openWake]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        Linking.getInitialURL().then(openWake).catch(() => {});
      }}
      theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.colors.background, primary: theme.colors.primary } }}
    >
      <Stack.Navigator
        initialRouteName={settings.onboarded ? 'Home' : 'Onboarding'}
        screenOptions={{ headerShown: false, animation: prefs.reducedMotion ? 'none' : 'slide_from_right' }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Language" component={LanguageScreen} />
        <Stack.Screen name="AccessibilitySetup" component={AccessibilitySetupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Conversation" component={ConversationScreen} />
        <Stack.Screen name="Reminders" component={RemindersScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
        <Stack.Screen name="Emergency" component={EmergencyScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wake" component={WakeScreen} options={{ presentation: 'fullScreenModal', animation: prefs.reducedMotion ? 'none' : 'fade' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
