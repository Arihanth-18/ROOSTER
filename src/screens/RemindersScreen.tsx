import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { useApp } from '../app/AppContext';
import { useDialog } from '../components/DialogProvider';
import { Screen } from '../components/Screen';
import { BigButton } from '../components/BigButton';
import { Banner, Body, Card, Field, Heading, OptionGroup, Stepper } from '../components/Controls';
import { factsRepo, notesRepo, remindersRepo } from '../storage/repositories';
import {
  deleteReminder,
  describeWhen,
  nextTriggerOf,
  onRemindersChanged,
  ReminderInPastError,
  saveReminder,
  setCompleted,
} from '../services/reminders';
import { getReminderHealth, openBatterySettings, openExactAlarmSettings, openAppSettings, type ReminderHealth } from '../services/device';
import { ensurePermission } from '../assistant/permissions';
import { speak } from '../services/speech';
import { formatDateTime, formatDayChip, formatLongDate, formatTime, occursOn, parseLocalDateTime, toLocalDateTime } from '../utils/dates';
import { cardShadow } from '../components/Controls';
import { TYPE_ICON } from '../components/ActivityCarousel';
import type { RootStackParamList } from '../navigation/navigationRef';
import type { Note, Reminder } from '../types';

type Tab = 'reminders' | 'notes' | 'facts';

export function RemindersScreen() {
  const { t, theme } = useApp();
  const route = useRoute<RouteProp<RootStackParamList, 'Reminders'>>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'reminders');
  return (
    <Screen title={t('nav_reminders')} tab="reminders">
      <OptionGroup
        label=""
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reminders', label: t('reminders_title') },
          { value: 'notes', label: t('notes_title') },
          { value: 'facts', label: t('facts_title') },
        ]}
      />
      <View style={{ gap: theme.space(2) }}>
        {tab === 'reminders' ? <RemindersTab startAdding={!!route.params?.add} /> : tab === 'notes' ? <TextItemsTab kind="notes" /> : <TextItemsTab kind="facts" />}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------- reminders tab

function RemindersTab({ startAdding }: { startAdding: boolean }) {
  const { t, theme, settings } = useApp();
  const dialog = useDialog();
  const lang = settings.language;
  const [items, setItems] = useState<Reminder[]>([]);
  const [health, setHealth] = useState<ReminderHealth | null>(null);
  const [adding, setAdding] = useState(startAdding);
  const [dayOffset, setDayOffset] = useState(0);
  const c = theme.colors;

  const load = useCallback(() => {
    remindersRepo.all().then(setItems).catch(() => {});
    getReminderHealth().then(setHealth).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return onRemindersChanged(load);
    }, [load]),
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const day = week[dayOffset];
  const onDay = (d: Date) => items.filter(r => occursOn(r.localDateTime, r.recurrence, d));
  // The selected day's reminders, at their time on that day.
  const dayItems = onDay(day)
    .map(r => {
      const base = parseLocalDateTime(r.localDateTime)!;
      return { r, at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()) };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  // One-time reminders further away than this week.
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const later = items
    .map(r => ({ r, at: nextTriggerOf(r, now) }))
    .filter(x => x.at && x.at >= weekEnd)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());
  const done = items.filter(r => r.recurrence === 'none' && (r.completed || !nextTriggerOf(r, now)) && !occursOn(r.localDateTime, r.recurrence, day));
  const tint: Record<Reminder['type'], string> = { medicine: c.tintMedicine, appointment: c.tintAppointment, task: c.tintTask };

  const remove = async (r: Reminder) => {
    const ok = await dialog.ask({ message: t('confirm_delete', { title: r.title }), yesLabel: t('delete'), danger: true });
    if (!ok.confirmed) return;
    await deleteReminder(r.id);
    void speak(t('reminder_deleted'));
  };

  return (
    <>
      {health && !health.notifications ? (
        <Banner
          text={t('notif_disabled_warning')}
          actionLabel={t('fix')}
          onAction={async () => {
            if (!(await ensurePermission('notifications', t, dialog.ask))) openAppSettings();
            load();
          }}
        />
      ) : null}
      {health && !health.exact ? <Banner text={t('exact_alarm_warning')} actionLabel={t('fix')} onAction={openExactAlarmSettings} /> : null}
      {health && !health.batteryUnrestricted ? <Banner text={t('battery_warning')} actionLabel={t('fix')} onAction={openBatterySettings} /> : null}

      {/* The form opens at the top; otherwise the day's schedule comes first and "Add" sits under it. */}
      {adding ? <ReminderForm onClose={() => setAdding(false)} /> : null}

      {/* Week strip: today and the next 6 days, a dot where something is planned. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space(1), paddingVertical: 4 }}>
        {week.map((d, i) => {
          const selected = i === dayOffset;
          const [weekday, num] = formatDayChip(d, lang);
          const busy = onDay(d).length > 0;
          return (
            <Pressable
              key={d.toDateString()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${i === 0 ? t('today_summary') : weekday} ${num}${busy ? `, ${onDay(d).length} ${t('reminders_title')}` : ''}`}
              onPress={() => setDayOffset(i)}
              style={[
                {
                  width: 68,
                  minHeight: 92,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  backgroundColor: selected ? c.primary : c.surface,
                  borderWidth: c.shadow ? 0 : c.borderWidth,
                  borderColor: c.border,
                },
                c.shadow && !selected ? cardShadow : null,
              ]}
            >
              <Text style={{ fontSize: theme.font.small, fontWeight: '700', color: selected ? c.onPrimary : c.textMuted }}>
                {i === 0 ? t('today_summary') : weekday}
              </Text>
              <Text style={{ fontSize: theme.font.heading + 2, fontWeight: theme.bold, color: selected ? c.onPrimary : c.text }}>{num}</Text>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: busy ? (selected ? c.accent : c.primary) : 'transparent' }} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Heading>{dayOffset === 0 ? t('today_activities') : formatLongDate(day, lang)}</Heading>
      {dayItems.length === 0 ? <Body muted>{t('no_reminders_day')}</Body> : null}
      {dayItems.map(({ r, at }) => {
        const finished = r.completed || (dayOffset === 0 && r.recurrence === 'none' && at < now);
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), opacity: finished ? 0.6 : 1 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: tint[r.type], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 32 }} importantForAccessibility="no">
                  {r.completed ? '✔️' : TYPE_ICON[r.type]}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text }}>{formatTime(at, lang)}</Text>
                <Text style={{ fontSize: theme.font.body + 1, fontWeight: '700', color: c.text, textDecorationLine: r.completed ? 'line-through' : 'none' }}>
                  {r.title}
                </Text>
                <Text style={{ fontSize: theme.font.small, color: c.textMuted }}>{describeWhen(r, at, lang)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
              {r.recurrence === 'none' ? (
                r.completed ? (
                  <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('undo_done')} onPress={() => setCompleted(r, false, lang)} />
                ) : (
                  <BigButton compact style={{ flex: 1 }} label={t('mark_done')} onPress={() => setCompleted(r, true, lang)} />
                )
              ) : null}
              <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('delete')} onPress={() => remove(r)} accessibilityLabel={`${t('delete')} ${r.title}`} />
            </View>
          </Card>
        );
      })}

      {!adding ? <BigButton icon="+" label={t('add_reminder')} onPress={() => setAdding(true)} /> : null}

      {later.length ? <Heading>{t('later')}</Heading> : null}
      {later.map(({ r, at }) => (
        <Card key={r.id}>
          <Text style={{ fontSize: theme.font.body + 2, fontWeight: theme.bold, color: c.text }}>
            {TYPE_ICON[r.type]} {r.title}
          </Text>
          <Body muted>{describeWhen(r, at!, lang)}</Body>
          <BigButton compact variant="secondary" label={t('delete')} onPress={() => remove(r)} accessibilityLabel={`${t('delete')} ${r.title}`} />
        </Card>
      ))}

      {done.length ? <Heading>{t('completed')}</Heading> : null}
      {done.map(r => (
        <Card key={r.id}>
          <Text style={{ fontSize: theme.font.body, color: c.textMuted, textDecorationLine: r.completed ? 'line-through' : 'none' }}>
            {r.title} — {formatDateTime(parseLocalDateTime(r.localDateTime) ?? new Date(), lang)}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
            {r.completed ? <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('undo_done')} onPress={() => setCompleted(r, false, lang)} /> : null}
            <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('delete')} onPress={() => remove(r)} accessibilityLabel={`${t('delete')} ${r.title}`} />
          </View>
        </Card>
      ))}
    </>
  );
}

function ReminderForm({ onClose }: { onClose: () => void }) {
  const { t, theme, settings } = useApp();
  const dialog = useDialog();
  const lang = settings.language;
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Reminder['type']>('medicine');
  const [recurrence, setRecurrence] = useState<Reminder['recurrence']>('none');
  const initial = new Date(Date.now() + 60 * 60 * 1000);
  const [dayOffset, setDayOffset] = useState(0);
  // Minutes since midnight, in 5-minute steps.
  const [minutes, setMinutes] = useState(Math.ceil((initial.getHours() * 60 + initial.getMinutes()) / 5) * 5 % 1440);
  const [error, setError] = useState<string | null>(null);

  const when = new Date();
  when.setDate(when.getDate() + dayOffset);
  when.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  const save = async () => {
    setError(null);
    if (!(await ensurePermission('notifications', t, dialog.ask))) {
      setError(t('notif_disabled_warning'));
      return;
    }
    try {
      const { nextAt } = await saveReminder({ title: title.trim() || t(type === 'medicine' ? 'type_medicine' : type === 'appointment' ? 'type_appointment' : 'type_task'), type, recurrence, localDateTime: toLocalDateTime(when) }, lang);
      void speak(t('reminder_saved', { when: describeWhen({ recurrence }, nextAt, lang) }));
      onClose();
    } catch (e) {
      setError(e instanceof ReminderInPastError ? t('reminder_in_past') : t('action_failed'));
    }
  };

  const dayLabel = dayOffset === 0 ? t('today') : dayOffset === 1 ? t('tomorrow') : formatDateTime(when, lang).split(',').slice(0, 2).join(',');

  return (
    <Card>
      <Field label={t('reminder_what')} value={title} onChangeText={setTitle} placeholder={t('preview_text')} />
      <OptionGroup
        label=""
        value={type}
        onChange={setType}
        options={[
          { value: 'medicine', label: t('type_medicine') },
          { value: 'appointment', label: t('type_appointment') },
          { value: 'task', label: t('type_task') },
        ]}
      />
      <Stepper label={t('date')} value={dayOffset} min={0} max={60} step={1} format={() => dayLabel} lowerLabel="−" higherLabel="+" onChange={setDayOffset} />
      <Stepper
        label={t('time')}
        value={Math.floor(minutes / 60)}
        min={0}
        max={23}
        step={1}
        format={() => formatTime(when, lang)}
        lowerLabel="−1h"
        higherLabel="+1h"
        onChange={h => setMinutes(h * 60 + (minutes % 60))}
      />
      <Stepper
        label={`${t('time')} (min)`}
        value={minutes % 60}
        min={0}
        max={55}
        step={5}
        format={v => `:${String(v).padStart(2, '0')}`}
        lowerLabel="−5"
        higherLabel="+5"
        onChange={m => setMinutes(Math.floor(minutes / 60) * 60 + m)}
      />
      <OptionGroup
        label={t('repeat')}
        value={recurrence}
        onChange={setRecurrence}
        options={[
          { value: 'none', label: t('repeat_none') },
          { value: 'daily', label: t('repeat_daily') },
          { value: 'weekly', label: t('repeat_weekly') },
        ]}
      />
      {error ? <Banner text={error} /> : null}
      <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
        <BigButton style={{ flex: 1 }} variant="secondary" label={t('cancel')} onPress={onClose} />
        <BigButton style={{ flex: 1 }} label={t('save')} onPress={save} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------- notes & facts

function TextItemsTab({ kind }: { kind: 'notes' | 'facts' }) {
  const { t, theme } = useApp();
  const dialog = useDialog();
  const repo = kind === 'notes' ? notesRepo : factsRepo;
  const [items, setItems] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const c = theme.colors;

  const load = useCallback(() => {
    (query.trim() ? repo.search(query) : repo.all()).then(setItems).catch(() => {});
  }, [query, repo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  React.useEffect(load, [load]);

  const add = async () => {
    if (!draft.trim()) return;
    await repo.add(draft);
    setDraft('');
    void speak(kind === 'notes' ? t('note_saved') : t('fact_saved'));
    load();
  };

  const remove = async (n: Note) => {
    const ok = await dialog.ask({ message: t('confirm_delete', { title: n.text.slice(0, 60) }), yesLabel: t('delete'), danger: true });
    if (!ok.confirmed) return;
    await repo.remove(n.id);
    load();
  };

  return (
    <>
      <Card>
        <Field label={kind === 'notes' ? t('add_note') : t('facts_title')} value={draft} onChangeText={setDraft} placeholder={t('note_placeholder')} multiline />
        <BigButton label={t('save')} onPress={add} disabled={!draft.trim()} />
      </Card>
      {kind === 'notes' ? <Field label={t('search_notes')} value={query} onChangeText={setQuery} /> : null}
      {items.length === 0 ? <Body muted>{kind === 'notes' ? t('notes_empty') : t('facts_empty')}</Body> : null}
      {items.map(n => (
        <Card key={n.id}>
          <Text style={{ fontSize: theme.font.body, color: c.text, lineHeight: theme.font.body * 1.4 }}>{n.text}</Text>
          <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
            <BigButton compact style={{ flex: 1 }} variant="secondary" icon="🔊" label={t('read_aloud')} onPress={() => void speak(n.text)} />
            <BigButton compact style={{ flex: 1 }} variant="secondary" label={t('delete')} onPress={() => remove(n)} />
          </View>
        </Card>
      ))}
    </>
  );
}
