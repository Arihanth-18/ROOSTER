import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import { Screen } from '../components/Screen';
import { MicButton } from '../components/MicButton';
import { BigButton } from '../components/BigButton';
import { Card, Heading, Body } from '../components/Controls';
import { RepeatStopRow, TranscriptLine, TypeBox } from '../components/AssistantPanel';
import { onRemindersChanged, todaysReminders } from '../services/reminders';
import { formatTime } from '../utils/dates';
import type { RootStackParamList } from '../navigation/navigationRef';
import type { Reminder } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const { t, theme, prefs, settings } = useApp();
  const nav = useNavigation<Nav>();
  const { state, toggleListening } = useAssistant();
  const [today, setToday] = useState<Array<{ reminder: Reminder; at: Date }>>([]);

  useFocusEffect(
    useCallback(() => {
      const load = () => todaysReminders().then(setToday).catch(() => {});
      load();
      return onRemindersChanged(load);
    }, []),
  );

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'greeting_morning' : hour < 17 ? 'greeting_afternoon' : 'greeting_evening');
  const simple = prefs.simplifiedInterface;
  const c = theme.colors;
  const now = new Date();

  return (
    <Screen title={`${greeting} 👋`} intro={t('home_screen_intro')} showBack={false}>
      <MicButton state={state} onPress={toggleListening} size={simple ? 230 : 200} />
      <TranscriptLine />
      <RepeatStopRow />
      {prefs.textInput ? <TypeBox /> : null}

      <BigButton variant="danger" icon="🆘" label={`${t('sos')} — ${t('sos_hint')}`} onPress={() => nav.navigate('Emergency')} />

      {!simple ? (
        <Card>
          <Heading>{t('today_summary')}</Heading>
          {today.length === 0 ? (
            <Body muted>{t('no_reminders_today')}</Body>
          ) : (
            today.slice(0, 4).map(({ reminder, at }) => {
              const past = at < now;
              return (
                <View key={reminder.id} style={{ flexDirection: 'row', gap: theme.space(1.5), alignItems: 'center' }}>
                  <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: past ? c.textMuted : c.primary, minWidth: 90 }}>
                    {formatTime(at, settings.language)}
                  </Text>
                  <Text style={{ flex: 1, fontSize: theme.font.body, color: past ? c.textMuted : c.text, textDecorationLine: reminder.completed ? 'line-through' : 'none' }}>
                    {reminder.type === 'medicine' ? '💊 ' : reminder.type === 'appointment' ? '📅 ' : '✔ '}
                    {reminder.title}
                  </Text>
                </View>
              );
            })
          )}
        </Card>
      ) : null}

      <View style={{ gap: theme.space(1.5) }}>
        <BigButton variant="secondary" icon="⏰" label={t('nav_reminders')} onPress={() => nav.navigate('Reminders')} />
        <BigButton variant="secondary" icon="📷" label={t('nav_reader')} onPress={() => nav.navigate('Reader')} />
        {!simple ? <BigButton variant="secondary" icon="💬" label={t('nav_conversation')} onPress={() => nav.navigate('Conversation')} /> : null}
        <BigButton variant="secondary" icon="⚙" label={t('nav_settings')} onPress={() => nav.navigate('Settings')} />
      </View>
    </Screen>
  );
}
