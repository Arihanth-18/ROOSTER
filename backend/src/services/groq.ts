import { env, aiConfigured } from '../config/env.js';

export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AiUnavailableError';
  }
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type GroqOptions = { json: boolean; temperature: number; maxTokens: number };

const isReasoningModel = (model: string) => /gpt-oss|qwen3/i.test(model);

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Calls Groq's OpenAI-compatible chat endpoint. Throws AiUnavailableError on any
 * network, timeout, auth or upstream failure so callers can fall back honestly.
 */
export async function groqChat(messages: ChatMessage[], opts: GroqOptions): Promise<string> {
  if (!aiConfigured) {
    throw new AiUnavailableError('AI key not configured on server');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.GROQ_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        // Reasoning models: keep thinking short and out of the returned content.
        ...(isReasoningModel(env.GROQ_MODEL)
          ? { reasoning_effort: env.GROQ_REASONING_EFFORT, include_reasoning: false }
          : {}),
      }),
    });
    if (!res.ok) {
      // Status only — never log the body, it can echo user content.
      throw new AiUnavailableError(`AI service returned ${res.status}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiUnavailableError('AI service returned an empty response');
    }
    return content;
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new AiUnavailableError(aborted ? 'AI service timed out' : 'AI service unreachable');
  } finally {
    clearTimeout(timer);
  }
}
