import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useApp } from '../app/AppContext';
import { useDialog } from '../components/DialogProvider';
import { Screen } from '../components/Screen';
import { BigButton } from '../components/BigButton';
import { Banner, Body, Card, Field, Heading, ToggleRow } from '../components/Controls';
import { trustedRepo } from '../storage/repositories';
import { getCurrentLocation, getDeviceContacts } from '../services/device';
import { callConfirmed, messageConfirmed } from '../assistant/comms';
import { speak, stopSpeaking } from '../services/speech';
import { ensurePermission } from '../assistant/permissions';
import { normalizeName, relationshipFrom } from '../utils/contactMatch';
import type { RootStackParamList } from '../navigation/navigationRef';
import type { DeviceContact, TrustedContact } from '../types';

const COUNTDOWN_SECONDS = 5;

type SosPhase = { kind: 'idle' } | { kind: 'countdown'; left: number } | { kind: 'preparing' } | { kind: 'opened' };

export function EmergencyScreen() {
  const { t, theme, settings, updateSettings, haptic } = useApp();
  const dialog = useDialog();
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Emergency'>>();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [sos, setSos] = useState<SosPhase>({ kind: 'idle' });
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledParam = useRef(false);
  const c = theme.colors;

  const load = useCallback(() => {
    trustedRepo.all().then(setContacts).catch(() => {});
  }, []);
  useFocusEffect(load);

  const emergencyContacts = contacts.filter(x => x.isEmergency);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const cancelSos = () => {
    clearTimer();
    stopSpeaking();
    setSos({ kind: 'idle' });
    haptic('strong');
    void speak(t('sos_cancelled'));
  };

  const prepare = async (list: TrustedContact[]) => {
    clearTimer();
    setSos({ kind: 'preparing' });
    setNote(null);
    let message = t('sos_message');
    if (settings.sosShareLocation && (await ensurePermission('location', t, dialog.ask))) {
      try {
        const loc = await getCurrentLocation();
        const link = `https://maps.google.com/?q=${loc.latitude.toFixed(5)},${loc.longitude.toFixed(5)}`;
        message += `\n${t('sos_location_line', { link })}`;
      } catch {
        setNote(t('location_failed'));
      }
    }
    // The countdown with its Cancel button is the confirmation; after it ends the SMS is sent directly.
    // If direct sending fails, the SMS app opens with the message ready.
    const out = await messageConfirmed(list, message, t, dialog.ask, 'sos');
    setResult(out.say);
    setSos({ kind: 'opened' });
    void speak(out.say);
  };

  const startSos = useCallback(async () => {
    const list = (await trustedRepo.all()).filter(x => x.isEmergency);
    if (!list.length) {
      setAdding(true);
      void speak(t('no_trusted'));
      return;
    }
    haptic('strong');
    stopSpeaking();
    setSos({ kind: 'countdown', left: COUNTDOWN_SECONDS });
    void speak(`${t('confirm_sos')} ${t('sos_countdown', { seconds: COUNTDOWN_SECONDS })} ${t('sos_cancel')}?`, { force: true });
    let left = COUNTDOWN_SECONDS;
    clearTimer();
    timer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        void prepare(list);
      } else {
        setSos({ kind: 'countdown', left });
      }
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, haptic]);

  // Voice-triggered SOS arrives here with startSos=true.
  useEffect(() => {
    if (route.params?.startSos && !handledParam.current) {
      handledParam.current = true;
      void startSos();
      (nav as { setParams?: (p: object) => void }).setParams?.({ startSos: undefined });
    }
  }, [route.params?.startSos, startSos, nav]);

  const remove = async (ct: TrustedContact) => {
    const ok = await dialog.ask({ message: t('confirm_delete', { title: ct.name }), yesLabel: t('delete'), danger: true });
    if (!ok.confirmed) return;
    await trustedRepo.remove(ct.id);
    load();
  };

  const callContact = async (ct: TrustedContact) => {
    const ok = await dialog.ask({ message: t('confirm_call', { name: ct.name }) });
    if (!ok.confirmed) return;
    void speak(await callConfirmed(ct.name, ct.phone, t, dialog.ask));
  };

  if (sos.kind === 'countdown' || sos.kind === 'preparing') {
    return (
      <Screen title={t('sos_confirm_title')} showBack={false}>
        <View accessibilityLiveRegion="assertive" style={{ alignItems: 'center', gap: theme.space(2), paddingVertical: theme.space(2) }}>
          <Text style={{ fontSize: 120, fontWeight: '800', color: c.danger }}>{sos.kind === 'countdown' ? sos.left : '…'}</Text>
          <Body center bold>
            {sos.kind === 'countdown' ? t('sos_countdown', { seconds: sos.left }) : t('state_thinking')}
          </Body>
          <Body center muted>{emergencyContacts.map(x => x.name).join(', ')}</Body>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sos_cancel')}
          onPress={cancelSos}
          style={{ minHeight: 120, borderRadius: theme.radius, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: c.background, fontSize: theme.font.title, fontWeight: '800' }}>✕ {t('sos_cancel')}</Text>
        </Pressable>
        {sos.kind === 'countdown' ? <BigButton variant="danger" label={t('sos_send_now')} onPress={() => void prepare(emergencyContacts)} /> : null}
      </Screen>
    );
  }

  return (
    <Screen title={t('emergency_title')} intro={t('sos_intro')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('sos')}. ${t('sos_hint')}`}
        accessibilityHint={t('sos_intro')}
        onPress={startSos}
        style={({ pressed }) => ({
          minHeight: 160,
          borderRadius: 80,
          backgroundColor: pressed ? c.text : c.danger,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: c.borderWidth > 1 ? 4 : 0,
          borderColor: c.text,
        })}
      >
        <Text style={{ color: c.onDanger, fontSize: 56, fontWeight: '800' }}>SOS</Text>
        <Text style={{ color: c.onDanger, fontSize: theme.font.body, fontWeight: theme.bold }}>{t('sos_hint')}</Text>
      </Pressable>
      <Body>{t('sos_intro')}</Body>

      {sos.kind === 'opened' && result ? <Banner text={result} /> : null}
      {note ? <Banner text={note} /> : null}

      <ToggleRow label={t('share_location')} hint={t('perm_location')} value={settings.sosShareLocation} onChange={v => updateSettings({ sosShareLocation: v })} />

      <Heading>{t('trusted_contacts')}</Heading>
      {contacts.length === 0 ? <Body muted>{t('no_trusted')}</Body> : null}
      {contacts.map(ct => (
        <Card key={ct.id}>
          <Text style={{ fontSize: theme.font.body + 2, fontWeight: theme.bold, color: c.text }}>
            {ct.name}
            {ct.relationship ? ` (${ct.relationship})` : ''}
          </Text>
          <Body muted>
            {ct.phone}
            {ct.isEmergency ? ` · SOS ✓` : ''}
          </Body>
          <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
            <BigButton compact style={{ flex: 1 }} icon="📞" label={t('sos_call', { name: ct.name.split(' ')[0] })} onPress={() => callContact(ct)} />
            <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('delete')} onPress={() => remove(ct)} accessibilityLabel={`${t('delete')} ${ct.name}`} />
          </View>
        </Card>
      ))}

      {adding ? (
        <AddTrustedContact
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      ) : (
        <BigButton variant="secondary" icon="+" label={t('add_contact')} onPress={() => setAdding(true)} />
      )}

      <Body muted>ⓘ {t('sos_disclaimer')}</Body>
    </Screen>
  );
}

function AddTrustedContact({ onDone }: { onDone: () => void }) {
  const { t, theme } = useApp();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isEmergency, setIsEmergency] = useState(true);
  const [search, setSearch] = useState('');
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[] | null>(null);

  const loadDeviceContacts = async () => {
    if (!(await ensurePermission('contacts', t, dialog.ask))) return;
    try {
      setDeviceContacts(await getDeviceContacts());
    } catch {
      setDeviceContacts([]);
    }
  };

  const q = normalizeName(search);
  const results = deviceContacts && q.length >= 2 ? deviceContacts.filter(d => normalizeName(d.name).includes(q)).slice(0, 6) : [];
  const valid = name.trim().length > 0 && phone.replace(/\D/g, '').length >= 6;

  return (
    <Card>
      <Heading>{t('add_contact')}</Heading>
      {deviceContacts === null ? (
        <BigButton variant="secondary" icon="👤" label={t('from_contacts')} onPress={loadDeviceContacts} />
      ) : (
        <>
          <Field label={t('from_contacts')} value={search} onChangeText={setSearch} placeholder={t('name')} />
          {results.map(d => (
            <BigButton
              key={d.id + d.phone}
              compact
              variant="secondary"
              label={`${d.name} · ${d.phone}`}
              onPress={() => {
                setName(d.name);
                setPhone(d.phone);
                setSearch('');
              }}
            />
          ))}
        </>
      )}
      <Field label={t('name')} value={name} onChangeText={setName} />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label={t('relationship')} value={relationship} onChangeText={setRelationship} />
      <ToggleRow label={t('emergency_contact')} value={isEmergency} onChange={setIsEmergency} />
      <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
        <BigButton style={{ flex: 1 }} variant="secondary" label={t('cancel')} onPress={onDone} />
        <BigButton
          style={{ flex: 1 }}
          label={t('save')}
          disabled={!valid}
          onPress={async () => {
            await trustedRepo.upsert({ name, phone, relationship: relationship.trim() ? relationshipFrom(relationship.trim()) ?? relationship.trim() : undefined, isEmergency });
            onDone();
          }}
        />
      </View>
    </Card>
  );
}
