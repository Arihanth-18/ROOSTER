import type { IntentParameters, IntentResult, Intent, ScreenName } from '../types';
import { toLocalDateTime } from '../utils/dates';

/**
 * Rule-based fallback used when the AI backend is unreachable. It covers only the core,
 * safety-relevant commands (call, message, reminder, SOS, read text, stop/repeat, navigation)
 * in English, Hindi and Kannada. Anything else returns null and the app says AI is offline.
 */

const result = (intent: Intent, parameters: IntentParameters = {}, missing: string[] = []): IntentResult => ({
  intent,
  confidence: 0.6,
  parameters,
  missing_information: missing,
  requires_confirmation: ['call_contact', 'prepare_sms', 'emergency_help', 'delete_reminder'].includes(intent),
  natural_language_response: '',
  source: 'offline',
});

const has = (text: string, re: RegExp) => re.test(text);

const STOP = /^(stop|stop talking|be quiet|ruko|ruk jao|bas|chup|रुको|रुक जाओ|बस|चुप|ನಿಲ್ಲಿಸು|ನಿಲ್ಲಿಸಿ|ಸಾಕು)[\s.!]*$/i;
const REPEAT = /\b(repeat|say (that|it) again|again)\b|phir se|dobara|फिर से|दोबारा|ಮತ್ತೆ ಹೇಳಿ|ಮತ್ತೊಮ್ಮೆ|ಪುನಃ/i;
const EMERGENCY = /\b(help me|emergency|sos)\b|^help$|bachao|madad|बचाओ|मदद|आपातकाल|ಸಹಾಯ|ಕಾಪಾಡಿ|ತುರ್ತು/i;
const READ_TEXT = /\b(read (this|the|my)? ?(text|label|paper|letter|document|medicine))|\bscan\b|पढ़ो|पढ़कर|ಓದಿ|ಓದು/i;
const LIST_REMINDERS = /\b(my reminders|show reminders|list reminders)\b|रिमाइंडर दिखा|ರಿಮೈಂಡರ್/i;
const SUMMARY = /\b(what do i have today|today'?s (schedule|plan)|my day)\b|आज क्या है|आज का|ಇಂದು ಏನು|ಇವತ್ತು/i;
const NOTIFS = /\b(read (my )?notifications)\b|नोटिफिकेशन|ಅಧಿಸೂಚನೆ/i;

const NAV: Array<[RegExp, ScreenName]> = [
  [/\b(go )?(back )?home\b|होम|ಮುಖಪುಟ/i, 'home'],
  [/\b(go to |open )?(reminders|notes)\b/i, 'reminders'],
  [/\b(go to |open )?settings\b|सेटिंग|ಸೆಟ್ಟಿಂಗ್/i, 'settings'],
  [/\b(go to |open )?(emergency|sos) (screen|page)\b/i, 'emergency'],
  [/\b(go to |open )?(text )?reader\b/i, 'reader'],
];

const CALL_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:call|phone|dial|ring)\s+(.+?)[\s.!]*$/i,
  /^(.+?)\s+(?:ko\s+)?(?:call|phone|fon)\s+(?:karo|karen|kijiye|lagao|laga do)[\s.!]*$/i,
  /^(.+?)\s*(?:को)?\s*(?:फोन|फ़ोन|कॉल)\s*(?:करो|करें|कीजिए|लगाओ|लगा दो)[\s।!]*$/,
  /^(.+?)\s*(?:ಗೆ|ಅವರಿಗೆ)?\s*(?:ಕರೆ|ಫೋನ್|ಕಾಲ್)\s*(?:ಮಾಡು|ಮಾಡಿ)[\s.!]*$/,
];

const SMS_PATTERNS: RegExp[] = [
  /^(?:send\s+(?:a\s+)?)?(?:message|sms|text)\s+(?:to\s+)?(.+?)(?:\s+(?:saying|that|:)\s+(.+))?[\s.!]*$/i,
  /^(.+?)\s*(?:को)\s*(?:मैसेज|संदेश|एसएमएस)\s*(?:भेजो|भेजें|करो)(?:\s+(?:कि)\s+(.+))?[\s।]*$/,
  /^(.+?)\s*(?:ಗೆ)\s*(?:ಮೆಸೇಜ್|ಸಂದೇಶ)\s*(?:ಕಳುಹಿಸು|ಕಳುಹಿಸಿ)[\s.!]*$/,
];

const OPEN_APP: RegExp[] = [
  /^(?:open|launch|start)\s+(.+?)(?:\s+app)?[\s.!]*$/i,
  /^(.+?)\s+(?:kholo|khol do)[\s.!]*$/i,
  /^(.+?)\s+(?:खोलो|खोल दो|खोलें)[\s।]*$/,
  /^(.+?)\s+(?:ತೆರೆ|ತೆರೆಯಿರಿ|ಓಪನ್ ಮಾಡಿ)[\s.!]*$/,
];

const REMIND = /\b(remind me|reminder|alarm)\b|याद दिला|रिमाइंडर|ನೆನಪಿಸು|ನೆನಪಿಸಿ|ರಿಮೈಂಡರ್/i;
const TIME = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|बजे|ಗಂಟೆಗೆ|ಗಂಟೆ)?/i;
const TOMORROW = /\b(tomorrow|kal)\b|कल|ನಾಳೆ/i;
const DAILY = /\b(every ?day|daily|each day|roz|rozana)\b|रोज़|रोज|हर दिन|ಪ್ರತಿದಿನ|ದಿನಾಲೂ/i;
const WEEKLY = /\b(every week|weekly)\b|हर हफ्ते|ಪ್ರತಿ ವಾರ/i;
const EVENING = /\b(evening|night|shaam|raat)\b|शाम|रात|ಸಂಜೆ|ರಾತ್ರಿ/i;
const MEDICINE = /\b(medicine|tablet|pill|dawai|goli)\b|दवा|दवाई|गोली|ಔಷಧ|ಮಾತ್ರೆ/i;

function parseReminder(text: string, now: Date): IntentResult {
  const recurrence = DAILY.test(text) ? 'daily' : WEEKLY.test(text) ? 'weekly' : 'none';
  const type = MEDICINE.test(text) ? 'medicine' : 'task';
  const m = TIME.exec(text);
  if (!m) return result('create_reminder', { recurrence, reminder_type: type, title: cleanTitle(text) }, ['time']);

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = (m[3] ?? '').toLowerCase();
  if (hour > 23 || minute > 59) return result('create_reminder', { title: cleanTitle(text) }, ['time']);
  if (/p/.test(suffix) && hour < 12) hour += 12;
  else if (/a/.test(suffix) && hour === 12) hour = 0;
  else if (!/[ap]/.test(suffix) && hour < 12 && EVENING.test(text)) hour += 12;

  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (TOMORROW.test(text)) when.setDate(when.getDate() + 1);
  else if (when <= now) when.setDate(when.getDate() + 1);

  return result('create_reminder', {
    title: cleanTitle(text),
    datetime: toLocalDateTime(when),
    recurrence,
    reminder_type: type,
  });
}

function cleanTitle(text: string): string {
  const t = text
    .replace(/\b(please|remind me( to)?|set (a )?reminder( to)?|reminder( to)?|alarm|at|tomorrow|today|every ?day|daily|weekly|in the (morning|evening))\b/gi, ' ')
    .replace(TIME, ' ')
    .replace(/याद दिलाना|याद दिलाओ|याद दिला|रिमाइंडर|कल|रोज़|रोज|बजे|ನೆನಪಿಸು|ನೆನಪಿಸಿ|ನಾಳೆ|ಪ್ರತಿದಿನ|ಗಂಟೆಗೆ/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length >= 2 ? t.charAt(0).toUpperCase() + t.slice(1) : 'Reminder';
}

export function parseOffline(input: string, now: Date = new Date()): IntentResult | null {
  const text = input.trim();
  if (!text) return null;

  if (STOP.test(text)) return result('stop_speaking');
  if (REPEAT.test(text)) return result('repeat_last_response');
  if (EMERGENCY.test(text)) return result('emergency_help');

  for (const re of SMS_PATTERNS) {
    const m = re.exec(text);
    if (m) return result('prepare_sms', { contact_name: m[1].trim(), message: m[2]?.trim() });
  }
  for (const re of CALL_PATTERNS) {
    const m = re.exec(text);
    if (m) return result('call_contact', { contact_name: m[1].trim() });
  }
  if (REMIND.test(text)) return parseReminder(text, now);
  if (READ_TEXT.test(text)) return result('read_text');
  if (NOTIFS.test(text)) return result('read_notifications');
  if (LIST_REMINDERS.test(text)) return result('list_reminders');
  if (SUMMARY.test(text)) return result('daily_summary');
  for (const [re, screen] of NAV) {
    if (re.test(text) && has(text, /\b(go|open|show)\b|^(home|settings|reminders)$|होम|सेटिंग|ಮುಖಪುಟ|ಸೆಟ್ಟಿಂಗ್/i)) {
      return result('navigate', { screen });
    }
  }
  for (const re of OPEN_APP) {
    const m = re.exec(text);
    if (m) return result('open_application', { app_name: m[1].trim() });
  }
  return null;
}
