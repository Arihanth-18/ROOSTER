import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import { BigButton } from './BigButton';
import { Banner } from './Controls';

/** Live transcript, last reply, repeat/stop and the typing alternative — shared by Home and Conversation. */
export function TranscriptLine() {
  const { theme, t } = useApp();
  const { state, partial, turns, offline, lastError } = useAssistant();
  const c = theme.colors;
  const lastAssistant = [...turns].reverse().find(x => x.role === 'assistant');
  const lastUser = [...turns].reverse().find(x => x.role === 'user');

  return (
    <View style={{ gap: theme.space(1) }}>
      {offline ? <Banner text={`${t('ai_offline')}. ${t('ai_offline_hint')}`} /> : null}
      {lastError ? <Banner text={lastError} /> : null}
      {state === 'listening' && partial ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: theme.font.heading, color: c.text, textAlign: 'center', fontStyle: 'italic' }}>
          “{partial}”
        </Text>
      ) : null}
      {state !== 'listening' && lastUser ? (
        <Text style={{ fontSize: theme.font.body, color: c.textMuted, textAlign: 'center' }}>
          {t('you')}: “{lastUser.text}”
        </Text>
      ) : null}
      {state !== 'listening' && lastAssistant ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: c.surfaceAlt, borderRadius: theme.radius, padding: theme.space(2), borderWidth: c.borderWidth, borderColor: c.border }}
        >
          <Text style={{ fontSize: theme.font.body + 1, color: c.text, lineHeight: (theme.font.body + 1) * 1.4 }}>{lastAssistant.text}</Text>
          {lastAssistant.offline ? (
            <Text style={{ marginTop: 6, fontSize: theme.font.small, color: c.warning, fontWeight: theme.bold }}>{t('offline_badge')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function RepeatStopRow() {
  const { theme, t } = useApp();
  const { repeatLast, stop } = useAssistant();
  return (
    <View style={{ flexDirection: 'row', gap: theme.space(1.5) }}>
      <BigButton style={{ flex: 1 }} variant="secondary" icon="↻" label={t('repeat_last')} onPress={repeatLast} />
      <BigButton style={{ flex: 1 }} variant="secondary" icon="■" label={t('stop_speaking')} onPress={stop} />
    </View>
  );
}

/**
 * Type (or dictate with a keyboard such as Wispr Flow) a request. In Wispr Flow mode the box grows to
 * show the whole dictated sentence and the hint says to use Wispr's mic.
 */
export function TypeBox({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const { theme, t, settings } = useApp();
  const wispr = settings.dictation === 'wispr';
  const { submitText, state } = useAssistant();
  const [text, setText] = useState(initial);
  const c = theme.colors;
  const send = () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    void submitText(v);
  };
  return (
    <View style={{ flexDirection: 'row', gap: theme.space(1), alignItems: 'stretch' }}>
      <TextInput
        accessibilityLabel={wispr ? t('type_placeholder_wispr') : t('type_placeholder')}
        value={text}
        onChangeText={setText}
        autoFocus={autoFocus}
        multiline={wispr}
        placeholder={wispr ? t('type_placeholder_wispr') : t('type_placeholder')}
        placeholderTextColor={c.textMuted}
        onSubmitEditing={send}
        returnKeyType="send"
        style={{
          flex: 1,
          minHeight: theme.touch,
          maxHeight: wispr ? theme.touch * 3 : undefined,
          paddingVertical: wispr ? theme.space(1) : undefined,
          borderWidth: Math.max(2, c.borderWidth),
          borderColor: c.border,
          borderRadius: theme.radius,
          paddingHorizontal: theme.space(2),
          fontSize: theme.font.body,
          color: c.text,
          backgroundColor: c.background,
        }}
      />
      <BigButton label={t('send')} onPress={send} disabled={!text.trim() || state === 'thinking'} />
    </View>
  );
}
