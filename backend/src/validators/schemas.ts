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
  'open_chat',
  'emergency_help',
  'open_application',
  'play_media',
  'search_app',
  'media_control',
  'get_directions',
  'flashlight',
  'fill_form',
  'read_screen',
  'device_setting',
  'device_status',
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
    /** Language to read/translate a message into, when the user names one ("translate to Kannada"). */
    target_language: z.enum(LANGUAGES).optional(),
    duration_seconds: z.coerce.number().int().min(1).max(86400).optional(),
    control: z.enum(['play', 'pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute', 'unmute', 'volume_max']).optional(),
    /** on/off for switches and the torch; up/down/max/min/auto for brightness; silent/vibrate/normal for the ringer. */
    state: z.enum(['on', 'off', 'up', 'down', 'max', 'min', 'auto', 'silent', 'vibrate', 'normal']).optional(),
    /** device_setting: which phone setting to change or open. */
    setting: z
      .enum([
        'wifi', 'mobile_data', 'bluetooth', 'airplane_mode', 'location', 'hotspot', 'nfc', 'do_not_disturb', 'ringer',
        'brightness', 'auto_rotate', 'battery_saver', 'dark_mode', 'display', 'sound', 'date', 'language', 'storage',
        'apps', 'accessibility', 'settings',
      ])
      .optional(),
    /** device_status: what the user asks about. */
    status_of: z
      .enum(['battery', 'network', 'wifi', 'bluetooth', 'location', 'airplane_mode', 'ringer', 'brightness', 'time', 'date', 'all'])
      .optional(),
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

/** Text copied from the phone screen or notifications, to be read aloud (translated if needed). */
export const ReadMessagesRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  target: z.enum(LANGUAGES),
  source: z.enum(['screen', 'notifications']).default('screen'),
});
export type ReadMessagesRequest = z.infer<typeof ReadMessagesRequestSchema>;

/** What the model returns for read-messages (validated; anything malformed degrades to empty). */
export const ReadMessagesResultSchema = z.object({
  messages: z
    .array(
      z.object({
        from: z.string().trim().max(60).nullable().catch(null),
        time: z.string().trim().max(20).nullable().catch(null),
        text: z.string().trim().max(800),
      }),
    )
    .max(12)
    .catch([]),
  scam: z.boolean().catch(false),
});
