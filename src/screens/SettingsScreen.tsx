import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../app/AppContext';
import { useDialog } from '../components/DialogProvider';
import { Screen } from '../components/Screen';
import { BigButton } from '../components/BigButton';
import { Banner, Body, Card, Field, Heading, OptionGroup, ToggleRow } from '../components/Controls';
import { ensurePermission } from '../assistant/permissions';
import { applyWakeMode, canDrawOverlays, getWakeStatus, openOverlaySettings, type WakeMode, type WakeStatus } from '../services/wake';
import { LANGUAGE_OPTIONS } from '../localization/i18n';
import { checkHealth, type ServerHealth } from '../services/assistantClient';
import {
  FORM_KEYS,
  getActiveNotifications,
  getFormProfile,
  getWisprFlow,
  getWisprStatus,
  openKeyboardSettings,
  showKeyboardPicker,
  type KeyboardStatus,
  getLaunchableApps,
  isAccessibilityServiceEnabled,
  isAutofillServiceEnabled,
  openAccessibilitySettings,
  openAutofillSettings,
  saveFormProfile,
  type FormKey,
  type FormProfile,
  hasPermission,
  isNotificationAccessEnabled,
  openAppSettings,
  openNotificationAccessSettings,
  type LaunchableApp,
  type PermissionKind,
} from '../services/device';
import { deleteAllReminders } from '../services/reminders';
import { wipeAllData } from '../storage/db';
import { speak } from '../services/speech';
import type { RootStackParamList } from '../navigation/navigationRef';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const { t, theme, settings, updateSettings } = useApp();
  const dialog = useDialog();
  const nav = useNavigation<Nav>();
  const [health, setHealth] = useState<ServerHealth | 'checking' | null>(null);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [notifAccess, setNotifAccess] = useState(false);
  const [apps, setApps] = useState<LaunchableApp[]>([]);
  const [perms, setPerms] = useState<Record<PermissionKind, boolean> | null>(null);
  const [wakeStatus, setWakeStatus] = useState<WakeStatus>('off');
  const [overlayOk, setOverlayOk] = useState(true);
  const [profile, setProfile] = useState<FormProfile>({});
  const [autofillOn, setAutofillOn] = useState(false);
  const [voiceFillOn, setVoiceFillOn] = useState(false);
  const [wispr, setWispr] = useState<KeyboardStatus | null>(null);
  const c = theme.colors;

  const refreshWake = useCallback(() => {
    getWakeStatus().then(setWakeStatus).catch(() => {});
    canDrawOverlays().then(setOverlayOk).catch(() => {});
  }, []);

  const changeWakeMode = async (mode: WakeMode) => {
    if (mode !== 'off') {
      if (!(await ensurePermission('mic', t, dialog.ask))) return;
      // Needed for the "ROOSTER is listening" notification on Android 13+.
      await ensurePermission('notifications', t, dialog.ask);
    }
    const ok = await applyWakeMode(mode);
    if (!ok) {
      void speak(t('wake_start_failed'));
      return;
    }
    updateSettings({ wakeMode: mode });
    setTimeout(refreshWake, 1500);
    setTimeout(refreshWake, 6000);
  };

  const refresh = useCallback(() => {
    isNotificationAccessEnabled().then(setNotifAccess).catch(() => {});
    Promise.all((['mic', 'contacts', 'notifications', 'location', 'call', 'sms'] as PermissionKind[]).map(k => hasPermission(k).then(v => [k, v] as const)))
      .then(entries => setPerms(Object.fromEntries(entries) as Record<PermissionKind, boolean>))
      .catch(() => {});
    setHealth('checking');
    checkHealth(settings.serverUrl).then(setHealth);
    refreshWake();
    isAutofillServiceEnabled().then(setAutofillOn).catch(() => {});
    isAccessibilityServiceEnabled().then(setVoiceFillOn).catch(() => {});
    getWisprStatus().then(setWispr).catch(() => {});
  }, [settings.serverUrl, refreshWake]);

  useFocusEffect(refresh);

  useEffect(() => {
    getFormProfile().then(setProfile).catch(() => {});
  }, []);

  const saveProfile = async () => {
    await saveFormProfile(profile);
    void speak(t('form_saved'));
  };

  // Offer apps that currently have notifications first, then the rest.
  const loadApps = async () => {
    const [all, active] = await Promise.all([getLaunchableApps(), getActiveNotifications().catch(() => [])]);
    const activePkgs = new Set(active.map(n => n.packageName));
    setApps(all.sort((a, b) => Number(activePkgs.has(b.packageName)) - Number(activePkgs.has(a.packageName)) || a.label.localeCompare(b.label)));
  };

  const toggleApp = (pkg: string, on: boolean) => {
    const set = new Set(settings.allowedNotificationApps);
    if (on) set.add(pkg);
    else set.delete(pkg);
    updateSettings({ allowedNotificationApps: [...set] });
  };

  const deleteAll = async () => {
    const ok = await dialog.ask({ message: t('delete_all_confirm'), yesLabel: t('delete'), danger: true });
    if (!ok.confirmed) return;
    await deleteAllReminders();
    await wipeAllData();
    await saveFormProfile({}).catch(() => {});
    setProfile({});
    updateSettings({ allowedNotificationApps: [] });
    void speak(t('data_deleted'));
  };

  const healthText =
    health === 'checking' ? '…' : health === 'ok' ? `✓ ${t('server_ok')}` : health === 'no_key' ? `⚠ ${t('server_no_key')}` : `✕ ${t('server_down')}`;

  const permLabel: Record<PermissionKind, string> = {
    mic: '🎤 Microphone',
    contacts: '👤 Contacts',
    notifications: '🔔 Notifications',
    location: '📍 Location',
    call: '📞 Phone calls',
    sms: '✉ SMS',
  };

  return (
    <Screen title={t('settings_title')} tab="settings">
      <Card>
        <Heading>{t('language')}</Heading>
        <Body>{LANGUAGE_OPTIONS.find(o => o.code === settings.language)?.native}</Body>
        <BigButton variant="secondary" label={t('choose_language')} onPress={() => nav.navigate('Language', { fromSettings: true })} />
      </Card>

      <Card>
        <Heading>🐓 {t('wake_title')}</Heading>
        <Body muted>{t('wake_hint')}</Body>
        <OptionGroup
          label=""
          value={settings.wakeMode}
          onChange={changeWakeMode}
          options={[
            { value: 'off', label: t('wake_off') },
            { value: 'screen_on', label: t('wake_screen_on') },
            { value: 'always', label: t('wake_always') },
          ]}
        />
        <Body bold>{t(`wake_status_${wakeStatus}` as 'wake_status_off')}</Body>
        {settings.wakeMode !== 'off' && !overlayOk ? (
          <Banner text={t('wake_overlay_needed')} actionLabel={t('wake_overlay_allow')} onAction={openOverlaySettings} />
        ) : null}
        {settings.wakeMode !== 'off' && overlayOk ? <Body muted>✓ {t('wake_overlay_ok')}</Body> : null}
        {settings.wakeMode !== 'off' ? <Body muted>ⓘ {t('wake_reboot_note')}</Body> : null}
        <ToggleRow
          label={t('speak_reminders')}
          hint={t('speak_reminders_hint')}
          value={settings.speakReminders}
          onChange={v => updateSettings({ speakReminders: v })}
        />
      </Card>

      <Card>
        <Heading>{t('accessibility')}</Heading>
        <BigButton variant="secondary" label={t('a11y_title')} onPress={() => nav.navigate('AccessibilitySetup', { fromSettings: true })} />
      </Card>

      <Card>
        <Heading>{t('notif_access')}</Heading>
        <Body muted>{t('notif_access_hint')}</Body>
        <Body bold>{notifAccess ? '✓ ON' : '✕ OFF'}</Body>
        <BigButton variant="secondary" label={t('open_settings')} onPress={openNotificationAccessSettings} />
        {notifAccess ? (
          <>
            <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text }}>{t('notif_allowed_apps')}</Text>
            {apps.length === 0 ? <BigButton compact variant="secondary" label={t('notif_allowed_apps')} onPress={loadApps} /> : null}
            {apps.slice(0, 25).map(a => (
              <ToggleRow
                key={a.packageName}
                label={a.label}
                value={settings.allowedNotificationApps.includes(a.packageName)}
                onChange={v => toggleApp(a.packageName, v)}
              />
            ))}
          </>
        ) : null}
      </Card>

      <Card>
        <Heading>🎙️ {t('wispr_title')}</Heading>
        <Body muted>{t('wispr_hint')}</Body>
        <Body bold>{`${wispr?.installed ? '✓' : '✕'} ${t('wispr_installed')}`}</Body>
        <Body bold>{`${wispr?.enabled ? '✓' : '✕'} ${t('wispr_enabled')}`}</Body>
        <Body bold>{`${wispr?.current ? '✓' : '✕'} ${t('wispr_current')}`}</Body>
        {!wispr?.installed ? <BigButton label={t('wispr_get')} onPress={() => { getWisprFlow().catch(() => {}); }} /> : null}
        {wispr?.installed && !wispr.enabled ? (
          <BigButton label={t('wispr_turn_on')} onPress={openKeyboardSettings} />
        ) : null}
        {wispr?.enabled && !wispr.current ? (
          <BigButton variant="secondary" label={t('wispr_switch')} onPress={showKeyboardPicker} />
        ) : null}
        <ToggleRow
          label={t('wispr_use_for_talk')}
          hint={t('wispr_use_for_talk_hint')}
          value={settings.dictation === 'wispr'}
          onChange={v => updateSettings({ dictation: v ? 'wispr' : 'rooster' })}
        />
      </Card>

      <Card>
        <Heading>📝 {t('form_title')}</Heading>
        <Body muted>{t('form_hint')}</Body>
        {FORM_KEYS.map((k: FormKey) => (
          <Field
            key={k}
            label={t(`form_${k}` as 'form_name')}
            value={profile[k] ?? ''}
            onChangeText={v => setProfile(prev => ({ ...prev, [k]: v }))}
            keyboardType={k === 'phone' || k === 'pincode' ? 'phone-pad' : k === 'email' ? 'email-address' : 'default'}
            autoCapitalize={k === 'email' ? 'none' : 'words'}
            autoCorrect={false}
            placeholder={k === 'dob' ? '15/08/1955' : undefined}
          />
        ))}
        <Body muted>{t('form_dob_hint')}</Body>
        <BigButton label={t('form_save')} onPress={saveProfile} />

        <Heading>{t('form_autofill')}</Heading>
        <Body muted>{t('form_autofill_hint')}</Body>
        <Body bold>{autofillOn ? '✓ ON' : '✕ OFF'}</Body>
        <BigButton variant="secondary" label={t('open_settings')} onPress={openAutofillSettings} />

        <Heading>{t('form_voice')}</Heading>
        <Body muted>{t('form_voice_hint')}</Body>
        <Body bold>{voiceFillOn ? '✓ ON' : '✕ OFF'}</Body>
        <BigButton variant="secondary" label={t('open_settings')} onPress={openAccessibilitySettings} />
      </Card>

      <Card>
        <Heading>{t('permissions')}</Heading>
        {perms
          ? (Object.keys(permLabel) as PermissionKind[]).map(k => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body>{permLabel[k]}</Body>
                <Body bold>{perms[k] ? '✓' : '✕'}</Body>
              </View>
            ))
          : null}
        <BigButton variant="secondary" label={t('open_settings')} onPress={openAppSettings} />
      </Card>

      <Card>
        <Heading>{t('server')}</Heading>
        <Body bold>{healthText}</Body>
        <Field label="URL" value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <BigButton
          variant="secondary"
          label={t('server_check')}
          onPress={() => {
            const url = serverUrl.trim() || settings.serverUrl;
            updateSettings({ serverUrl: url });
            setHealth('checking');
            checkHealth(url).then(setHealth);
          }}
        />
        {health === 'down' ? <Banner text={t('ai_offline_hint')} /> : null}
      </Card>

      <Card>
        <Heading>{t('privacy')}</Heading>
        <Body>{t('privacy_body')}</Body>
        <BigButton variant="danger" label={t('delete_all')} onPress={deleteAll} />
      </Card>

      <Body muted>{t('version_note')}</Body>
    </Screen>
  );
}
