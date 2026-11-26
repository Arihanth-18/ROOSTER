import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
  /** Only sent to reasoning models (gpt-oss, qwen3). 'low' keeps voice replies fast. */
  GROQ_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  PORT: z.coerce.number().int().positive().default(3000),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
});

export const env = EnvSchema.parse(process.env);

/** True only when a key is configured. The server still starts without one so /health can report it. */
export const aiConfigured = env.GROQ_API_KEY.trim().length > 0;
