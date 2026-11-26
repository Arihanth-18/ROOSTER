import { createApp } from './app.js';
import { env, aiConfigured } from './config/env.js';

createApp().listen(env.PORT, () => {
  console.log(`ROOSTER backend listening on http://localhost:${env.PORT}`);
  if (!aiConfigured) {
    console.warn('GROQ_API_KEY is not set — /api/assistant/* will return 503 ai_unavailable.');
  }
});
