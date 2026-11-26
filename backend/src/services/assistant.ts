import {
  ALWAYS_CONFIRM,
  IntentResultSchema,
  type IntentResult,
  type InterpretRequest,
} from '../validators/schemas.js';
import { groqChat, type ChatMessage } from './groq.js';
import { interpretSystemPrompt, respondSystemPrompt } from './prompts.js';
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
