import type { Language } from '../types';

export type AccessibilityPrefs = {
  // visual
  textSize: 'standard' | 'large' | 'xlarge';
  contrast: 'standard' | 'high' | 'aaa';
  simplifiedInterface: boolean;
  largeTouchTargets: boolean;
  // audio
  audioFirst: boolean;
  voiceOutput: boolean;
  spokenConfirmation: boolean;
  speechRate: number; // 0.5 – 1.5
  speechVolume: number; // 0.2 – 1
  // interaction
  confirmationLevel: 'low' | 'standard' | 'high';
  simplifiedLanguage: boolean;
  textInput: boolean;
  haptics: boolean;
  reducedMotion: boolean;
};

export type AppSettings = {
  language: Language;
  onboarded: boolean;
  serverUrl: string;
  /** Package names whose notifications the user allows ROOSTER to read aloud. */
  allowedNotificationApps: string[];
  /** Include a map link in SOS messages (asks for location permission when first used). */
  sosShareLocation: boolean;
  /** "Hey ROOSTER" wake word. Off by default; "screen_on" saves battery. */
  wakeMode: 'off' | 'screen_on' | 'always';
  /** Speak reminder notifications aloud when they fire. */
  speakReminders: boolean;
  prefs: AccessibilityPrefs;
};

export const DEFAULT_PREFS: AccessibilityPrefs = {
  textSize: 'large',
  contrast: 'standard',
  simplifiedInterface: false,
  largeTouchTargets: false,
  audioFirst: false,
  voiceOutput: true,
  spokenConfirmation: true,
  speechRate: 0.9,
  speechVolume: 1,
  confirmationLevel: 'standard',
  simplifiedLanguage: false,
  textInput: true,
  haptics: true,
  reducedMotion: false,
};

/** Deployed backend on Render. For local development, set `http://localhost:3000` in Settings (with `adb reverse tcp:3000 tcp:3000`). */
export const DEFAULT_SERVER_URL = 'https://rooster-backend-4fuh.onrender.com';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  onboarded: false,
  serverUrl: DEFAULT_SERVER_URL,
  allowedNotificationApps: [],
  sosShareLocation: true,
  wakeMode: 'off',
  speakReminders: true,
  prefs: DEFAULT_PREFS,
};
