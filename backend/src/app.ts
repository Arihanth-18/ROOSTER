import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middleware/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's proxy: rate-limit by the real client address, not the proxy's.
  app.set('trust proxy', 1);
  // The mobile app is not a browser, so no origins need CORS access.
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '32kb' }));
  app.use(
    '/api/',
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
