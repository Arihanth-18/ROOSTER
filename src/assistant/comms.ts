import type { AskOptions, AskResult } from '../components/DialogProvider';
import type { TFunction } from '../localization/i18n';
import { composeSms, dial, placeCall, sendSmsDirect } from '../services/device';
import { ensurePermission } from './permissions';

type Ask = (o: AskOptions) => Promise<AskResult>;

/**
 * Call someone the user has ALREADY confirmed. Places the call directly; if the call permission
 * is refused or the call can't start, falls back to the dialer and says so honestly.
 */
export async function callConfirmed(name: string, phone: string, t: TFunction, ask: Ask): Promise<string> {
  if (await ensurePermission('call', t, ask)) {
    const r = await placeCall(phone);
    if (r === 'calling') return t('calling', { name });
  }
  return (await dial(phone)) ? t('dialer_opened', { name }) : t('action_failed');
}

/**
 * Send an SMS the user has ALREADY confirmed. Reports "sent" only for recipients Android confirmed;
 * on any failure the SMS app is opened with the message ready, so the message is never lost.
 */
export async function messageConfirmed(
  recipients: Array<{ name: string; phone: string }>,
  body: string,
  t: TFunction,
  ask: Ask,
  kind: 'sms' | 'sos' = 'sms',
): Promise<{ say: string; allSent: boolean }> {
  const names = recipients.map(r => r.name).join(', ');
  if (await ensurePermission('sms', t, ask)) {
    try {
      const res = await sendSmsDirect(recipients.map(r => r.phone), body);
      if (res.sent === res.total) {
        return { say: kind === 'sos' ? t('sos_sent', { names }) : t('sms_sent', { name: names }), allSent: true };
      }
      if (res.sent > 0) {
        return { say: t('sms_partial', { sent: res.sent, total: res.total }), allSent: false };
      }
    } catch {
      // fall through to the SMS app
    }
  }
  const opened = await composeSms(recipients.map(r => r.phone), body);
  return {
    say: opened ? t(kind === 'sos' ? 'sos_send_failed' : 'sms_failed_fallback') : t('action_failed'),
    allSent: false,
  };
}
