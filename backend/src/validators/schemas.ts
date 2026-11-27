import { z } from 'zod';

export const LANGUAGES = ['en', 'hi', 'kn'] as const;
export type Language = (typeof LANGUAGES)[number];

export const INTENTS = [
  'general_question',
  'create_reminder',
  'list_reminders',
  'update_reminder',
  'delete_reminder',
  'set_alarm',
  'set_timer',
  'create_note',
  'search_notes',
  'read_text',
  'call_contact',
  'prepare_sms',
  'emergency_help',
  'open_application',
  'play_media',
  'search_app',
  'media_control',
  'get_directions',
  'flashlight',
  'fill_form',
  'navigate',
  'remember_fact',
  'daily_summary',
  'read_notifications',
  'stop_speaking',
  'repeat_last_response',
  'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];

/** Intents that always require explicit user confirmation, regardless of what the model says. */
export const ALWAYS_CONFIRM: ReadonlySet<Intent> = new Set<Intent>([
  'call_contact',
  'prepare_sms',
  'emergency_help',
  'delete_reminder',
]);

export const SCREENS = [
  'home',
  'conversation',
  'reminders',
  'reader',
  'emergency',
  'settings',
  'accessibility',
] as const;

const historyTurn = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(500),
});

export const InterpretRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: z.enum(LANGUAGES),
  simpleLanguage: z.boolean().default(false),
  /** Device local time, ISO 8601 with offset, so relative dates ("tomorrow at 8") resolve correctly. */
  now: z.string().max(40),
  history: z.array(historyTurn).max(6).default([]),
});
export type InterpretRequest = z.infer<typeof InterpretRequestSchema>;

export const RespondRequestSchema = InterpretRequestSchema;
export type RespondRequest = InterpretRequest;

const shortText = (max: number) => z.string().trim().max(max);

/** Parameters the model may extract. Everything optional; unknown keys are stripped. */
export const ParametersSchema = z
  .object({
    title: shortText(200).optional(),
    datetime: shortText(40).optional(),
    recurrence: z.enum(['none', 'daily', 'weekly']).optional(),
    reminder_type: z.enum(['medicine', 'appointment', 'task']).optional(),
    reminder_ref: shortText(200).optional(),
    note_text: shortText(2000).optional(),
    query: shortText(200).optional(),
    contact_name: shortText(100).optional(),
    message: shortText(500).optional(),
    channel: z.enum(['sms', 'whatsapp']).optional(),
    duration_seconds: z.coerce.number().int().min(1).max(86400).optional(),
    control: z.enum(['play', 'pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute', 'unmute', 'volume_max']).optional(),
    state: z.enum(['on', 'off']).optional(),
    app_name: shortText(100).optional(),
    screen: z.enum(SCREENS).optional(),
    fact: shortText(300).optional(),
  })
  .strip();

export const IntentResultSchema = z.object({
  intent: z.enum(INTENTS).catch('unknown'),
  confidence: z.coerce.number().min(0).max(1).catch(0),
  parameters: ParametersSchema.catch({}),
  missing_information: z.array(shortText(100)).max(5).catch([]),
  requires_confirmation: z.boolean().catch(true),
  natural_language_response: shortText(1000).catch(''),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;
