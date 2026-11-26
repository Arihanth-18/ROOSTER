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
  /** JSON: { latitude, longitude, accuracy } — rejects if unavailable. Requires location permission. */
  getCurrentLocation(timeoutMs: number): Promise<string>;
  copyToClipboard(text: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterDevice');
