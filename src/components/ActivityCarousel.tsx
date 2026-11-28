import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../app/AppContext';
import { formatTime } from '../utils/dates';
import type { Reminder } from '../types';
import { cardShadow } from './Controls';

type Item = { reminder: Reminder; at: Date };

export const TYPE_ICON: Record<Reminder['type'], string> = { medicine: '💊', appointment: '🩺', task: '✅' };

/**
 * "Today's activities": big swipeable cards (time, icon, title), opened on the next upcoming one.
 * Finished ones are faded with a tick; the next one has a mint outline and a "Next" label.
 */
export function ActivityCarousel({ items, onOpen, onAdd }: { items: Item[]; onOpen: () => void; onAdd: () => void }) {
  const { t, theme, settings } = useApp();
  const { width } = useWindowDimensions();
  const c = theme.colors;
  const cardW = Math.min(280, Math.round(width * 0.64));
  const gap = theme.space(1.5);
  const side = Math.round((width - cardW) / 2);
  const now = new Date();
  const nextIndex = useMemo(() => {
    const i = items.findIndex(x => x.at >= now && !x.reminder.completed);
    return i < 0 ? Math.max(0, items.length - 1) : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const tint: Record<Reminder['type'], string> = { medicine: c.tintMedicine, appointment: c.tintAppointment, task: c.tintTask };
  const typeLabel = { medicine: t('type_medicine'), appointment: t('type_appointment'), task: t('type_task') };

  const shell = (key: string, highlight: boolean, faded: boolean, child: React.ReactNode, label: string, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: cardW,
          minHeight: 250,
          borderRadius: 32,
          backgroundColor: c.surface,
          padding: theme.space(2),
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.space(1),
          borderWidth: highlight ? 4 : c.shadow ? 0 : c.borderWidth,
          borderColor: highlight ? c.accent : c.border,
          opacity: faded ? 0.6 : pressed ? 0.85 : 1,
        },
        c.shadow ? cardShadow : null,
      ]}
    >
      {child}
    </Pressable>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardW + gap}
      decelerationRate="fast"
      contentOffset={{ x: nextIndex * (cardW + gap), y: 0 }}
      style={{ marginHorizontal: -theme.space(2) }}
      contentContainerStyle={{ paddingHorizontal: side, paddingVertical: theme.space(1.5), gap }}
    >
      {items.map(({ reminder, at }, i) => {
        const past = at < now || reminder.completed;
        const isNext = i === nextIndex && !past;
        const time = formatTime(at, settings.language);
        return shell(
          reminder.id,
          isNext,
          past,
          <>
            <View style={{ alignItems: 'center', gap: 4 }}>
              {isNext ? (
                <Text style={{ fontSize: theme.font.small, fontWeight: theme.bold, color: c.onAccent, backgroundColor: c.accent, paddingHorizontal: 12, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>
                  {t('next_up')}
                </Text>
              ) : null}
              <Text style={{ fontSize: theme.font.title, fontWeight: theme.bold, color: c.text }}>{time}</Text>
            </View>
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: tint[reminder.type], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 52 }} importantForAccessibility="no">
                {reminder.completed ? '✔️' : TYPE_ICON[reminder.type]}
              </Text>
            </View>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text numberOfLines={2} style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text, textAlign: 'center' }}>
                {reminder.title}
              </Text>
              <Text style={{ fontSize: theme.font.small, fontWeight: '700', color: c.textMuted, letterSpacing: 1 }}>
                {typeLabel[reminder.type].toUpperCase()}
              </Text>
            </View>
          </>,
          `${time}, ${reminder.title}, ${typeLabel[reminder.type]}${reminder.completed ? `, ${t('completed')}` : ''}`,
          onOpen,
        );
      })}
      {shell(
        'add',
        false,
        false,
        <>
          <Text style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: c.textMuted, textAlign: 'center' }}>
            {items.length ? '' : t('no_reminders_today')}
          </Text>
          <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 56, color: c.onAccent, fontWeight: theme.bold, marginTop: -4 }} importantForAccessibility="no">
              +
            </Text>
          </View>
          <Text style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text, textAlign: 'center' }}>{t('add_reminder')}</Text>
        </>,
        t('add_reminder'),
        onAdd,
      )}
    </ScrollView>
  );
}
