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
  /** JSON: [{ label, packageName, preferred }] — installed notes apps (Keep, OnePlus Notes, Samsung Notes...). */
  getNotesApps(): Promise<string>;
  /** Shares the note into that notes app, where the user saves it; remembers it as the preferred app. */
  saveToNotesApp(packageName: string, text: string): Promise<boolean>;
  copyToClipboard(text: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterDevice');
