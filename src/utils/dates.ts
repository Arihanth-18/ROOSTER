export type Recurrence = 'none' | 'daily' | 'weekly';

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:mm" in the device's local time. */
export function toLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local ISO with offset, e.g. "2026-11-26T16:05:00+05:30" — sent to the AI so "tomorrow" resolves correctly. */
export function toLocalIsoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${toLocalDateTime(d)}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Parse "YYYY-MM-DDTHH:mm[:ss]" (any trailing offset ignored) as local wall-clock time. */
export function parseLocalDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** Mirrors ReminderScheduler.nextTrigger in Kotlin: next occurrence strictly after `after`. */
export function nextOccurrence(localDateTime: string, recurrence: Recurrence, after: Date): Date | null {
  const base = parseLocalDateTime(localDateTime);
  if (!base) return null;
  if (recurrence === 'none') return base > after ? base : null;
  const step = recurrence === 'daily' ? 1 : 7;
  const t = new Date(base);
  while (t <= after) t.setDate(t.getDate() + step);
  return t;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Does a reminder occur at any time on `day`? */
export function occursOn(localDateTime: string, recurrence: Recurrence, day: Date): boolean {
  const base = parseLocalDateTime(localDateTime);
  if (!base) return false;
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (recurrence === 'none') return isSameDay(base, day);
  if (base > new Date(startOfDay.getTime() + 86_400_000 - 1)) return false;
  if (recurrence === 'daily') return true;
  return base.getDay() === day.getDay();
}

const LOCALE_TAG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

export function formatTime(d: Date, lang: string): string {
  try {
    return d.toLocaleTimeString(LOCALE_TAG[lang] ?? 'en-IN', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }
}

/** "Saturday, 28 November" for the header date pill. */
export function formatLongDate(d: Date, lang: string): string {
  try {
    return d.toLocaleDateString(LOCALE_TAG[lang] ?? 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return d.toDateString();
  }
}

/** Short weekday and day number for the week strip: ["Sat", "28"]. */
export function formatDayChip(d: Date, lang: string): [string, string] {
  try {
    return [d.toLocaleDateString(LOCALE_TAG[lang] ?? 'en-IN', { weekday: 'short' }), String(d.getDate())];
  } catch {
    return [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], String(d.getDate())];
  }
}

export function formatDateTime(d: Date, lang: string): string {
  try {
    return d.toLocaleString(LOCALE_TAG[lang] ?? 'en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return `${d.toDateString()} ${formatTime(d, lang)}`;
  }
}
