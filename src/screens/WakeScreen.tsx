import React, { useEffect, useRef } from 'react';
import { Pressable, StatusBar, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import { useDialog } from '../components/DialogProvider';
import { RoosterAvatar } from '../components/RoosterAvatar';
import { moveToBack, resumeWake } from '../services/wake';
import type { StringKey } from '../localization/i18n';

const STATE_LABEL: Record<string, StringKey> = {
  idle: 'wake_greeting',
  listening: 'state_listening',
  thinking: 'state_thinking',
  speaking: 'state_speaking',
  done: 'state_done',
  error: 'state_error',
};

/** How long ROOSTER stays on screen after finishing before stepping back. */
const IDLE_CLOSE_MS = 6000;

/**
 * Opened by "Hey ROOSTER" over whatever the user was doing: listens straight away,
 * answers, then gets out of the way.
 */
export function WakeScreen() {
  const { t, theme } = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const dialog = useDialog();
  const { state, partial, turns, toggleListening, stop } = useAssistant();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);

  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    stop();
    resumeWake();
    if (nav.canGoBack()) nav.goBack();
    moveToBack();
  };

  // Start listening immediately — the user already said "Hey ROOSTER".
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const id = setTimeout(() => toggleListening(), 350);
    return () => clearTimeout(id);
  }, [toggleListening]);

  // Step back once ROOSTER has finished and nothing is waiting for the user.
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const quiet = state === 'done' || state === 'idle' || state === 'error';
    if (quiet && started.current) {
      closeTimer.current = setTimeout(() => {
        if (!dialog.isOpen()) close();
      }, IDLE_CLOSE_MS);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => () => resumeWake(), []);

  const lastAssistant = [...turns].reverse().find(x => x.role === 'assistant');
  const lastUser = [...turns].reverse().find(x => x.role === 'user');
  const big = theme.font.heading + 2;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0F24', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          onPress={close}
          style={{ minWidth: 64, minHeight: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <RoosterAvatar
          state={state}
          size={240}
          onPress={toggleListening}
          accessibilityLabel={state === 'listening' ? t('stop_listening') : t('tap_to_speak')}
        />
        <Text accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', fontSize: big, fontWeight: '800', textAlign: 'center' }}>
          {t(STATE_LABEL[state] ?? 'wake_greeting')}
        </Text>

        {state === 'listening' && partial ? (
          <Text style={{ color: '#C7D2FE', fontSize: theme.font.body + 2, fontStyle: 'italic', textAlign: 'center' }}>“{partial}”</Text>
        ) : null}

        {state !== 'listening' && lastUser && started.current ? (
          <Text style={{ color: '#A5B4FC', fontSize: theme.font.body, textAlign: 'center' }}>“{lastUser.text}”</Text>
        ) : null}

        {state !== 'listening' && lastAssistant ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 18, alignSelf: 'stretch', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: theme.font.body + 2, lineHeight: (theme.font.body + 2) * 1.4, textAlign: 'center' }}>
              {lastAssistant.text}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
