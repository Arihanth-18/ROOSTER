import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';
import NativeDevice from '../native/specs/NativeRoosterDevice';
import NativeReminders from '../native/specs/NativeRoosterReminders';
import type { DeviceContact } from '../types';
import { toWhatsAppNumber } from '../utils/phone';

// ---------------------------------------------------------------------------- permissions

export type PermissionKind = 'mic' | 'contacts' | 'notifications' | 'location' | 'call' | 'sms';

const PERMS: Record<PermissionKind, Permission[]> = {
  mic: [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO],
  contacts: [PermissionsAndroid.PERMISSIONS.READ_CONTACTS],
  notifications: Number(Platform.Version) >= 33 ? [PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] : [],
  location: [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION],
  call: [PermissionsAndroid.PERMISSIONS.CALL_PHONE],
  sms: [PermissionsAndroid.PERMISSIONS.SEND_SMS],
};

export async function hasPermission(kind: PermissionKind): Promise<boolean> {
  const list = PERMS[kind];
  if (list.length === 0) return true;
  const results = await Promise.all(list.map(p => PermissionsAndroid.check(p)));
  return kind === 'location' ? results.some(Boolean) : results.every(Boolean);
}

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

/**
 * Ask for a permission. The caller must have explained why in simple language first
 * (see usePermissionPrompt), so the system dialog is never a surprise.
 */
export async function requestPermission(kind: PermissionKind): Promise<PermissionOutcome> {
  const list = PERMS[kind];
  if (list.length === 0) return 'granted';
  const res = await PermissionsAndroid.requestMultiple(list);
  const values = Object.values(res);
  const ok = kind === 'location' ? values.includes('granted') : values.every(v => v === 'granted');
  if (ok) return 'granted';
  return values.includes('never_ask_again') ? 'blocked' : 'denied';
}

// ---------------------------------------------------------------------------- contacts

let contactsCache: { at: number; list: DeviceContact[] } | null = null;

export async function getDeviceContacts(): Promise<DeviceContact[]> {
  if (contactsCache && Date.now() - contactsCache.at < 60_000) return contactsCache.list;
  const list = JSON.parse(await NativeDevice.getContacts()) as DeviceContact[];
  contactsCache = { at: Date.now(), list };
  return list;
}

export const dial = (phone: string) => NativeDevice.dial(phone);
export const composeSms = (phones: string[], body: string) => NativeDevice.composeSms(phones.join(','), body);

/** Places the call directly. Callers must have the user's explicit yes first. */
export const placeCall = (phone: string) =>
  NativeDevice.placeCall(phone) as Promise<'calling' | 'no_permission' | 'failed'>;

export type SmsResult = { sent: number; failed: number; total: number; error?: string };

/** Sends directly and resolves only after Android reports the result for every recipient. */
export async function sendSmsDirect(phones: string[], body: string): Promise<SmsResult> {
  return JSON.parse(await NativeDevice.sendSms(phones.join(','), body)) as SmsResult;
}

// ---------------------------------------------------------------------------- WhatsApp

/**
 * Opens the person's WhatsApp chat with the message already typed. The user presses send;
 * nothing is ever sent automatically. Resolves 'not_installed' when no app handles the link.
 */
export async function openWhatsAppChat(phone: string, text: string): Promise<'opened' | 'bad_number' | 'not_installed'> {
  const number = toWhatsAppNumber(phone);
  if (!number) return 'bad_number';
  try {
    await Linking.openURL(`whatsapp://send?phone=${number}&text=${encodeURIComponent(text)}`);
    return 'opened';
  } catch {
    return 'not_installed';
  }
}

/** How long after opening a chat ROOSTER keeps reading that person's WhatsApp replies aloud. */
export const REPLY_WATCH_MINUTES = 30;

export const watchWhatsAppReplies = (name: string, locale: string, template: string) =>
  NativeDevice.watchReplies(name, REPLY_WATCH_MINUTES, locale, template);

// ---------------------------------------------------------------------------- clock app

/** `days` are Calendar days (1 = Sunday) for a repeating alarm; empty for one-time. */
export const setClockAlarm = (hour: number, minute: number, label: string, days: number[] = []) =>
  NativeDevice.setAlarm(hour, minute, label, days.join(','));

export const setClockTimer = (seconds: number, label: string) => NativeDevice.setTimer(seconds, label);

// ---------------------------------------------------------------------------- media, search, torch

export const playFromSearch = (packageName: string, query: string) => NativeDevice.playFromSearch(packageName, query);
export const openUrl = (url: string, packageName = '') => NativeDevice.openUrl(url, packageName);
export const webSearch = (query: string) => NativeDevice.webSearch(query);

export type MediaAction = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'stop';
export const mediaControl = (action: MediaAction) => NativeDevice.mediaControl(action);

export type VolumeAction = 'up' | 'down' | 'mute' | 'unmute' | 'max';
export const adjustVolume = (action: VolumeAction) => NativeDevice.adjustVolume(action);

export const setFlashlight = (on: boolean) => NativeDevice.setFlashlight(on);

// ---------------------------------------------------------------------------- form filling

export const FORM_KEYS = ['name', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'dob'] as const;
export type FormKey = (typeof FORM_KEYS)[number];
export type FormProfile = Partial<Record<FormKey, string>>;

export async function getFormProfile(): Promise<FormProfile> {
  return JSON.parse(await NativeDevice.getFormProfile()) as FormProfile;
}

export const saveFormProfile = (p: FormProfile) => NativeDevice.saveFormProfile(JSON.stringify(p));
export const isAutofillServiceEnabled = () => NativeDevice.isAutofillServiceEnabled();
export const openAutofillSettings = () => NativeDevice.openAutofillSettings();
export const isAccessibilityServiceEnabled = () => NativeDevice.isAccessibilityServiceEnabled();
export const openAccessibilitySettings = () => NativeDevice.openAccessibilitySettings();

export type FillResult =
  | { error: 'not_enabled' | 'no_profile' | 'no_window' | 'rooster_in_front' | 'failed' }
  | { app: string; filled: Array<{ key: FormKey | 'first_name' | 'last_name'; label: string }>; skipped: number };

export async function fillFormOnScreen(): Promise<FillResult> {
  return JSON.parse(await NativeDevice.fillFormOnScreen()) as FillResult;
}

// ---------------------------------------------------------------------------- phone settings

export type DeviceStatus = {
  battery: number;
  charging: boolean;
  network: 'wifi' | 'mobile' | 'other' | 'none';
  online: boolean;
  wifi: boolean;
  bluetooth: boolean;
  airplane: boolean;
  location: boolean;
  batterySaver: boolean;
  ringer: 'normal' | 'vibrate' | 'silent';
  dnd: boolean;
  brightness: number;
  autoRotate: boolean;
};

export async function getDeviceStatus(): Promise<DeviceStatus> {
  return JSON.parse(await NativeDevice.getDeviceStatus()) as DeviceStatus;
}

export type SettingsPage =
  | 'wifi' | 'mobile_data' | 'internet' | 'nfc' | 'bluetooth' | 'airplane_mode' | 'location' | 'hotspot'
  | 'battery_saver' | 'dark_mode' | 'display' | 'sound' | 'do_not_disturb' | 'dnd_access' | 'write_settings'
  | 'date' | 'language' | 'storage' | 'apps' | 'accessibility' | 'settings';

export const openSettingsPage = (page: SettingsPage) => NativeDevice.openSettingsPage(page);
export const setBrightness = (action: 'up' | 'down' | 'max' | 'min' | 'auto') => NativeDevice.setBrightness(action);
export const setAutoRotate = (on: boolean) => NativeDevice.setAutoRotate(on) as Promise<'ok' | 'no_permission' | 'failed'>;
export const setRingerMode = (mode: 'normal' | 'vibrate' | 'silent') =>
  NativeDevice.setRingerMode(mode) as Promise<'ok' | 'no_permission' | 'failed'>;
export const setDoNotDisturb = (on: boolean) => NativeDevice.setDoNotDisturb(on) as Promise<'ok' | 'no_permission'>;

// ---------------------------------------------------------------------------- reading the screen

export type ScreenText = { error: 'not_enabled' | 'no_window' | 'rooster_in_front' | 'home_screen' | 'failed' } | { app: string; lines: string[] };

export async function readScreen(): Promise<ScreenText> {
  return JSON.parse(await NativeDevice.readScreen()) as ScreenText;
}

// ---------------------------------------------------------------------------- Wispr Flow keyboard

export const WISPR_PACKAGE = 'com.wispr.flowapp';
export type KeyboardStatus = { installed: boolean; enabled: boolean; current: boolean };

export async function getWisprStatus(): Promise<KeyboardStatus> {
  return JSON.parse(await NativeDevice.getKeyboardStatus(WISPR_PACKAGE)) as KeyboardStatus;
}

export const openKeyboardSettings = () => NativeDevice.openKeyboardSettings();
export const showKeyboardPicker = () => NativeDevice.showKeyboardPicker();
export const getWisprFlow = () =>
  NativeDevice.openUrl(`market://details?id=${WISPR_PACKAGE}`, 'com.android.vending').then(ok =>
    ok ? true : NativeDevice.openUrl(`https://play.google.com/store/apps/details?id=${WISPR_PACKAGE}`, ''),
  );

// ---------------------------------------------------------------------------- phone's notes app

export type NotesApp = { label: string; packageName: string; preferred: boolean };

export async function getNotesApps(): Promise<NotesApp[]> {
  return JSON.parse(await NativeDevice.getNotesApps()) as NotesApp[];
}

export const saveToNotesApp = (packageName: string, text: string) => NativeDevice.saveToNotesApp(packageName, text);

// ---------------------------------------------------------------------------- apps

export type LaunchableApp = { label: string; packageName: string };

export async function getLaunchableApps(): Promise<LaunchableApp[]> {
  return JSON.parse(await NativeDevice.getLaunchableApps()) as LaunchableApp[];
}

export const launchApp = (pkg: string) => NativeDevice.launchApp(pkg);
export const openAppSettings = () => NativeDevice.openAppSettings();

// ---------------------------------------------------------------------------- notifications

export type DeviceNotification = { packageName: string; app: string; title: string; text: string; postTime: number };

export const isNotificationAccessEnabled = () => NativeDevice.isNotificationAccessEnabled();
export const openNotificationAccessSettings = () => NativeDevice.openNotificationAccessSettings();

export async function getActiveNotifications(): Promise<DeviceNotification[]> {
  return JSON.parse(await NativeDevice.getActiveNotifications()) as DeviceNotification[];
}

// ---------------------------------------------------------------------------- location & misc

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return JSON.parse(await NativeDevice.getCurrentLocation(12000));
}

export const copyToClipboard = (text: string) => NativeDevice.copyToClipboard(text);

// ---------------------------------------------------------------------------- reminder health

export type ReminderHealth = { exact: boolean; notifications: boolean; batteryUnrestricted: boolean };

export async function getReminderHealth(): Promise<ReminderHealth> {
  const [exact, notifications, batteryUnrestricted] = await Promise.all([
    NativeReminders.canScheduleExactAlarms(),
    NativeReminders.areNotificationsEnabled(),
    NativeReminders.isIgnoringBatteryOptimizations(),
  ]);
  return { exact, notifications, batteryUnrestricted };
}

export const openExactAlarmSettings = () => NativeReminders.openExactAlarmSettings();
export const openBatterySettings = () => NativeReminders.openBatteryOptimizationSettings();
