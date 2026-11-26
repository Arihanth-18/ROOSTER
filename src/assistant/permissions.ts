import type { AskOptions, AskResult } from '../components/DialogProvider';
import type { TFunction } from '../localization/i18n';
import { hasPermission, openAppSettings, requestPermission, type PermissionKind } from '../services/device';

const MESSAGE = {
  mic: 'perm_mic',
  contacts: 'perm_contacts',
  notifications: 'perm_notifications',
  location: 'perm_location',
  call: 'perm_call',
  sms: 'perm_sms',
} as const;

/**
 * Explain in plain language first, then show Android's dialog. If the user previously chose
 * "don't ask again", offer to open Settings instead of failing silently.
 */
export async function ensurePermission(
  kind: PermissionKind,
  t: TFunction,
  ask: (o: AskOptions) => Promise<AskResult>,
): Promise<boolean> {
  if (await hasPermission(kind)) return true;
  const ok = await ask({ message: t(MESSAGE[kind]), yesLabel: t('continue'), noLabel: t('cancel') });
  if (!ok.confirmed) return false;
  const outcome = await requestPermission(kind);
  if (outcome === 'granted') return true;
  if (outcome === 'blocked') {
    const go = await ask({ message: t('perm_denied'), yesLabel: t('open_settings'), noLabel: t('close') });
    if (go.confirmed) openAppSettings();
  }
  return false;
}
