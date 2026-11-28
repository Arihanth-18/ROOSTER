import { Router } from 'express';
import { postInterpret, postReadMessages, postRespond } from '../controllers/assistantController.js';
import { aiConfigured, env } from '../config/env.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ai: aiConfigured ? 'configured' : 'not_configured', model: env.GROQ_MODEL });
});

router.post('/api/assistant/interpret', postInterpret);
router.post('/api/assistant/respond', postRespond);
router.post('/api/assistant/read-messages', postReadMessages);
