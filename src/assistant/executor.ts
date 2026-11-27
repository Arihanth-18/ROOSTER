import type { AppSettings } from '../accessibility/types';
import type { AskOptions, AskResult } from '../components/DialogProvider';
import type { TFunction, StringKey } from '../localization/i18n';
import { navigate } from '../navigation/navigationRef';
import { SPEECH_LOCALE, type ChatTurn, type IntentResult, type Reminder, type ScreenName } from '../types';
import { factsRepo, notesRepo, remindersRepo, trustedRepo } from '../storage/repositories';
import {
  getActiveNotifications,
  getDeviceContacts,
  getLaunchableApps,
  isNotificationAccessEnabled,
  launchApp,
  adjustVolume,
  getNotesApps,
  mediaControl,
  openUrl,
  openWhatsAppChat,
  playFromSearch,
  setFlashlight,
  webSearch,
  type LaunchableApp,
  type MediaAction,
  type VolumeAction,
  saveToNotesApp,
  setClockAlarm,
  setClockTimer,
  watchWhatsAppReplies,
} from '../services/device';
import { describeWhen, deleteReminder, ReminderInPastError, saveReminder, todaysReminders, upcomingReminders } from '../services/reminders';
import { getLastSpoken, stopSpeaking } from '../services/speech';
import { respond } from '../services/assistantClient';
import { fuzzyFind, matchContact, type MatchableContact } from '../utils/contactMatch';
import { formatTime, parseLocalDateTime } from '../utils/dates';
import { needsConfirmation } from './policy';
import { ensurePermission } from './permissions';
import { callConfirmed, messageConfirmed } from './comms';
import { mentionsWhatsApp } from '../services/offlineParser';
import { findAppTarget, pickPlayer } from '../utils/mediaApps';

export type ExecContext = {
  t: TFunction;
  settings: AppSettings;
  ask: (o: AskOptions) => Promise<AskResult>;
  history: ChatTurn[];
  /** Text the user said, for general questions. */
  utterance: string;
  aiAvailable: boolean;
};

/** What the assistant should say afterwards. `silent` = nothing to say (e.g. stop). */
export type ExecResult = { say: string; silent?: boolean; draft?: Draft | null };

/**
 * Multi-turn drafts: when information is missing we remember what we were doing,
 * so "Remind me to take my tablet" → "What time?" → "8 pm" works even offline.
 */
export type Draft =
  | { kind: 'reminder'; title?: string; type?: Reminder['type']; recurrence?: Reminder['recurrence'] }
  | { kind: 'sms'; contact: MatchableContact; channel?: MessageChannel };

type MessageChannel = 'sms' | 'whatsapp';

const SCREEN_ROUTE: Record<ScreenName, Parameters<typeof navigate>[0]> = {
  home: 'Home',
  conversation: 'Conversation',
  reminders: 'Reminders',
  reader: 'Reader',
  emergency: 'Emergency',
  settings: 'Settings',
  accessibility: 'AccessibilitySetup',
};

async function confirm(ctx: ExecContext, r: IntentResult, message: string, danger = false): Promise<boolean> {
  if (!needsConfirmation(r.intent, ctx.settings.prefs.confirmationLevel, r.confidence)) return true;
  const res = await ctx.ask({
    message,
    danger,
    note: r.confidence < 0.6 && r.source === 'ai' ? ctx.t('low_confidence') : undefined,
  });
  return res.confirmed;
}

// ---------------------------------------------------------------------------- contacts

async function resolveContact(ctx: ExecContext, spokenName: string | undefined): Promise<MatchableContact | { error: string }> {
  const { t } = ctx;
  if (!spokenName) return { error: t('contact_not_found', { name: '' }) };
  const trusted = (await trustedRepo.all()).map(c => ({ id: c.id, name: c.name, phone: c.phone, relationship: c.relationship }));

  let device: MatchableContact[] = [];
  // Trusted contacts work without the contacts permission; only ask if we need the phone book.
  const quick = matchContact(spokenName, [], trusted);
  if (quick.kind !== 'single') {
    if (await ensurePermission('contacts', t, ctx.ask)) {
      try {
        device = await getDeviceContacts();
      } catch {
        device = [];
      }
    } else if (quick.kind === 'none') {
      return { error: t('contacts_needed') };
    }
  }

  const match = quick.kind === 'single' ? quick : matchContact(spokenName, device, trusted);
  if (match.kind === 'none') return { error: t('contact_not_found', { name: spokenName }) };
  if (match.kind === 'single') return match.contact;
  const pick = await ctx.ask({
    message: t('contact_which'),
    choices: match.candidates.map(c => `${c.name} (${c.phone.slice(-4)})`),
    speakIt: true,
  });
  if (!pick.confirmed || pick.choice === undefined) return { error: t('cancelled') };
  return match.candidates[pick.choice];
}

// ---------------------------------------------------------------------------- reminders

async function findReminder(ref: string | undefined): Promise<Reminder | null> {
  const all = await remindersRepo.all();
  if (!ref) return null;
  const hits = fuzzyFind(ref, all.map(r => ({ ...r, name: r.title })), 0.6);
  if (hits.length) return hits[0];
  const words = ref.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return all.find(r => words.some(w => r.title.toLowerCase().includes(w))) ?? null;
}

async function createReminder(ctx: ExecContext, r: IntentResult, draft: Draft | null): Promise<ExecResult> {
  const { t, settings } = ctx;
  const lang = settings.language;
  const p = r.parameters;
  const prior = draft?.kind === 'reminder' ? draft : undefined;
  const title = p.title?.trim() || prior?.title || 'Reminder';
  const type = p.reminder_type ?? prior?.type ?? 'task';
  const recurrence = p.recurrence ?? prior?.recurrence ?? 'none';
  const when = p.datetime ? parseLocalDateTime(p.datetime) : null;
  if (!when) {
    return { say: t('reminder_needs_time'), draft: { kind: 'reminder', title, type, recurrence } };
  }
  const localDateTime = p.datetime!.slice(0, 16);
  const whenText = describeWhen({ recurrence }, when, lang);
  if (!(await confirm(ctx, r, t('confirm_reminder', { title, when: whenText })))) return { say: t('cancelled') };
  await ensurePermission('notifications', t, ctx.ask);
  try {
    const { nextAt } = await saveReminder({ title, type, localDateTime, recurrence }, lang);
    return { say: t('reminder_created', { title, when: describeWhen({ recurrence }, nextAt, lang) }) };
  } catch (e) {
    if (e instanceof ReminderInPastError) return { say: t('reminder_in_past'), draft: { kind: 'reminder', title, type, recurrence } };
    return { say: t('action_failed') };
  }
}

// ---------------------------------------------------------------------------- main executor

export async function execute(ctx: ExecContext, r: IntentResult, draft: Draft | null): Promise<ExecResult> {
  const { t, settings } = ctx;
  const lang = settings.language;
  const p = r.parameters;

  // Continue an SMS draft: the user's next sentence is the message body.
  if (draft?.kind === 'sms' && r.intent !== 'stop_speaking' && r.intent !== 'emergency_help') {
    const message = (r.intent === 'prepare_sms' && p.message) || ctx.utterance;
    return sendSms(ctx, draft.contact, message, draft.channel);
  }
  // A bare time after "what time?" arrives as create_reminder (offline) or unknown/general (AI).
  if (draft?.kind === 'reminder' && r.intent !== 'create_reminder' && r.intent !== 'stop_speaking' && r.intent !== 'emergency_help') {
    return { say: t('reminder_needs_time'), draft };
  }

  switch (r.intent) {
    case 'stop_speaking':
      stopSpeaking();
      return { say: '', silent: true };

    case 'repeat_last_response': {
      const last = getLastSpoken();
      return { say: last || t('nothing_to_repeat') };
    }

    case 'general_question': {
      if (!ctx.aiAvailable) return { say: t('ai_offline_spoken') };
      try {
        const answer = await respond(settings.serverUrl, ctx.utterance, lang, settings.prefs.simplifiedLanguage, ctx.history);
        return { say: answer || r.natural_language_response || t('didnt_understand') };
      } catch {
        return { say: r.natural_language_response || t('ai_offline_spoken') };
      }
    }

    case 'create_reminder':
      return createReminder(ctx, r, draft);

    case 'update_reminder': {
      const existing = await findReminder(p.reminder_ref ?? p.title);
      if (!existing) return { say: t('reminder_not_found') };
      const when = p.datetime ? parseLocalDateTime(p.datetime) : parseLocalDateTime(existing.localDateTime);
      if (!when) return { say: t('reminder_needs_time') };
      const updated = {
        ...existing,
        title: p.title?.trim() || existing.title,
        localDateTime: p.datetime ? p.datetime.slice(0, 16) : existing.localDateTime,
        recurrence: p.recurrence ?? existing.recurrence,
      };
      const whenText = describeWhen(updated, when, lang);
      if (!(await confirm(ctx, r, t('confirm_reminder', { title: updated.title, when: whenText })))) return { say: t('cancelled') };
      try {
        const { nextAt } = await saveReminder(updated, lang);
        return { say: t('reminder_updated', { title: updated.title, when: describeWhen(updated, nextAt, lang) }) };
      } catch (e) {
        return { say: e instanceof ReminderInPastError ? t('reminder_in_past') : t('action_failed') };
      }
    }

    case 'delete_reminder': {
      const existing = await findReminder(p.reminder_ref ?? p.title);
      if (!existing) return { say: t('reminder_not_found') };
      if (!(await confirm(ctx, r, t('confirm_delete_reminder', { title: existing.title }), true))) return { say: t('cancelled') };
      await deleteReminder(existing.id);
      return { say: t('reminder_deleted') };
    }

    case 'list_reminders': {
      const next = await upcomingReminders(3);
      if (!next.length) return { say: t('reminders_list_none') };
      return { say: `${t('reminders_list_intro')} ${next.map(x => `${x.reminder.title}, ${describeWhen(x.reminder, x.at, lang)}`).join('. ')}.` };
    }

    case 'daily_summary': {
      const today = await todaysReminders();
      if (!today.length) return { say: t('summary_none') };
      const items = today.map(x => `${formatTime(x.at, lang)}, ${x.reminder.title}`).join('. ');
      return { say: `${t('summary_intro', { count: today.length })} ${items}.` };
    }

    case 'play_media':
      return playMedia(ctx, r);

    case 'search_app':
      return searchApp(ctx, r);

    case 'media_control': {
      const c = p.control ?? 'pause';
      const volume: Record<string, VolumeAction> = {
        volume_up: 'up', volume_down: 'down', mute: 'mute', unmute: 'unmute', volume_max: 'max',
      };
      if (volume[c]) {
        const level = await adjustVolume(volume[c]).catch(() => null);
        // Android shows the volume bar and the sound itself changes, so nothing needs to be said.
        return level === null ? { say: t('action_failed') } : { say: '', silent: true };
      }
      mediaControl(c as MediaAction);
      return { say: '', silent: true };
    }

    case 'get_directions': {
      const place = p.query?.trim();
      if (!place) return { say: t('directions_needs_place') };
      if (!(await confirm(ctx, r, t('confirm_directions', { place })))) return { say: t('cancelled') };
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
      const ok = await openUrl(url, 'com.google.android.apps.maps');
      return { say: ok ? t('directions_opened', { place }) : t('action_failed') };
    }

    case 'flashlight': {
      const on = p.state !== 'off';
      const ok = await setFlashlight(on);
      return { say: ok ? t(on ? 'flashlight_on' : 'flashlight_off') : t('flashlight_failed') };
    }

    case 'set_alarm':
      return setAlarm(ctx, r);

    case 'set_timer': {
      const seconds = p.duration_seconds;
      if (!seconds || seconds < 1) return { say: t('timer_needs_length') };
      const duration = formatDuration(seconds, t);
      if (!(await confirm(ctx, r, t('confirm_timer', { duration })))) return { say: t('cancelled') };
      const ok = await setClockTimer(seconds, p.title?.trim() ?? '');
      return { say: ok ? t('timer_set', { duration }) : t('clock_failed') };
    }

    case 'create_note':
      return createNote(ctx, r);

    case 'search_notes': {
      const found = await notesRepo.search(p.query ?? ctx.utterance);
      if (!found.length) return { say: t('notes_none') };
      return { say: t('notes_found', { count: found.length, first: found[0].text }) };
    }

    case 'remember_fact': {
      const text = (p.fact ?? '').trim();
      if (!text) return { say: t('didnt_understand') };
      if (!(await confirm(ctx, r, t('confirm_fact', { text })))) return { say: t('cancelled') };
      await factsRepo.add(text);
      return { say: t('fact_saved') };
    }

    case 'read_text':
      if (!(await confirm(ctx, r, t('confirm_navigate', { screen: t('screen_reader') })))) return { say: t('cancelled') };
      navigate('Reader', { autoCapture: true });
      return { say: t('opening_reader') };

    case 'emergency_help':
      // The Emergency screen runs the visible countdown with a large Cancel button; nothing is sent without confirmation.
      navigate('Emergency', { startSos: true });
      return { say: t('opening_emergency') };

    case 'call_contact': {
      const c = await resolveContact(ctx, p.contact_name);
      if ('error' in c) return { say: c.error };
      if (!(await confirm(ctx, r, t('confirm_call', { name: c.name })))) return { say: t('cancelled') };
      return { say: await callConfirmed(c.name, c.phone, t, ctx.ask) };
    }

    case 'prepare_sms': {
      const c = await resolveContact(ctx, p.contact_name);
      if ('error' in c) return { say: c.error };
      // Trust the user's own words too, in case the AI left the channel out.
      const channel: MessageChannel = p.channel === 'whatsapp' || mentionsWhatsApp(ctx.utterance) ? 'whatsapp' : 'sms';
      if (!p.message?.trim()) return { say: t('confirm_sms_no_text', { name: c.name }), draft: { kind: 'sms', contact: c, channel } };
      return sendSms(ctx, c, p.message, channel);
    }

    case 'open_application': {
      const name = p.app_name?.trim();
      if (!name) return { say: t('didnt_understand') };
      const apps = await getLaunchableApps();
      const hits = fuzzyFind(name, apps.map(a => ({ ...a, name: a.label })));
      if (!hits.length) return { say: t('app_not_found', { app: name }) };
      let app = hits[0];
      if (hits.length > 1) {
        const pick = await ctx.ask({ message: t('contact_which'), choices: hits.slice(0, 4).map(h => h.label), speakIt: true });
        if (!pick.confirmed || pick.choice === undefined) return { say: t('cancelled') };
        app = hits[pick.choice];
      }
      if (!(await confirm(ctx, r, t('confirm_open_app', { app: app.label })))) return { say: t('cancelled') };
      const ok = await launchApp(app.packageName);
      return { say: ok ? t('app_opened', { app: app.label }) : t('action_failed') };
    }

    case 'navigate': {
      const screen = p.screen ?? 'home';
      const label = t(`screen_${screen}` as StringKey);
      if (!(await confirm(ctx, r, t('confirm_navigate', { screen: label })))) return { say: t('cancelled') };
      navigate(SCREEN_ROUTE[screen]);
      return { say: label };
    }

    case 'read_notifications': {
      if (!(await isNotificationAccessEnabled())) {
        navigate('Settings');
        return { say: t('notifications_access_needed') };
      }
      const allowed = settings.allowedNotificationApps;
      if (!allowed.length) {
        navigate('Settings');
        return { say: t('notif_access_hint') };
      }
      const list = (await getActiveNotifications()).filter(n => allowed.includes(n.packageName)).slice(0, 5);
      if (!list.length) return { say: t('notifications_none') };
      const items = list.map(n => `${n.app}. ${n.title}. ${n.text}`).join('. ');
      return { say: `${t('notifications_intro', { count: list.length })} ${items}` };
    }

    case 'unknown':
    default:
      return { say: r.natural_language_response || t('didnt_understand') };
  }
}

// ---------------------------------------------------------------------------- media & search

async function installedPackages(): Promise<{ apps: LaunchableApp[]; set: Set<string> }> {
  const apps = await getLaunchableApps().catch(() => [] as LaunchableApp[]);
  return { apps, set: new Set(apps.map(a => a.packageName)) };
}

/** An installed app the user named that ROOSTER has no special support for ("play X on Hotstar"). */
function findInstalledApp(apps: LaunchableApp[], spoken: string): LaunchableApp | undefined {
  return fuzzyFind(spoken, apps.map(a => ({ ...a, name: a.label })))[0];
}

/**
 * Starts playback in the named (or best installed) media app. Apps that support play-from-search
 * start playing straight away; otherwise their search results open for the user to pick.
 */
async function playMedia(ctx: ExecContext, r: IntentResult): Promise<ExecResult> {
  const { t } = ctx;
  const p = r.parameters;
  const query = p.query?.trim();
  if (!query) return { say: t('play_needs_query') };
  const { apps, set } = await installedPackages();
  const named = p.app_name?.trim() || undefined;
  const target = findAppTarget(named) ?? (named ? undefined : pickPlayer(set));

  if (!target) {
    const other = named ? findInstalledApp(apps, named) : undefined;
    if (!other) return { say: named ? t('app_not_found', { app: named }) : t('no_player_app') };
    if (!(await confirm(ctx, r, t('confirm_play', { query, app: other.label })))) return { say: t('cancelled') };
    if (await playFromSearch(other.packageName, query)) return { say: t('play_requested', { app: other.label, query }) };
    return { say: (await launchApp(other.packageName)) ? t('app_opened_search_yourself', { app: other.label, query }) : t('action_failed') };
  }
  if (target.kind === 'web') return searchApp(ctx, r);
  if (target.packageName && !set.has(target.packageName)) {
    if (!target.webFallback || !target.searchUrl) return { say: t('app_not_installed', { app: target.label }) };
    const ok = await openUrl(target.searchUrl(query));
    return { say: ok ? t('app_missing_opened_web', { app: target.label, query }) : t('action_failed') };
  }
  if (!(await confirm(ctx, r, t('confirm_play', { query, app: target.label })))) return { say: t('cancelled') };
  // Apps differ: some start playing, some only show results, so never claim it is playing.
  if (target.canPlay && target.packageName && (await playFromSearch(target.packageName, query))) {
    return { say: t('play_requested', { app: target.label, query }) };
  }
  const ok = target.searchUrl ? await openUrl(target.searchUrl(query), target.packageName) : await launchApp(target.packageName!);
  return { say: ok ? t('play_search_fallback', { app: target.label, query }) : t('action_failed') };
}

/** Search results in the named app (YouTube, Amazon, Maps...), or Google when no app is named. */
async function searchApp(ctx: ExecContext, r: IntentResult): Promise<ExecResult> {
  const { t } = ctx;
  const p = r.parameters;
  const query = p.query?.trim();
  if (!query) return { say: t('search_needs_query') };
  const named = p.app_name?.trim() || undefined;
  const target = findAppTarget(named);

  if (!named || (target?.kind === 'web' && !target.searchUrl)) {
    if (!(await confirm(ctx, r, t('confirm_search', { query, app: 'Google' })))) return { say: t('cancelled') };
    return { say: (await webSearch(query)) ? t('search_opened', { app: 'Google', query }) : t('action_failed') };
  }
  const { apps, set } = await installedPackages();
  if (!target) {
    const other = findInstalledApp(apps, named);
    if (!other) return { say: t('app_not_found', { app: named }) };
    return { say: (await launchApp(other.packageName)) ? t('app_opened_search_yourself', { app: other.label, query }) : t('action_failed') };
  }
  if (!target.searchUrl) return { say: t('app_not_installed', { app: target.label }) };
  const installed = !target.packageName || set.has(target.packageName);
  if (!installed && !target.webFallback) return { say: t('app_not_installed', { app: target.label }) };
  if (!(await confirm(ctx, r, t('confirm_search', { query, app: target.label })))) return { say: t('cancelled') };
  const ok = await openUrl(target.searchUrl(query), installed ? target.packageName : '');
  return { say: ok ? t('search_opened', { app: target.label, query }) : t('action_failed') };
}

// ---------------------------------------------------------------------------- clock app & notes app

/** Sets the alarm in the phone's own Clock app, where the user can see and change it. */
async function setAlarm(ctx: ExecContext, r: IntentResult): Promise<ExecResult> {
  const { t, settings } = ctx;
  const p = r.parameters;
  const when = p.datetime ? parseLocalDateTime(p.datetime) : null;
  if (!when) return { say: t('alarm_needs_time') };
  const recurrence = p.recurrence ?? 'none';
  // Clock alarms have no date: a one-time alarm rings at the next matching time.
  if (recurrence === 'none' && when.getTime() - Date.now() > 24 * 3600_000) return { say: t('alarm_too_far') };
  const days = recurrence === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : recurrence === 'weekly' ? [when.getDay() + 1] : [];
  const whenText = describeWhen({ recurrence }, when, settings.language);
  if (!(await confirm(ctx, r, t('confirm_alarm', { when: whenText })))) return { say: t('cancelled') };
  const ok = await setClockAlarm(when.getHours(), when.getMinutes(), p.title?.trim() ?? '', days);
  return { say: ok ? t('alarm_set', { when: whenText }) : t('clock_failed') };
}

/** "1 hour 5 minutes", "30 seconds" in the user's language. */
function formatDuration(seconds: number, t: TFunction): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${t(h === 1 ? 'unit_hour' : 'unit_hours')}`);
  if (m) parts.push(`${m} ${t(m === 1 ? 'unit_minute' : 'unit_minutes')}`);
  if (s || !parts.length) parts.push(`${s} ${t(s === 1 ? 'unit_second' : 'unit_seconds')}`);
  return parts.join(' ');
}

/**
 * Puts the note into the phone's notes app (Keep, OnePlus Notes, ...). Asks which app the first time
 * there is more than one, then remembers it. Only if no notes app exists is the note kept in ROOSTER.
 */
async function createNote(ctx: ExecContext, r: IntentResult): Promise<ExecResult> {
  const { t } = ctx;
  const text = (r.parameters.note_text ?? '').trim();
  if (!text) return { say: t('note_needs_text') };
  const apps = await getNotesApps().catch(() => []);
  if (!apps.length) {
    if (!(await confirm(ctx, r, t('confirm_note', { text })))) return { say: t('cancelled') };
    await notesRepo.add(text);
    return { say: t('notes_app_missing') };
  }
  let app = apps.find(a => a.preferred) ?? (apps.length === 1 ? apps[0] : undefined);
  if (!app) {
    const pick = await ctx.ask({ message: t('notes_app_which'), choices: apps.slice(0, 4).map(a => a.label), speakIt: true });
    if (!pick.confirmed || pick.choice === undefined) return { say: t('cancelled') };
    app = apps[pick.choice];
  }
  if (!(await confirm(ctx, r, t('confirm_note_app', { app: app.label, text })))) return { say: t('cancelled') };
  const ok = await saveToNotesApp(app.packageName, text);
  return { say: ok ? t('note_app_opened', { app: app.label }) : t('action_failed') };
}

async function sendSms(ctx: ExecContext, contact: MatchableContact, message: string, channel: MessageChannel = 'sms'): Promise<ExecResult> {
  const { t } = ctx;
  const text = message.trim();
  if (!text) return { say: t('confirm_sms_no_text', { name: contact.name }), draft: { kind: 'sms', contact, channel } };
  const confirmKey = channel === 'whatsapp' ? 'confirm_whatsapp' : 'confirm_sms';
  const res = await ctx.ask({ message: t(confirmKey, { name: contact.name, message: text }) });
  if (!res.confirmed) return { say: t('cancelled') };
  if (channel === 'whatsapp') {
    // Opens the chat with the text typed; the user presses send in WhatsApp.
    const opened = await openWhatsAppChat(contact.phone, text);
    if (opened === 'opened') {
      // Read their reply aloud when it arrives (only this person, only for a while).
      watchWhatsAppReplies(contact.name, SPEECH_LOCALE[ctx.settings.language], t('whatsapp_reply'));
      const canHear = await isNotificationAccessEnabled().catch(() => false);
      return { say: t(canHear ? 'whatsapp_opened' : 'whatsapp_opened_no_access', { name: contact.name }) };
    }
    return { say: t(opened === 'bad_number' ? 'whatsapp_bad_number' : 'whatsapp_not_installed', { name: contact.name }) };
  }
  const out = await messageConfirmed([contact], text, t, ctx.ask);
  return { say: out.say };
}
