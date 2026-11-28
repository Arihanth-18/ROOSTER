import type { IntentParameters, IntentResult, Intent, PhoneSetting, ScreenName } from '../types';
import { toLocalDateTime } from '../utils/dates';
import { extractApp, findAppTarget } from '../utils/mediaApps';

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

const WHATSAPP = /whats\s*app|व्हाट्स\s*[एऐ]प|वॉट्स\s*[एऐ]प|ವಾಟ್ಸ/i;
/** True when the user said "WhatsApp" in any supported language. */
export const mentionsWhatsApp = (text: string) => WHATSAPP.test(text);
/** "on WhatsApp", "व्हाट्सएप पर", "ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ": dropped so the normal message patterns match. */
const WHATSAPP_VIA = /\s*(?:\b(?:on|via|through|using|in)\s+whats\s*app\b|(?:व्हाट्स|वॉट्स)\s*[एऐ]प\s*(?:पर|से)|ವಾಟ್ಸ\S*ನಲ್ಲಿ)/i;
/** "a WhatsApp (message)" -> "message", so "send a WhatsApp to Ravi" reads like "send a message to Ravi". */
const WHATSAPP_WORD = /\bwhats\s*app(?:\s+(?:message|msg|text))?\b/i;
/** Hindi/Kannada already say "message" (मैसेज / ಮೆಸೇಜ್), so the word WhatsApp is just removed. */
const WHATSAPP_WORD_LOCAL = /(?:व्हाट्स|वॉट्स)\s*[एऐ]प\s*|ವಾಟ್ಸ\S*\s*/;

const OPEN_APP: RegExp[] = [
  /^(?:open|launch|start)\s+(.+?)(?:\s+app)?[\s.!]*$/i,
  /^(.+?)\s+(?:kholo|khol do)[\s.!]*$/i,
  /^(.+?)\s+(?:खोलो|खोल दो|खोलें)[\s।]*$/,
  /^(.+?)\s+(?:ತೆರೆ|ತೆರೆಯಿರಿ|ಓಪನ್ ಮಾಡಿ)[\s.!]*$/,
];

const REMIND = /\b(remind me|reminder)\b|याद दिला|रिमाइंडर|ನೆನಪಿಸು|ನೆನಪಿಸಿ|ರಿಮೈಂಡರ್/i;
const ALARM = /\b(alarm|wake me( up)?)\b|अलार्म|जगा देना|जगाना|ಅಲಾರಾಂ|ಅಲಾರ್ಮ್|ಎಬ್ಬಿಸು|ಎಬ್ಬಿಸಿ/i;
const TIMER = /\btimer\b|टाइमर|ಟೈಮರ್/i;
const DURATION_PART =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|घंटे|घंटा|मिनट|सेकंड|ಗಂಟೆ|ನಿಮಿಷ(?:ದ)?|ಸೆಕೆಂಡ್)/gi;
const TIME = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|बजे|ಗಂಟೆಗೆ|ಗಂಟೆ)?/i;
const TOMORROW = /\b(tomorrow|kal)\b|कल|ನಾಳೆ/i;
const DAILY = /\b(every ?day|daily|each day|roz|rozana)\b|रोज़|रोज|हर दिन|ಪ್ರತಿದಿನ|ದಿನಾಲೂ/i;
const WEEKLY = /\b(every week|weekly)\b|हर हफ्ते|ಪ್ರತಿ ವಾರ/i;
const EVENING = /\b(evening|night|shaam|raat)\b|शाम|रात|ಸಂಜೆ|ರಾತ್ರಿ/i;
const MEDICINE = /\b(medicine|tablet|pill|dawai|goli)\b|दवा|दवाई|गोली|ಔಷಧ|ಮಾತ್ರೆ/i;

/** The next time matching "8 pm", "6:30", "kal 7 baje"... or null if no valid time was said. */
function parseClockTime(text: string, now: Date): Date | null {
  const m = TIME.exec(text);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = (m[3] ?? '').toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (/p/.test(suffix) && hour < 12) hour += 12;
  else if (/a/.test(suffix) && hour === 12) hour = 0;
  else if (!/[ap]/.test(suffix) && hour < 12 && EVENING.test(text)) hour += 12;

  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (TOMORROW.test(text)) when.setDate(when.getDate() + 1);
  else if (when <= now) when.setDate(when.getDate() + 1);
  return when;
}

function parseReminder(text: string, now: Date): IntentResult {
  const recurrence = DAILY.test(text) ? 'daily' : WEEKLY.test(text) ? 'weekly' : 'none';
  const type = MEDICINE.test(text) ? 'medicine' : 'task';
  const when = parseClockTime(text, now);
  if (!when) return result('create_reminder', { recurrence, reminder_type: type, title: cleanTitle(text) }, ['time']);

  return result('create_reminder', {
    title: cleanTitle(text),
    datetime: toLocalDateTime(when),
    recurrence,
    reminder_type: type,
  });
}

function parseAlarm(text: string, now: Date): IntentResult {
  const recurrence = DAILY.test(text) ? 'daily' : 'none';
  const when = parseClockTime(text, now);
  const label = text
    .replace(/\b(please|set|an?|alarm|wake me( up)?|for|at|tomorrow|today|every ?day|daily|in the (morning|evening))\b/gi, ' ')
    .replace(TIME, ' ')
    .replace(/अलार्म|लगाओ|लगा दो|सेट करो|जगा देना|जगाना|कल|रोज़|रोज|बजे|ಅಲಾರಾಂ|ಅಲಾರ್ಮ್|ಇಡು|ಇಡಿ|ಎಬ್ಬಿಸು|ಎಬ್ಬಿಸಿ|ನಾಳೆ|ಪ್ರತಿದಿನ|ಗಂಟೆಗೆ/g, ' ')
    .replace(/[\s.!।]+/g, ' ')
    .trim();
  const params: IntentParameters = { recurrence, ...(label.length >= 3 ? { title: label } : {}) };
  if (!when) return result('set_alarm', params, ['time']);
  return result('set_alarm', { ...params, datetime: toLocalDateTime(when) });
}

/** Timer length from "10 minutes", "1 hour 30 minutes", "half an hour", "5 मिनट", "10 ನಿಮಿಷ". */
export function parseDurationSeconds(text: string): number | null {
  let total = 0;
  for (const m of text.matchAll(DURATION_PART)) {
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (/^(h|घंट|ಗಂಟೆ)/.test(unit)) total += n * 3600;
    else if (/^(m|मिनट|ನಿಮಿಷ)/.test(unit)) total += n * 60;
    else total += n;
  }
  if (!total && /\bhalf an hour\b|आधा घंटा|ಅರ್ಧ ಗಂಟೆ/i.test(text)) total = 1800;
  else if (!total && /\b(an|one) hour\b|एक घंटा|ಒಂದು ಗಂಟೆ/i.test(text)) total = 3600;
  total = Math.round(total);
  return total >= 1 && total <= 86400 ? total : null;
}

// ---------------------------------------------------------------------------- media, search, maps, torch

type Control = NonNullable<IntentParameters['control']>;
const MEDIA_CONTROLS: Array<[RegExp, Control]> = [
  [/^(?:please\s+)?(?:pause|hold)(?:\s+(?:the\s+)?(?:music|song|video|it|playback))?[\s.!]*$|^stop\s+(?:the\s+)?(?:music|song|video|playing|playback)[\s.!]*$/i, 'pause'],
  [/(?:गाना|वीडियो|म्यूजिक|म्यूज़िक|संगीत)\s*(?:रोको|रोक दो|बंद करो|बंद कर दो)/, 'pause'],
  [/(?:ಹಾಡು|ವಿಡಿಯೋ|ಸಂಗೀತ)\s*(?:ನಿಲ್ಲಿಸು|ನಿಲ್ಲಿಸಿ|ನಿಲ್ಲಿಸಿಬಿಡು)/, 'pause'],
  [/^(?:please\s+)?(?:resume|continue|unpause)(?:\s+(?:the\s+)?(?:music|song|video|playing|playback))?[\s.!]*$|^play again[\s.!]*$/i, 'play'],
  [/(?:गाना|वीडियो)\s*(?:फिर से\s*)?(?:चालू करो|शुरू करो)|ಹಾಡು\s*(?:ಮುಂದುವರಿಸು|ಮುಂದುವರಿಸಿ)/, 'play'],
  [/^(?:please\s+)?(?:next|skip)(?:\s+(?:the\s+)?(?:song|track|video|one|this))?[\s.!]*$|^play (?:the )?next (?:song|track|video)/i, 'next'],
  [/अगला\s*(?:गाना|वीडियो)|ಮುಂದಿನ\s*(?:ಹಾಡು|ವಿಡಿಯೋ)/, 'next'],
  [/^(?:please\s+)?(?:previous|go back)(?:\s+(?:song|track|video))?[\s.!]*$|^play (?:the )?previous (?:song|track|video)/i, 'previous'],
  [/पिछला\s*(?:गाना|वीडियो)|ಹಿಂದಿನ\s*(?:ಹಾಡು|ವಿಡಿಯೋ)/, 'previous'],
  [/\b(?:full|max(?:imum)?) volume\b|पूरी आवाज़|ಪೂರ್ಣ ವಾಲ್ಯೂಮ್/i, 'volume_max'],
  [/\b(?:volume up|increase (?:the )?volume|raise (?:the )?volume|louder|turn (?:it|the volume) up)\b/i, 'volume_up'],
  [/आवाज़?\s*(?:बढ़ाओ|बढ़ा दो|तेज़ करो|तेज करो|ज़्यादा करो)|(?:ವಾಲ್ಯೂಮ್|ಧ್ವನಿ|ಸೌಂಡ್)\s*(?:ಹೆಚ್ಚಿಸು|ಹೆಚ್ಚಿಸಿ|ಜಾಸ್ತಿ ಮಾಡು|ಜಾಸ್ತಿ ಮಾಡಿ)/, 'volume_up'],
  [/\b(?:volume down|decrease (?:the )?volume|reduce (?:the )?volume|lower (?:the )?volume|quieter|softer|turn (?:it|the volume) down)\b/i, 'volume_down'],
  [/आवाज़?\s*(?:कम करो|कम कर दो|धीमी करो|घटाओ)|(?:ವಾಲ್ಯೂಮ್|ಧ್ವನಿ|ಸೌಂಡ್)\s*(?:ಕಡಿಮೆ ಮಾಡು|ಕಡಿಮೆ ಮಾಡಿ|ಇಳಿಸು|ಇಳಿಸಿ)/, 'volume_down'],
  [/^(?:please\s+)?unmute\b/i, 'unmute'],
  [/^(?:please\s+)?mute\b|\bmute (?:the )?(?:sound|volume|music|video)\b|आवाज़?\s*बंद करो|ಮ್ಯೂಟ್ ಮಾಡು|ಮ್ಯೂಟ್ ಮಾಡಿ/i, 'mute'],
];

const MEDIA_WORDS = /\b(songs?|music|videos?|bhajans?|movie|film)\b|गाना|गाने|भजन|वीडियो|संगीत|ಹಾಡು|ಹಾಡುಗಳು|ವಿಡಿಯೋ|ಭಜನೆ|ಸಂಗೀತ/i;
const PLAY_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:play|put on)\s+(.+?)[\s.!]*$/i,
  /^(.+?)\s+(?:चलाओ|चला दो|बजाओ|बजा दो|सुनाओ|प्ले करो|लगाओ|लगा दो)[\s।!]*$/,
  /^(.+?)\s*(?:ಪ್ಲೇ\s*ಮಾಡು|ಪ್ಲೇ\s*ಮಾಡಿ|ಹಾಕು|ಹಾಕಿ)[\s.!]*$/,
];

const SEARCH_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:search|look up|google)\s+(?:for\s+)?(.+?)[\s.!?]*$/i,
  /^(.+?)\s+(?:सर्च करो|सर्च कीजिए|सर्च कर दो|खोजो|ढूंढो|ढूँढो)[\s।!]*$/,
  /^(.+?)\s*(?:ಹುಡುಕು|ಹುಡುಕಿ|ಸರ್ಚ್\s*ಮಾಡು|ಸರ್ಚ್\s*ಮಾಡಿ)[\s.!]*$/,
];

const DIRECTIONS_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:get\s+|show\s+(?:me\s+)?|give\s+(?:me\s+)?)?(?:the\s+)?(?:directions|way|route|navigate|navigation)\s+to\s+(.+?)[\s.!?]*$/i,
  /^(?:please\s+)?take me to\s+(.+?)[\s.!?]*$/i,
  /^how (?:do i|can i|to) (?:get|go|reach) to\s+(.+?)[\s.!?]*$/i,
  /^(.+?)\s*(?:का|के लिए|तक का)\s*रास्ता\s*(?:बताओ|दिखाओ|बताइए)[\s।!]*$/,
  /^(.+?)\s*(?:ಗೆ)?\s*ದಾರಿ\s*(?:ತೋರಿಸು|ತೋರಿಸಿ|ಹೇಳು|ಹೇಳಿ)[\s.!]*$/,
];
const ROOSTER_SCREEN = /^(?:the\s+)?(?:home|settings|reminders|notes|reader|emergency)(?:\s+(?:screen|page))?$/i;

const TORCH = /\b(?:torch|flash ?light)\b|टॉर्च|ಟಾರ್ಚ್/i;
const TORCH_OFF = /\boff\b|बंद|बुझा|ಆಫ್|ಆರಿಸು|ಆರಿಸಿ/i;

/** "open Spotify and play Arijit", "YouTube खोलो और भजन चलाओ": the app from the first half, the action from the second. */
const OPEN_AND_DO: RegExp[] = [
  /^(?:please\s+)?(?:open|launch|start|go to)\s+(.+?)\s*,?\s+(?:and\s+(?:then\s+)?|then\s+)(.+?)[\s.!]*$/i,
  /^(.+?)\s+(?:खोलो|खोल दो|खोलें|खोलकर)\s+(?:और\s+|फिर\s+)?(.+?)[\s।!]*$/,
  /^(.+?)\s+(?:ತೆರೆ|ತೆರೆಯಿರಿ|ತೆರೆದು|ಓಪನ್ ಮಾಡಿ)\s+(?:ಮತ್ತು\s+|ನಂತರ\s+)?(.+?)[\s.!]*$/,
];

export function parseOpenAndDo(text: string): IntentResult | null {
  for (const re of OPEN_AND_DO) {
    const m = re.exec(text.trim());
    if (!m) continue;
    const appWords = m[1].trim();
    let action = m[2].trim();
    // "open Spotify and play" / "...and search" with nothing after: play/search "music"/ask later.
    if (/^(?:play|search|चलाओ|बजाओ|ಪ್ಲೇ ಮಾಡಿ)$/i.test(action)) action = `${action} music`;
    const r = parseMedia(action);
    if (!r || (r.intent !== 'play_media' && r.intent !== 'search_app')) continue;
    const app = findAppTarget(appWords);
    return { ...r, parameters: { ...r.parameters, app_name: app?.label ?? appWords } };
  }
  return null;
}

/** Torch, directions, play and search. (Media controls are checked earlier in parseOffline.) */
function parseMedia(text: string): IntentResult | null {
  if (TORCH.test(text) && /\b(?:turn|switch|on|off)\b|जलाओ|चालू|ऑन|बंद|बुझा|ಆನ್|ಆಫ್|ಹಚ್ಚು|ಹಚ್ಚಿ|ಆರಿಸು|ಆರಿಸಿ/i.test(text)) {
    return result('flashlight', { state: TORCH_OFF.test(text) ? 'off' : 'on' });
  }

  for (const re of DIRECTIONS_PATTERNS) {
    const m = re.exec(text);
    if (m && !ROOSTER_SCREEN.test(m[1].trim())) return result('get_directions', { query: m[1].trim() });
  }

  for (const re of PLAY_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const { rest, app } = extractApp(m[1]);
    // "ಹಾಕು"/"लगाओ" are everyday verbs: only treat them as "play" with a song/video word or an app.
    if (re !== PLAY_PATTERNS[0] && !app && !MEDIA_WORDS.test(m[1])) continue;
    const query = rest.replace(/^(?:some|a|an|the)\s+/i, '').trim();
    return result('play_media', { ...(query ? { query } : {}), ...(app ? { app_name: app.label } : {}) }, query ? [] : ['query']);
  }

  for (const re of SEARCH_PATTERNS) {
    const m = re.exec(text);
    if (!m || /\bnotes?\b|नोट|ಟಿಪ್ಪಣಿ/i.test(m[1])) continue;
    const { rest, app } = extractApp(m[1]);
    const query = rest.replace(/^for\s+/i, '').trim();
    return result('search_app', { ...(query ? { query } : {}), ...(app ? { app_name: app.label } : {}) }, query ? [] : ['query']);
  }
  return null;
}

const FILL_FORM =
  /\b(?:fill|complete)\s+(?:in\s+|out\s+|up\s+)?(?:this|the|my)?\s*(?:form|details)\b|\bfill (?:it|this) (?:in|up)\b|\bautofill\b|(?:फॉर्म|फ़ॉर्म|फार्म)\s*(?:भरो|भर दो|भरें)|(?:ಫಾರ್ಮ್|ಅರ್ಜಿ)\s*(?:ತುಂಬು|ತುಂಬಿ|ಭರ್ತಿ)/i;

// ---------------------------------------------------------------------------- phone settings & status

const SETTING_WORDS: Array<[RegExp, PhoneSetting]> = [
  [/\bphone settings\b|फ़ोन की सेटिंग|फोन की सेटिंग|ಫೋನ್ ಸೆಟ್ಟಿಂಗ್/i, 'settings'],
  [/\b(?:airplane|aeroplane|flight)\s*mode\b|फ़्लाइट\s*मोड|फ्लाइट\s*मोड|एयरप्लेन\s*मोड|ಫ್ಲೈಟ್\s*ಮೋಡ್|ಏರೋಪ್ಲೇನ್\s*ಮೋಡ್/i, 'airplane_mode'],
  [/\b(?:battery saver|power sav\w*|power saver)\b|बैटरी\s*सेवर|ಬ್ಯಾಟರಿ\s*ಸೇವರ್/i, 'battery_saver'],
  [/\b(?:do not disturb|dnd)\b|डू नॉट डिस्टर्ब|ಡು ನಾಟ್ ಡಿಸ್ಟರ್ಬ್/i, 'do_not_disturb'],
  [/\b(?:wi-?fi|wireless)\b|वाई-?फ़ाई|वाई-?फाई|वाईफाई|ವೈ-?ಫೈ/i, 'wifi'],
  [/\b(?:mobile data|cellular data|data connection|internet)\b|मोबाइल\s*डेटा|इंटरनेट|ಮೊಬೈಲ್\s*ಡೇಟಾ|ಇಂಟರ್ನೆಟ್/i, 'mobile_data'],
  [/\bbluetooth\b|ब्लूटूथ|ಬ್ಲೂಟೂತ್/i, 'bluetooth'],
  [/\b(?:location|gps)\b|लोकेशन|जीपीएस|ಲೊಕೇಶನ್|ಜಿಪಿಎಸ್/i, 'location'],
  [/\b(?:hotspot|tethering)\b|हॉटस्पॉट|ಹಾಟ್\S*\s*ಸ್ಪಾಟ್|ಹಾಟ್‌ಸ್ಪಾಟ್/i, 'hotspot'],
  [/\bnfc\b/i, 'nfc'],
  [/\b(?:silent|vibrat\w*|ringer|ring mode|sound mode|general mode)\b|साइलेंट|वाइब्रेट|ಸೈಲೆಂಟ್|ವೈಬ್ರೇಟ್/i, 'ringer'],
  [/\b(?:brightness|brighter|dimmer|screen light)\b|ब्राइटनेस|स्क्रीन की रोशनी|ಬ್ರೈಟ್\S*ನೆಸ್|ಪರದೆಯ ಬೆಳಕು/i, 'brightness'],
  [/\b(?:auto[- ]?rotat\w*|screen rotation)\b|ऑटो\s*रोटेट|ಆಟೋ\s*ರೊಟೇಟ್/i, 'auto_rotate'],
  [/\b(?:dark mode|dark theme|night mode)\b|डार्क\s*मोड|ಡಾರ್ಕ್\s*ಮೋಡ್/i, 'dark_mode'],
];
const S_OFF = /\b(?:off|disable|deactivate|disconnect)\b|बंद|ऑफ़|ऑफ|बुझा|ಆಫ್|ಆರಿಸು|ಆರಿಸಿ|ನಿಲ್ಲಿಸು|ನಿಲ್ಲಿಸಿ/i;
const S_ON = /\b(?:on|enable|activate|connect)\b|चालू|ऑन|ಆನ್|ಹಚ್ಚು|ಹಚ್ಚಿ/i;
const S_MAX = /\b(?:max(?:imum)?|full|highest)\b|पूरी|फुल|ಪೂರ್ಣ|ಫುಲ್/i;
const S_MIN = /\b(?:min(?:imum)?|lowest)\b|सबसे कम|ಕನಿಷ್ಠ/i;
const S_AUTO = /\b(?:auto(?:matic)?|adaptive)\b|ऑटो|अपने आप|ಆಟೋ|ಸ್ವಯಂ/i;
const S_UP = /\b(?:up|increase|raise|higher|brighter|more)\b|बढ़ा|ज़्यादा|ज्यादा|तेज़|तेज|ಹೆಚ್ಚಿಸು|ಹೆಚ್ಚಿಸಿ|ಜಾಸ್ತಿ/i;
const S_DOWN = /\b(?:down|decrease|reduce|lower|dimmer|dim|less)\b|कम|घटा|ಕಡಿಮೆ|ಇಳಿಸು|ಇಳಿಸಿ/i;
const OPEN_SETTINGS = /\b(?:open|show|go to)\b.*\bsettings?\b|सेटिंग\S*\s*(?:खोलो|दिखाओ)|ಸೆಟ್ಟಿಂಗ್\S*\s*(?:ತೆರೆ|ತೆರೆಯಿರಿ)/i;
const NOT_A_SETTING = /^(?:please\s+)?(?:search|google|look up|find|play|send|message|call|whatsapp)\b/i;

const QUESTION = /^(?:is|are|am|was|what|what's|whats|how|check|tell me)\b|\?\s*$|क्या|कितन|ಎಷ್ಟ|ಇದೆಯೇ|ಏನು|ಆಗಿದೆಯೇ/i;
const TIME_Q = /^(?:please\s+)?(?:what(?:'s| is)? the time|what time is it|tell me the time|time now|current time)\b|कितने बजे|टाइम क्या|समय क्या|ಎಷ್ಟು ಗಂಟೆ|ಸಮಯ ಎಷ್ಟು/i;
const DATE_Q = /\b(?:what(?:'s| is)? (?:the )?date|today'?s date|what day is (?:it|today)|which day is (?:it|today))\b|आज (?:क्या )?(?:तारीख|दिन)|कौन सा दिन|ಇಂದು (?:ಯಾವ )?(?:ದಿನಾಂಕ|ದಿನ)|ದಿನಾಂಕ ಏನು/i;
const BATTERY_Q = /\b(?:battery|charge|charging)\b|बैटरी|चार्ज|ಬ್ಯಾಟರಿ|ಚಾರ್ಜ್/i;
const CONNECTED_Q = /\b(?:connected|online|network)\b|जुड़ा|नेटवर्क|ಸಂಪರ್ಕ|ನೆಟ್‌ವರ್ಕ್/i;

/** "how much battery", "is wifi on", "what time is it", "बैटरी कितनी है", "ಎಷ್ಟು ಗಂಟೆ". */
function parseDeviceStatus(text: string): IntentResult | null {
  if (TIME_Q.test(text)) return result('device_status', { status_of: 'time' });
  if (DATE_Q.test(text)) return result('device_status', { status_of: 'date' });
  if (!QUESTION.test(text)) return null;
  const setting = SETTING_WORDS.find(([re]) => re.test(text))?.[1];
  if (BATTERY_Q.test(text) && setting !== 'battery_saver') return result('device_status', { status_of: 'battery' });
  const map: Partial<Record<PhoneSetting, NonNullable<IntentParameters['status_of']>>> = {
    wifi: 'wifi', mobile_data: 'network', bluetooth: 'bluetooth', location: 'location',
    airplane_mode: 'airplane_mode', ringer: 'ringer', brightness: 'brightness',
  };
  if (setting && map[setting]) return result('device_status', { status_of: map[setting] });
  if (CONNECTED_Q.test(text)) return result('device_status', { status_of: 'network' });
  return null;
}

/** "turn off wifi", "brightness up", "put the phone on silent", "ब्लूटूथ चालू करो", "ವೈಫೈ ಆಫ್ ಮಾಡು". */
function parseDeviceSetting(text: string): IntentResult | null {
  if (NOT_A_SETTING.test(text)) return null;
  const setting = SETTING_WORDS.find(([re]) => re.test(text))?.[1];
  if (!setting) return null;
  if (OPEN_SETTINGS.test(text)) return result('device_setting', { setting });
  if (setting === 'ringer') {
    const vibrate = /vibrat|वाइब्रेट|ವೈಬ್ರೇಟ್/i.test(text);
    const silent = /\bsilent\b|साइलेंट|ಸೈಲೆಂಟ್/i.test(text);
    const state = S_OFF.test(text) ? 'normal' : vibrate ? 'vibrate' : silent ? 'silent' : 'normal';
    return result('device_setting', { setting, state });
  }
  if (setting === 'brightness') {
    const state = S_MAX.test(text) ? 'max' : S_MIN.test(text) ? 'min' : S_AUTO.test(text) ? 'auto' : S_UP.test(text) ? 'up' : S_DOWN.test(text) ? 'down' : undefined;
    return result('device_setting', state ? { setting, state } : { setting });
  }
  const state = S_OFF.test(text) ? 'off' : S_ON.test(text) ? 'on' : undefined;
  if (!state && setting !== 'settings') return null; // just a word like "wifi": let the AI decide
  return result('device_setting', state ? { setting, state } : { setting });
}

/** "Read this message", "translate this message to Kannada", "यह मैसेज पढ़ो", "ಈ ಸಂದೇಶ ಓದು". */
const READ_SCREEN =
  /\b(?:read|what does)\s+(?:out\s+)?(?:this|the|that|my)?\s*(?:messages?|sms|chat|screen|whatsapp)\b|\btranslate\s+(?:this|the|that|my)?\s*(?:messages?|sms|chat|screen|text)?\b|(?:मैसेज|संदेश|एसएमएस|स्क्रीन)\s*(?:पढ़ो|पढ़कर सुनाओ|पढ़ कर सुनाओ|पढ़ें|सुनाओ)|(?:अनुवाद|ट्रांसलेट)\s*(?:करो|करें|कर दो)|(?:ಸಂದೇಶ|ಮೆಸೇಜ್|ಸ್ಕ್ರೀನ್)\s*(?:ಓದು|ಓದಿ|ಓದಿ ಹೇಳು)|ಅನುವಾದ\s*(?:ಮಾಡು|ಮಾಡಿ)|ಅನುವಾದಿಸು|ಅನುವಾದಿಸಿ/i;
const TARGET_LANGUAGE: Array<[RegExp, 'en' | 'hi' | 'kn']> = [
  [/\b(?:in|into|to)\s+kannada\b|कन्नड़|ಕನ್ನಡ/i, 'kn'],
  [/\b(?:in|into|to)\s+hindi\b|हिंदी|हिन्दी|ಹಿಂದಿ/i, 'hi'],
  [/\b(?:in|into|to)\s+english\b|अंग्रेज़ी|अंग्रेजी|इंग्लिश|ಇಂಗ್ಲಿಷ್/i, 'en'],
];

const NOTE_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:take|make|create|add|write|save)\s+(?:a\s+)?note(?:\s+(?:that|saying|of|about))?[\s:,-]*(.*?)[\s.!]*$/i,
  /^(?:please\s+)?(?:note down|write down|jot down|note)(?:\s+that)?[\s:,-]+(.+?)[\s.!]*$/i,
  /^नोट\s*(?:करो|कर लो|करें|कर लीजिए|लिखो)(?:\s*कि)?\s*(.*?)[\s।]*$/,
  /^(.+?)\s*(?:नोट\s*(?:करो|कर लो|करें|कर लीजिए)|लिख लो|लिख लीजिए)[\s।]*$/,
  /^(.+?)\s*(?:ನೋಟ್|ಟಿಪ್ಪಣಿ)\s*(?:ಮಾಡು|ಮಾಡಿ|ಮಾಡಿಕೊ|ಮಾಡಿಕೊಳ್ಳಿ|ಬರೆ|ಬರೆಯಿರಿ)[\s.!]*$/,
];

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
  // Before REPEAT, so "play again" / "गाना फिर से चालू करो" resume the music instead of repeating ROOSTER.
  for (const [re, control] of MEDIA_CONTROLS) if (re.test(text)) return result('media_control', { control });
  if (REPEAT.test(text)) return result('repeat_last_response');
  if (EMERGENCY.test(text)) return result('emergency_help');

  // "WhatsApp Ravi saying hi", "message Ravi on WhatsApp ...", "रवि को व्हाट्सएप पर मैसेज भेजो".
  const whatsapp = WHATSAPP.test(text);
  const smsText = whatsapp
    ? text.replace(WHATSAPP_VIA, '').replace(WHATSAPP_WORD, 'message').replace(WHATSAPP_WORD_LOCAL, '').replace(/\s+/g, ' ').trim()
    : text;
  for (const re of SMS_PATTERNS) {
    const m = re.exec(smsText);
    if (m) {
      return result('prepare_sms', {
        contact_name: m[1].trim(),
        message: m[2]?.trim(),
        ...(whatsapp ? { channel: 'whatsapp' as const } : {}),
      });
    }
  }
  for (const re of CALL_PATTERNS) {
    const m = re.exec(text);
    if (m) return result('call_contact', { contact_name: m[1].trim() });
  }
  if (FILL_FORM.test(text)) return result('fill_form');
  if (READ_SCREEN.test(text)) {
    const target = TARGET_LANGUAGE.find(([re]) => re.test(text))?.[1];
    return result('read_screen', target ? { target_language: target } : {});
  }
  for (const re of NOTE_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const note = m[1]?.trim() ?? '';
      return note ? result('create_note', { note_text: note }) : result('create_note', {}, ['note_text']);
    }
  }
  if (TIMER.test(text)) {
    const seconds = parseDurationSeconds(text);
    return seconds ? result('set_timer', { duration_seconds: seconds }) : result('set_timer', {}, ['duration']);
  }
  if (REMIND.test(text)) return parseReminder(text, now);
  if (ALARM.test(text)) return parseAlarm(text, now);
  const status = parseDeviceStatus(text);
  if (status) return status;
  const setting = parseDeviceSetting(text);
  if (setting) return setting;
  const openAndDo = parseOpenAndDo(text);
  if (openAndDo) return openAndDo;
  const media = parseMedia(text);
  if (media) return media;
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
