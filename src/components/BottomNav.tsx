import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../app/AppContext';
import { useAssistant } from '../assistant/AssistantProvider';
import type { StringKey } from '../localization/i18n';
import type { RootStackParamList } from '../navigation/navigationRef';
import { cardShadow } from './Controls';

export type TabKey = 'home' | 'reminders' | 'reader' | 'settings' | 'talk';
type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS: Array<{ key: Exclude<TabKey, 'talk'>; route: 'Home' | 'Reminders' | 'Reader' | 'Settings'; icon: string; label: StringKey }> = [
  { key: 'home', route: 'Home', icon: '🏠', label: 'tab_home' },
  { key: 'reminders', route: 'Reminders', icon: '⏰', label: 'tab_reminders' },
  { key: 'reader', route: 'Reader', icon: '📷', label: 'tab_read' },
  { key: 'settings', route: 'Settings', icon: '⚙️', label: 'tab_settings' },
];

/**
 * Always-visible bottom bar with large, labelled buttons and a raised mint "Talk" button in the middle.
 * Tab screens sit directly on top of Home, so Back always returns Home.
 */
export function BottomNav({ active }: { active?: TabKey }) {
  const { t, theme, haptic, settings } = useApp();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { state, toggleListening } = useAssistant();
  const c = theme.colors;
  const listening = state === 'listening';

  const go = (route: (typeof TABS)[number]['route'], key: TabKey) => {
    if (key === active) return;
    haptic();
    if (route === 'Home') nav.popToTop();
    else if (active && active !== 'home') nav.dispatch(StackActions.replace(route));
    else nav.navigate(route);
  };

  const talk = () => {
    haptic();
    // Wispr Flow mode: open the text box with the keyboard up; the user dictates with Wispr's mic.
    if (settings.dictation === 'wispr' && !listening) {
      const params = { dictate: Date.now() };
      if (active === 'talk') nav.setParams(params);
      else if (active && active !== 'home') nav.dispatch(StackActions.replace('Conversation', params));
      else nav.navigate('Conversation', params);
      return;
    }
    toggleListening();
    // On other screens, show the conversation so the user sees what ROOSTER heard.
    if (active !== 'home' && active !== 'talk') {
      if (active) nav.dispatch(StackActions.replace('Conversation'));
      else nav.navigate('Conversation');
    }
  };

  const item = (tab: (typeof TABS)[number]) => {
    const selected = tab.key === active;
    return (
      <Pressable
        key={tab.key}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={t(tab.label)}
        onPress={() => go(tab.route, tab.key)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: theme.touch,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 20,
          paddingVertical: 4,
          backgroundColor: selected ? c.surfaceAlt : pressed ? c.background : 'transparent',
        })}
      >
        <Text style={{ fontSize: 26 }} importantForAccessibility="no">
          {tab.icon}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: Math.min(theme.font.small, 18), fontWeight: selected ? theme.bold : '600', color: selected ? c.text : c.textMuted }}
        >
          {t(tab.label)}
        </Text>
      </Pressable>
    );
  };

  const size = theme.touch + 18;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: c.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: c.shadow ? 0 : c.borderWidth,
          borderColor: c.border,
          paddingHorizontal: theme.space(1),
          paddingTop: theme.space(1),
          paddingBottom: theme.space(1) + insets.bottom,
          gap: 4,
        },
        c.shadow ? { ...cardShadow, elevation: 12 } : null,
      ]}
    >
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={{ flex: 1.2, alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? t('stop_listening') : t('tap_to_speak')}
          onPress={talk}
          style={({ pressed }) => ({
            width: size,
            height: size,
            marginTop: -size / 2,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: listening ? c.danger : c.accent,
            borderWidth: 5,
            borderColor: c.surface,
            opacity: pressed ? 0.85 : 1,
            ...(c.shadow ? cardShadow : { borderColor: c.text, borderWidth: c.borderWidth + 1 }),
          })}
        >
          {listening ? (
            <View style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: c.onDanger }} />
          ) : (
            <Text style={{ fontSize: 32 }} importantForAccessibility="no">
              🎤
            </Text>
          )}
        </Pressable>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: Math.min(theme.font.small, 18), fontWeight: theme.bold, color: c.text, marginTop: 2, marginBottom: 4 }}
          importantForAccessibility="no"
        >
          {listening ? t('tab_stop') : settings.dictation === 'wispr' ? t('tab_dictate') : t('tab_talk')}
        </Text>
      </View>
      {item(TABS[2])}
      {item(TABS[3])}
    </View>
  );
}
