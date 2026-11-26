import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../app/AppContext';
import type { AssistantState } from '../assistant/AssistantProvider';
import type { StringKey } from '../localization/i18n';
import { RoosterAvatar } from './RoosterAvatar';

const STATE_LABEL: Record<AssistantState, StringKey> = {
  idle: 'state_idle',
  listening: 'state_listening',
  thinking: 'state_thinking',
  speaking: 'state_speaking',
  done: 'state_done',
  error: 'state_error',
};

/**
 * The primary control: ROOSTER's animated face with a microphone badge.
 * Always labelled with what a tap does and what ROOSTER is doing right now.
 */
export function MicButton({ state, onPress, size = 200 }: { state: AssistantState; onPress: () => void; size?: number }) {
  const { theme, t } = useApp();
  const c = theme.colors;
  const listening = state === 'listening';
  const actionLabel = listening ? t('stop_listening') : t('tap_to_speak');

  return (
    <View style={{ alignItems: 'center', gap: theme.space(0.5) }}>
      <RoosterAvatar
        state={state}
        size={size}
        micBadge
        onPress={onPress}
        accessibilityLabel={actionLabel}
        accessibilityHint={t(STATE_LABEL[state])}
      />
      <Text style={{ fontSize: theme.font.button, fontWeight: theme.bold, color: c.primary }} importantForAccessibility="no">
        {actionLabel}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: state === 'error' ? c.danger : c.text }}
      >
        {t(STATE_LABEL[state])}
      </Text>
    </View>
  );
}
