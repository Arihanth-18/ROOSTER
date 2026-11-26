import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { normalizeIntent } from '../src/services/assistant.js';
import { sanitizeSpokenText } from '../src/utils/sanitize.js';

const app = createApp();

describe('normalizeIntent', () => {
  it('parses a valid reminder intent', () => {
    const r = normalizeIntent(
      JSON.stringify({
        intent: 'create_reminder',
        confidence: 0.9,
        parameters: { title: 'BP tablet', datetime: '2026-11-27T08:00:00', recurrence: 'daily' },
        missing_information: [],
        requires_confirmation: false,
        natural_language_response: 'I will remind you at 8.',
      }),
    );
    expect(r.intent).toBe('create_reminder');
    expect(r.parameters.recurrence).toBe('daily');
  });

  it('forces confirmation for calls even if the model says no', () => {
    const r = normalizeIntent(
      JSON.stringify({ intent: 'call_contact', confidence: 1, parameters: { contact_name: 'Ravi' }, requires_confirmation: false }),
    );
    expect(r.requires_confirmation).toBe(true);
  });

  it('degrades invalid JSON and unknown intents to unknown', () => {
    expect(normalizeIntent('not json').intent).toBe('unknown');
    expect(normalizeIntent(JSON.stringify({ intent: 'format_disk' })).intent).toBe('unknown');
  });

  it('strips unexpected parameters', () => {
    const r = normalizeIntent(JSON.stringify({ intent: 'open_application', parameters: { app_name: 'YouTube', shell: 'rm -rf /' } }));
    expect(r.parameters).toEqual({ app_name: 'YouTube' });
  });
});

describe('sanitizeSpokenText', () => {
  it('removes markdown and tags', () => {
    expect(sanitizeSpokenText('**Hello** <b>there</b> [link](http://x)')).toBe('Hello there link');
  });
});

describe('HTTP API', () => {
  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects invalid interpret requests', async () => {
    const res = await request(app).post('/api/assistant/interpret').send({ text: '', language: 'fr' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('rejects oversized bodies', async () => {
    const res = await request(app)
      .post('/api/assistant/interpret')
      .send({ text: 'x'.repeat(40_000), language: 'en', now: '2026-11-26T10:00:00+05:30' });
    expect(res.status).toBe(413);
  });
});
