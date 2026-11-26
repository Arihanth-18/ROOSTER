import NativeReminders from '../native/specs/NativeRoosterReminders';
import { remindersRepo } from '../storage/repositories';
import type { Language, Reminder } from '../types';
import { SPEECH_LOCALE } from '../types';
import { translate } from '../localization/i18n';
import { formatDateTime, nextOccurrence, occursOn, parseLocalDateTime } from '../utils/dates';

type Listener = () => void;
const listeners = new Set<Listener>();
export const onRemindersChanged = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach(l => l());

function spokenText(r: Reminder, lang: Language): string {
  const kind = translate(lang, r.type === 'medicine' ? 'type_medicine' : r.type === 'appointment' ? 'type_appointment' : 'type_task');
  return `${translate(lang, 'reminders_title')}. ${kind}: ${r.title}`;
}

async function scheduleNative(r: Reminder, lang: Language): Promise<number> {
  if (r.completed && r.recurrence === 'none') {
    NativeReminders.cancel(r.id);
    return -1;
  }
  const body = r.type === 'medicine' ? translate(lang, 'no_medical_advice') : translate(lang, 'tagline');
  return NativeReminders.schedule(r.id, r.title, body, r.localDateTime, r.recurrence, spokenText(r, lang), SPEECH_LOCALE[lang]);
}

export class ReminderInPastError extends Error {}

export async function saveReminder(
  input: Omit<Reminder, 'id' | 'createdAt' | 'completed'> & { id?: string; completed?: boolean },
  lang: Language,
): Promise<{ reminder: Reminder; nextAt: Date }> {
  const next = nextOccurrence(input.localDateTime, input.recurrence, new Date());
  if (!next) throw new ReminderInPastError('Reminder time is in the past');
  const existing = input.id ? await remindersRepo.get(input.id) : null;
  const reminder = await remindersRepo.upsert({
    ...input,
    title: input.title.trim() || 'Reminder',
    completed: input.completed ?? false,
    createdAt: existing?.createdAt,
  });
  await scheduleNative(reminder, lang);
  notify();
  return { reminder, nextAt: next };
}

export async function deleteReminder(id: string): Promise<void> {
  NativeReminders.cancel(id);
  await remindersRepo.remove(id);
  notify();
}

export async function setCompleted(r: Reminder, completed: boolean, lang: Language): Promise<void> {
  const updated = await remindersRepo.upsert({ ...r, completed });
  // Completing a repeating reminder only marks today's dose; it keeps ringing on later days.
  if (r.recurrence === 'none') {
    if (completed) NativeReminders.cancel(r.id);
    else if (nextOccurrence(r.localDateTime, 'none', new Date())) await scheduleNative(updated, lang);
  }
  notify();
}

/** Re-register every active reminder with Android (e.g. after reinstall, language change). */
export async function syncAllReminders(lang: Language): Promise<void> {
  const all = await remindersRepo.all();
  for (const r of all) {
    if (r.completed && r.recurrence === 'none') continue;
    try {
      await scheduleNative(r, lang);
    } catch {
      // A single bad record must not block the others.
    }
  }
}

export async function deleteAllReminders(): Promise<void> {
  NativeReminders.cancelAll();
  notify();
}

export function nextTriggerOf(r: Reminder, now = new Date()): Date | null {
  if (r.completed && r.recurrence === 'none') return null;
  return nextOccurrence(r.localDateTime, r.recurrence, now);
}

export async function upcomingReminders(limit = 5): Promise<Array<{ reminder: Reminder; at: Date }>> {
  const now = new Date();
  return (await remindersRepo.all())
    .map(r => ({ reminder: r, at: nextTriggerOf(r, now) }))
    .filter((x): x is { reminder: Reminder; at: Date } => x.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
}

export async function todaysReminders(): Promise<Array<{ reminder: Reminder; at: Date }>> {
  const today = new Date();
  const all = await remindersRepo.all();
  return all
    .filter(r => occursOn(r.localDateTime, r.recurrence, today))
    .map(r => {
      const base = parseLocalDateTime(r.localDateTime)!;
      const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), base.getHours(), base.getMinutes());
      return { reminder: r, at };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function describeWhen(r: Pick<Reminder, 'recurrence'>, at: Date, lang: Language): string {
  const when = formatDateTime(at, lang);
  if (r.recurrence === 'daily') return `${translate(lang, 'repeat_daily')}, ${when}`;
  if (r.recurrence === 'weekly') return `${translate(lang, 'repeat_weekly')}, ${when}`;
  return when;
}
