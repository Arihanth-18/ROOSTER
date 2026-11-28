import type { Request, Response, NextFunction } from 'express';
import { InterpretRequestSchema, ReadMessagesRequestSchema, RespondRequestSchema } from '../validators/schemas.js';
import { interpret, readMessages, respond } from '../services/assistant.js';
import { AiUnavailableError } from '../services/groq.js';

/** 503 + machine-readable code lets the app announce "AI is offline" instead of inventing an answer. */
function aiUnavailable(res: Response, err: AiUnavailableError) {
  res.status(503).json({ error: 'ai_unavailable', reason: err.message });
}

export async function postInterpret(req: Request, res: Response, next: NextFunction) {
  const parsed = InterpretRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues.map(i => i.path.join('.')) });
    return;
  }
  try {
    res.json(await interpret(parsed.data));
  } catch (err) {
    if (err instanceof AiUnavailableError) return aiUnavailable(res, err);
    next(err);
  }
}

export async function postRespond(req: Request, res: Response, next: NextFunction) {
  const parsed = RespondRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues.map(i => i.path.join('.')) });
    return;
  }
  try {
    res.json({ response: await respond(parsed.data) });
  } catch (err) {
    if (err instanceof AiUnavailableError) return aiUnavailable(res, err);
    next(err);
  }
}

export async function postReadMessages(req: Request, res: Response, next: NextFunction) {
  const parsed = ReadMessagesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues.map(i => i.path.join('.')) });
    return;
  }
  try {
    res.json({ spoken: await readMessages(parsed.data) });
  } catch (err) {
    if (err instanceof AiUnavailableError) return aiUnavailable(res, err);
    next(err);
  }
}
