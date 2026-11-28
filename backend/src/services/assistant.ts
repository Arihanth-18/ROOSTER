import {
  ALWAYS_CONFIRM,
  IntentResultSchema,
  type IntentResult,
  type InterpretRequest,
  ReadMessagesResultSchema,
  type Language,
  type ReadMessagesRequest,
} from '../validators/schemas.js';
import { groqChat, type ChatMessage } from './groq.js';
import { interpretSystemPrompt, readMessagesSystemPrompt, respondSystemPrompt } from './prompts.js';
import { sanitizeSpokenText } from '../utils/sanitize.js';

function buildMessages(system: string, req: InterpretRequest): ChatMessage[] {
  return [
    { role: 'system', content: system },
    ...req.history.map(h => ({ role: h.role, content: h.text }) as ChatMessage),
    { role: 'user', content: req.text },
  ];
}

const UNKNOWN: IntentResult = {
  intent: 'unknown',
  confidence: 0,
  parameters: {},
  missing_information: [],
  requires_confirmation: true,
  natural_language_response: '',
};

/** Parse and harden raw model output. Anything malformed degrades to "unknown"; never throws. */
export function normalizeIntent(raw: string): IntentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return UNKNOWN;
  }
  const result = IntentResultSchema.safeParse(parsed);
  if (!result.success) return UNKNOWN;
  const out = result.data;
  out.natural_language_response = sanitizeSpokenText(out.natural_language_response);
  if (ALWAYS_CONFIRM.has(out.intent)) out.requires_confirmation = true;
  return out;
}

export async function interpret(req: InterpretRequest): Promise<IntentResult> {
  const raw = await groqChat(buildMessages(interpretSystemPrompt(req), req), {
    json: true,
    temperature: 0.1,
    maxTokens: 1200,
  });
  return normalizeIntent(raw);
}

export async function respond(req: InterpretRequest): Promise<string> {
  const raw = await groqChat(buildMessages(respondSystemPrompt(req), req), {
    json: false,
    temperature: 0.5,
    maxTokens: 900,
  });
  return sanitizeSpokenText(raw);
}

/** Fixed phrases in each language, so the framing is never left untranslated. */
const SPOKEN: Record<Language, { said: (who: string) => string; you: string; at: (time: string) => string; scam: string }> = {
  en: {
    said: who => `${who} said`,
    you: 'You said',
    at: time => `at ${time}`,
    scam: 'Be careful: this may be a scam. Never share an OTP, PIN or bank details, and do not send money without calling the person first.',
  },
  hi: {
    said: who => `${who} ने कहा`,
    you: 'आपने कहा',
    at: time => `${time} पर`,
    scam: 'सावधान रहें: यह धोखा हो सकता है। ओटीपी, पिन या बैंक की जानकारी कभी न बताएँ, और पहले फ़ोन करके पूछे बिना पैसे न भेजें।',
  },
  kn: {
    said: who => `${who} ಹೇಳಿದ್ದು`,
    you: 'ನೀವು ಹೇಳಿದ್ದು',
    at: time => `${time} ಕ್ಕೆ`,
    scam: 'ಎಚ್ಚರಿಕೆ: ಇದು ಮೋಸ ಇರಬಹುದು. ಒಟಿಪಿ, ಪಿನ್ ಅಥವಾ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಎಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ, ಮೊದಲು ಕರೆ ಮಾಡಿ ಕೇಳದೆ ಹಣ ಕಳುಹಿಸಬೇಡಿ.',
  },
};

/** Builds the sentence ROOSTER speaks. Exported for tests. Null when there are no messages. */
export function composeSpokenMessages(raw: string, target: Language): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ReadMessagesResultSchema.safeParse(parsed);
  if (!result.success || !result.data.messages.length) return null;
  const words = SPOKEN[target];
  const list = result.data.messages.slice(-8).filter(m => m.text);
  if (!list.length) return null;
  const sentences = list.map((m, i) => {
    const who = m.from === 'me' ? words.you : m.from ? words.said(m.from) : '';
    // Only the newest message's time is read out; more would be clutter.
    const when = i === list.length - 1 && m.time ? ` (${words.at(m.time)})` : '';
    const body = m.text.replace(/[.!?।]*$/, '');
    return who ? `${who}${when}: ${body}.` : `${body}${when}.`;
  });
  if (result.data.scam) sentences.push(words.scam);
  return sanitizeSpokenText(sentences.join(' '), 1500);
}

/** Messages from screen/notification text, ready to be read aloud in the target language. Null if none were found. */
export async function readMessages(req: ReadMessagesRequest): Promise<string | null> {
  const raw = await groqChat(
    [
      { role: 'system', content: readMessagesSystemPrompt(req.target, req.source) },
      { role: 'user', content: req.text },
    ],
    { json: true, temperature: 0.1, maxTokens: 2000 },
  );
  return composeSpokenMessages(raw, req.target);
}
