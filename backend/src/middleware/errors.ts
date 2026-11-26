import type { Request, Response, NextFunction } from 'express';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found' });
}

/** Logs only the error name and route — never request bodies, which contain personal speech. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err as { type?: string; status?: number; name?: string };
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  console.error(`[error] ${req.method} ${req.path}: ${e?.name ?? 'Error'}`);
  res.status(500).json({ error: 'internal_error' });
}
