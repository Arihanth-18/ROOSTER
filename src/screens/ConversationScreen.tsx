import React, { useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import { Screen } from '../components/Screen';
import { MicButton } from '../components/MicButton';
import { TypeBox, RepeatStopRow } from '../components/AssistantPanel';
import { Banner } from '../components/Controls';
import { formatTime } from '../utils/dates';

export function ConversationScreen() {
  const { t, theme, settings } = useApp();
  const { turns, state, partial, toggleListening, offline } = useAssistant();
  const [editing, setEditing] = useState<{ text: string; key: number } | null>(null);
  const listRef = useRef<FlatList>(null);
  const c = theme.colors;

  return (
    <Screen
      title={t('conversation_title')}
      scroll={false}
      footer={
        <View style={{ gap: theme.space(1.5) }}>
          {state === 'listening' && partial ? (
            <Text accessibilityLiveRegion="polite" style={{ fontSize: theme.font.body, fontStyle: 'italic', color: c.text, textAlign: 'center' }}>
              “{partial}”
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5) }}>
            <MicButton state={state} onPress={toggleListening} size={96} />
            <View style={{ flex: 1 }}>
              <RepeatStopRow />
            </View>
          </View>
          {editing ? <Text style={{ fontSize: theme.font.small, color: c.textMuted }}>{t('heard_edit')}</Text> : null}
          <TypeBox key={editing?.key ?? 0} initial={editing?.text ?? ''} />
        </View>
      }
    >
      {offline ? <Banner text={`${t('ai_offline')}. ${t('ai_offline_hint')}`} /> : null}
      <FlatList
        ref={listRef}
        data={turns}
        keyExtractor={(item, i) => `${item.at}-${i}`}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ gap: theme.space(1.5), paddingBottom: theme.space(2) }}
        ListEmptyComponent={<Text style={{ fontSize: theme.font.body, color: c.textMuted, textAlign: 'center' }}>{t('conversation_empty')}</Text>}
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          return (
            <Pressable
              accessibilityRole={mine ? 'button' : 'text'}
              accessibilityLabel={`${mine ? t('you') : t('assistant')}: ${item.text}`}
              accessibilityHint={mine ? t('heard_edit') : undefined}
              // Tap your own message to correct what was recognised and send it again.
              onPress={mine ? () => setEditing({ text: item.text, key: Date.now() }) : undefined}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                backgroundColor: mine ? c.primary : c.surfaceAlt,
                borderRadius: theme.radius,
                borderWidth: c.borderWidth,
                borderColor: mine ? c.primary : c.border,
                padding: theme.space(1.5),
              }}
            >
              <Text style={{ fontSize: theme.font.body, color: mine ? c.onPrimary : c.text, lineHeight: theme.font.body * 1.4 }}>{item.text}</Text>
              <Text style={{ fontSize: theme.font.small - 2, color: mine ? c.onPrimary : c.textMuted, marginTop: 4 }}>
                {formatTime(new Date(item.at), settings.language)}
                {item.offline ? ` · ${t('offline_badge')}` : ''}
                {mine ? ` · ✎ ${t('edit')}` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
