import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Offline "Hey ROOSTER" wake word (Vosk, on-device). Runs as a microphone foreground service
 * with a visible notification, only when the user turns it on.
 */
export interface Spec extends TurboModule {
  /** mode: 'screen_on' (listen only while the screen is on) | 'always'. Must be called while the app is visible. */
  start(mode: string): Promise<boolean>;
  stop(): void;
  /** Release the microphone while ROOSTER itself is listening; resume afterwards. */
  pause(): void;
  resume(): void;
  /** 'off' | 'loading' | 'listening' | 'paused' | 'error' */
  getStatus(): Promise<string>;
  canDrawOverlays(): Promise<boolean>;
  openOverlaySettings(): void;
  /** Send ROOSTER to the background so the user returns to the app they were using. */
  moveToBack(): void;
  /** Whether reminder notifications are also spoken aloud (read by the native alarm receiver). */
  setSpeakReminders(enabled: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterWake');
