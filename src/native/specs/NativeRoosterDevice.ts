import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Contacts, call/SMS intents, app launching, notifications, location, clipboard. Complex results are JSON strings. */
export interface Spec extends TurboModule {
  /** JSON: [{ id, name, phone }] — requires READ_CONTACTS. */
  getContacts(): Promise<string>;
  /** Opens the dialer with the number filled in (ACTION_DIAL). The user presses call. */
  dial(phone: string): Promise<boolean>;
  /** Places a call directly (ACTION_CALL). Only after explicit user confirmation. 'calling' | 'no_permission' | 'failed' */
  placeCall(phone: string): Promise<string>;
  /** Sends SMS directly after explicit confirmation. Comma-separated numbers. JSON { sent, failed, total, error? } */
  sendSms(phones: string, body: string): Promise<string>;
  /** Opens the SMS app with recipients and text filled in (ACTION_SENDTO). The user presses send. */
  composeSms(phones: string, body: string): Promise<boolean>;
  /** JSON: [{ label, packageName }] */
  getLaunchableApps(): Promise<string>;
  launchApp(packageName: string): Promise<boolean>;
  openAppSettings(): void;
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): void;
  /** JSON: [{ packageName, app, title, text, postTime }] — empty unless the user enabled Notification Access. */
  getActiveNotifications(): Promise<string>;
  /**
   * Read WhatsApp replies from this contact aloud for the next `minutes` (needs Notification access).
   * `template` uses {name} and {message}; `locale` is a tag such as "hi-IN".
   */
  watchReplies(name: string, minutes: number, locale: string, template: string): void;
  /** JSON: { latitude, longitude, accuracy } — rejects if unavailable. Requires location permission. */
  getCurrentLocation(timeoutMs: number): Promise<string>;
  /**
   * Sets an alarm in the phone's Clock app. `days`: comma-separated Calendar days (1 = Sunday)
   * for a repeating alarm, "" for a one-time alarm within the next 24 hours.
   */
  setAlarm(hour: number, minute: number, label: string, days: string): Promise<boolean>;
  /** Starts a countdown timer in the phone's Clock app. */
  setTimer(seconds: number, label: string): Promise<boolean>;
  /** Asks the media app to find and start playing `query`. False if the app doesn't support it. */
  playFromSearch(packageName: string, query: string): Promise<boolean>;
  /** Opens a link, inside `packageName` when given and installed, otherwise in any app. */
  openUrl(url: string, packageName: string): Promise<boolean>;
  /** Google search (Google app, else browser). */
  webSearch(query: string): Promise<boolean>;
  /** play | pause | toggle | next | previous | stop — for whichever app is playing. */
  mediaControl(action: string): void;
  /** up | down | mute | unmute | max. Resolves the new media volume in percent. */
  adjustVolume(action: string): Promise<number>;
  setFlashlight(on: boolean): Promise<boolean>;
  /** JSON of the user's saved form details (name, phone, email, address, city, state, pincode, dob). */
  getFormProfile(): Promise<string>;
  /** Saves the details encrypted on the phone. */
  saveFormProfile(json: string): Promise<boolean>;
  /** Whether ROOSTER is the phone's autofill service. */
  isAutofillServiceEnabled(): Promise<boolean>;
  openAutofillSettings(): void;
  /** Whether ROOSTER's voice form filling (accessibility service) is turned on. */
  isAccessibilityServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): void;
  /** Fills the form in the app behind ROOSTER. JSON { app, filled: [{ key, label }], skipped } or { error }. */
  fillFormOnScreen(): Promise<string>;
  /** Visible text of the app behind ROOSTER, for "read this message". JSON { app, lines } or { error }. */
  readScreen(): Promise<string>;
  /** JSON { battery, charging, network, online, wifi, bluetooth, airplane, location, batterySaver, ringer, dnd, brightness, autoRotate }. */
  getDeviceStatus(): Promise<string>;
  /** Quick panel or settings page so the user can flip a switch apps may not change. */
  openSettingsPage(page: string): Promise<boolean>;
  /**
   * Hands-free: opens the page, flips the switch titled one of `labelsJson` (JSON array) using the
   * accessibility service, returns to ROOSTER. JSON { result: done | already | not_found | failed | not_enabled }.
   */
  autoToggleSetting(page: string, labelsJson: string, on: boolean): Promise<string>;
  /** up | down | max | min | auto. New brightness %, or -1 without "Modify system settings". */
  setBrightness(action: string): Promise<number>;
  /** "ok" | "no_permission" | "failed" */
  setAutoRotate(on: boolean): Promise<string>;
  /** normal | vibrate | silent → "ok" | "no_permission" | "failed" */
  setRingerMode(mode: string): Promise<string>;
  /** "ok" | "no_permission" */
  setDoNotDisturb(on: boolean): Promise<string>;
  /** JSON { installed, enabled, current } for a keyboard app (Wispr Flow). */
  getKeyboardStatus(packageName: string): Promise<string>;
  openKeyboardSettings(): void;
  /** Android's "Choose keyboard" pop-up. */
  showKeyboardPicker(): void;
  /** JSON: [{ label, packageName, preferred }] — installed notes apps (Keep, OnePlus Notes, Samsung Notes...). */
  getNotesApps(): Promise<string>;
  /** Shares the note into that notes app, where the user saves it; remembers it as the preferred app. */
  saveToNotesApp(packageName: string, text: string): Promise<boolean>;
  copyToClipboard(text: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterDevice');
