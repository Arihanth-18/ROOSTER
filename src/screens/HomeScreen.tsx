import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import { DatePill, Screen } from '../components/Screen';
import { MicButton } from '../components/MicButton';
import { BigButton } from '../components/BigButton';
import { Card, cardShadow } from '../components/Controls';
import { ActivityCarousel } from '../components/ActivityCarousel';
import { RepeatStopRow, TranscriptLine, TypeBox } from '../components/AssistantPanel';
import { onRemindersChanged, todaysReminders } from '../services/reminders';
import { formatLongDate } from '../utils/dates';
import type { RootStackParamList } from '../navigation/navigationRef';
import type { Reminder } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const { t, theme, prefs, settings } = useApp();
  const nav = useNavigation<Nav>();
  const { state, toggleListening } = useAssistant();
  const [today, setToday] = useState<Array<{ reminder: Reminder; at: Date }>>([]);
  const c = theme.colors;

  useFocusEffect(
    useCallback(() => {
      const load = () =>
        todaysReminders()
          .then(list => setToday([...list].sort((a, b) => a.at.getTime() - b.at.getTime())))
          .catch(() => {});
      load();
      return onRemindersChanged(load);
    }, []),
  );

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'greeting_morning' : hour < 17 ? 'greeting_afternoon' : 'greeting_evening');
  const simple = prefs.simplifiedInterface;

  const sectionTitle = (text: string, action?: { label: string; onPress: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text }}>
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}>
          <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text, textDecorationLine: 'underline' }}>{action.label} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const tile = (icon: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: theme.touch + 40,
          borderRadius: theme.radius,
          backgroundColor: pressed ? c.surfaceAlt : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: theme.space(1.5),
          borderWidth: c.shadow ? 0 : c.borderWidth,
          borderColor: c.border,
        },
        c.shadow ? cardShadow : null,
      ]}
    >
      <Text style={{ fontSize: 34 }} importantForAccessibility="no">
        {icon}
      </Text>
      <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen
      title={`${greeting} 👋`}
      intro={t('home_screen_intro')}
      showBack={false}
      tab="home"
      headerExtra={<DatePill text={formatLongDate(new Date(), settings.language)} />}
    >
      {!simple ? (
        <>
          {sectionTitle(t('today_activities'), { label: t('see_all'), onPress: () => nav.navigate('Reminders') })}
          <ActivityCarousel
            items={today}
            onOpen={() => nav.navigate('Reminders')}
            onAdd={() => nav.navigate('Reminders', { add: true })}
          />
        </>
      ) : null}

      <Card>
        <MicButton state={state} onPress={toggleListening} size={simple ? 210 : 170} />
        <TranscriptLine />
        <RepeatStopRow />
        {prefs.textInput ? <TypeBox /> : null}
      </Card>

      <BigButton variant="danger" icon="🆘" label={`${t('sos')} — ${t('sos_hint')}`} onPress={() => nav.navigate('Emergency')} />

      {!simple ? (
        <View style={{ flexDirection: 'row', gap: theme.space(1.5) }}>
          {tile('💬', t('nav_conversation'), () => nav.navigate('Conversation'))}
          {tile('📝', t('notes_title'), () => nav.navigate('Reminders', { tab: 'notes' }))}
        </View>
      ) : null}
    </Screen>
  );
}
