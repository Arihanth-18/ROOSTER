import { createNavigationContainerRef } from '@react-navigation/native';

export type RootStackParamList = {
  Onboarding: undefined;
  Language: { fromSettings?: boolean } | undefined;
  AccessibilitySetup: { fromSettings?: boolean } | undefined;
  Home: undefined;
  Conversation: undefined;
  Reminders: { tab?: 'reminders' | 'notes' | 'facts' } | undefined;
  Reader: { autoCapture?: boolean } | undefined;
  Emergency: { startSos?: boolean } | undefined;
  Settings: undefined;
  Wake: { at?: number } | undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) {
  if (!navigationRef.isReady()) return;
  // Typed overloads of navigate() don't accept a generic union cleanly.
  (navigationRef.navigate as (n: string, p?: object) => void)(name, params as object | undefined);
}
