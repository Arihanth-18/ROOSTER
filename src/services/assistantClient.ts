import type { ChatTurn, IntentResult, Language } from '../types';
import { toLocalIsoWithOffset } from '../utils/dates';

export class AiOfflineError extends Error {
  constructor(public reason: 'network' | 'timeout' | 'ai_unavailable' | 'bad_response') {
    super(reason);
  }
}

type RequestBody = {
  text: string;
  language: Language;
  simpleLanguage: boolean;
  now: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
};

async function post<T>(serverUrl: string, path: string, body: RequestBody, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(serverUrl.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // RN and DOM lib typings disagree on AbortSignal; the runtime object is correct.
      signal: controller.signal as unknown as RequestInit['signal'],
    });
    if (res.status === 503) throw new AiOfflineError('ai_unavailable');
    if (!res.ok) throw new AiOfflineError('bad_response');
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof AiOfflineError) throw e;
    throw new AiOfflineError(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

function buildBody(text: string, language: Language, simpleLanguage: boolean, history: ChatTurn[]): RequestBody {
  return {
    text,
    language,
    simpleLanguage,
    now: toLocalIsoWithOffset(new Date()),
    // Only the last few turns, trimmed — enough for "call him" style follow-ups.
    history: history.slice(-6).map(h => ({ role: h.role, text: h.text.slice(0, 500) })),
  };
}

export async function interpret(
  serverUrl: string,
  text: string,
  language: Language,
  simpleLanguage: boolean,
  history: ChatTurn[],
): Promise<IntentResult> {
  const r = await post<IntentResult>(serverUrl, '/api/assistant/interpret', buildBody(text, language, simpleLanguage, history), 15000);
  if (!r || typeof r.intent !== 'string') throw new AiOfflineError('bad_response');
  return { ...r, parameters: r.parameters ?? {}, missing_information: r.missing_information ?? [], source: 'ai' };
}

export async function respond(
  serverUrl: string,
  text: string,
  language: Language,
  simpleLanguage: boolean,
  history: ChatTurn[],
): Promise<string> {
  const r = await post<{ response: string }>(serverUrl, '/api/assistant/respond', buildBody(text, language, simpleLanguage, history), 15000);
  return r.response ?? '';
}

export type ServerHealth = 'ok' | 'no_key' | 'down';

export async function checkHealth(serverUrl: string): Promise<ServerHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(serverUrl.replace(/\/+$/, '') + '/health', { signal: controller.signal as unknown as RequestInit['signal'] });
    if (!res.ok) return 'down';
    const body = (await res.json()) as { ai?: string };
    return body.ai === 'configured' ? 'ok' : 'no_key';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
