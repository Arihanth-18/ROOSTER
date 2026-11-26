import type { AppSettings } from '../accessibility/types';
import type { AskOptions, AskResult } from '../components/DialogProvider';
import type { TFunction, StringKey } from '../localization/i18n';
import { navigate } from '../navigation/navigationRef';
import type { ChatTurn, IntentResult, Reminder, ScreenName } from '../types';
import { factsRepo, notesRepo, remindersRepo, trustedRepo } from '../storage/repositories';
import {
  getActiveNotifications,
  getDeviceContacts,
  getLaunchableApps,
  isNotificationAccessEnabled,
  launchApp,
} from '../services/device';
import { describeWhen, deleteReminder, ReminderInPastError, saveReminder, todaysReminders, upcomingReminders } from '../services/reminders';
import { getLastSpoken, stopSpeaking } from '../services/speech';
import { respond } from '../services/assistantClient';
import { fuzzyFind, matchContact, type MatchableContact } from '../utils/contactMatch';
import { formatTime, parseLocalDateTime } from '../utils/dates';
import { needsConfirmation } from './policy';
import { ensurePermission } from './permissions';
import { callConfirmed, messageConfirmed } from './comms';

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
  | { kind: 'sms'; contact: MatchableContact };

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
    return sendSms(ctx, draft.contact, message);
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

    case 'create_note': {
      const text = (p.note_text ?? '').trim();
      if (!text) return { say: t('didnt_understand') };
      if (!(await confirm(ctx, r, t('confirm_note', { text })))) return { say: t('cancelled') };
      await notesRepo.add(text);
      return { say: t('note_saved') };
    }

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
      if (!p.message?.trim()) return { say: t('confirm_sms_no_text', { name: c.name }), draft: { kind: 'sms', contact: c } };
      return sendSms(ctx, c, p.message);
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

async function sendSms(ctx: ExecContext, contact: MatchableContact, message: string): Promise<ExecResult> {
  const { t } = ctx;
  const text = message.trim();
  if (!text) return { say: t('confirm_sms_no_text', { name: contact.name }), draft: { kind: 'sms', contact } };
  const res = await ctx.ask({ message: t('confirm_sms', { name: contact.name, message: text }) });
  if (!res.confirmed) return { say: t('cancelled') };
  const out = await messageConfirmed([contact], text, t, ctx.ask);
  return { say: out.say };
}
