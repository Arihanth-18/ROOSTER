import type { AccessibilityPrefs } from '../accessibility/types';
import type { Intent } from '../types';

/** Always confirmed, at every confirmation level. */
const ALWAYS: Intent[] = ['call_contact', 'prepare_sms', 'emergency_help', 'delete_reminder'];
/** Confirmed at "standard" and "high". */
const STANDARD: Intent[] = ['create_reminder', 'update_reminder', 'open_application', 'remember_fact'];
/** Confirmed only at "high". */
const HIGH: Intent[] = ['create_note', 'navigate', 'read_notifications', 'read_text'];

/**
 * Whether an action needs an explicit yes. Low-confidence interpretations of any action
 * are also confirmed so a misheard command never runs silently.
 */
export function needsConfirmation(intent: Intent, level: AccessibilityPrefs['confirmationLevel'], confidence: number): boolean {
  if (ALWAYS.includes(intent)) return true;
  const isAction = STANDARD.includes(intent) || HIGH.includes(intent);
  if (isAction && confidence < 0.6) return true;
  if (level === 'low') return false;
  if (STANDARD.includes(intent)) return true;
  return level === 'high' && HIGH.includes(intent);
}
