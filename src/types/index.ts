export type Language = 'en' | 'hi' | 'kn';

export const SPEECH_LOCALE: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

export type Intent =
  | 'general_question'
  | 'create_reminder'
  | 'list_reminders'
  | 'update_reminder'
  | 'delete_reminder'
  | 'set_alarm'
  | 'set_timer'
  | 'create_note'
  | 'search_notes'
  | 'read_text'
  | 'call_contact'
  | 'prepare_sms'
  | 'emergency_help'
  | 'open_application'
  | 'play_media'
  | 'search_app'
  | 'media_control'
  | 'get_directions'
  | 'flashlight'
  | 'fill_form'
  | 'read_screen'
  | 'navigate'
  | 'remember_fact'
  | 'daily_summary'
  | 'read_notifications'
  | 'stop_speaking'
  | 'repeat_last_response'
  | 'unknown';

export type ScreenName = 'home' | 'conversation' | 'reminders' | 'reader' | 'emergency' | 'settings' | 'accessibility';

export type IntentParameters = {
  title?: string;
  datetime?: string;
  recurrence?: 'none' | 'daily' | 'weekly';
  reminder_type?: 'medicine' | 'appointment' | 'task';
  reminder_ref?: string;
  note_text?: string;
  query?: string;
  contact_name?: string;
  message?: string;
  channel?: 'sms' | 'whatsapp';
  /** read_screen: the language the user asked to translate into. */
  target_language?: Language;
  /** Timer length. */
  duration_seconds?: number;
  control?: 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'volume_up' | 'volume_down' | 'mute' | 'unmute' | 'volume_max';
  /** Flashlight. */
  state?: 'on' | 'off';
  app_name?: string;
  screen?: ScreenName;
  fact?: string;
};

export type IntentResult = {
  intent: Intent;
  confidence: number;
  parameters: IntentParameters;
  missing_information: string[];
  requires_confirmation: boolean;
  natural_language_response: string;
  /** Where this interpretation came from — shown to the user so offline mode is never hidden. */
  source?: 'ai' | 'offline';
};

export type Reminder = {
  id: string;
  title: string;
  type: 'medicine' | 'appointment' | 'task';
  /** Wall-clock local "YYYY-MM-DDTHH:mm" */
  localDateTime: string;
  recurrence: 'none' | 'daily' | 'weekly';
  completed: boolean;
  createdAt: number;
};

export type Note = { id: string; text: string; createdAt: number };
export type Fact = { id: string; text: string; createdAt: number };

export type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  isEmergency: boolean;
};

export type DeviceContact = { id: string; name: string; phone: string };

export type ChatTurn = { role: 'user' | 'assistant'; text: string; at: number; offline?: boolean };
