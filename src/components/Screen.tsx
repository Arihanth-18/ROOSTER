import React, { useCallback } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../app/AppContext';
import { speak } from '../services/speech';
import { BottomNav, type TabKey } from './BottomNav';
import { cardShadow } from './Controls';

type Props = {
  title: string;
  /** Spoken when the screen opens in audio-first mode, and announced to TalkBack. */
  intro?: string;
  children: React.ReactNode;
  showBack?: boolean;
  scroll?: boolean;
  footer?: React.ReactNode;
  /** Shown under the title inside the blue header (e.g. today's date). */
  headerExtra?: React.ReactNode;
  /** Shows the bottom navigation bar with this tab highlighted. */
  tab?: TabKey;
};

/**
 * Page layout: light-blue header band with a large centred title and a big rounded Back button,
 * a light-blue page for white cards, and (on main screens) the bottom navigation bar.
 */
export function Screen({ title, intro, children, showBack = true, scroll = true, footer, headerExtra, tab }: Props) {
  const { theme, prefs, t } = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const canBack = showBack && nav.canGoBack();
  const side = theme.touch;

  useFocusEffect(
    useCallback(() => {
      const text = intro ? `${title}. ${intro}` : title;
      if (prefs.audioFirst) void speak(text, { remember: false });
      else AccessibilityInfo.announceForAccessibility(title);
    }, [title, intro, prefs.audioFirst]),
  );

  const body = (
    <View style={{ padding: theme.space(2), gap: theme.space(2), paddingBottom: theme.space(scroll ? 4 : 1), flex: scroll ? undefined : 1 }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar barStyle="dark-content" />
      <View
        style={{
          backgroundColor: c.hero,
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(1.5),
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          borderBottomWidth: c.shadow ? 0 : c.borderWidth,
          borderColor: c.border,
          gap: theme.space(1.25),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
          {canBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('back')}
              onPress={() => nav.goBack()}
              style={({ pressed }) => [
                {
                  width: side,
                  height: side,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.surfaceAlt : c.surface,
                  borderWidth: c.shadow ? 0 : c.borderWidth,
                  borderColor: c.border,
                },
                c.shadow ? cardShadow : null,
              ]}
            >
              <Text style={{ fontSize: theme.font.title, color: c.text, fontWeight: theme.bold, marginTop: -4 }}>‹</Text>
            </Pressable>
          ) : (
            <View style={{ width: side }} />
          )}
          <Text
            accessibilityRole="header"
            style={{ flex: 1, textAlign: 'center', fontSize: theme.font.heading + 2, fontWeight: theme.bold, color: c.text }}
            numberOfLines={2}
          >
            {title}
          </Text>
          <View style={{ width: side }} />
        </View>
        {headerExtra ? <View style={{ alignItems: 'center' }}>{headerExtra}</View> : null}
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View
          style={{
            padding: theme.space(2),
            paddingBottom: theme.space(2) + (tab ? 0 : insets.bottom),
            borderTopWidth: c.borderWidth,
            borderTopColor: c.border,
            backgroundColor: c.background,
          }}
        >
          {footer}
        </View>
      ) : null}
      {tab ? <BottomNav active={tab} /> : footer ? null : <View style={{ height: insets.bottom }} />}
    </View>
  );
}

/** Rounded date pill for the header, e.g. "🗓️ Saturday, 28 November". (Not 📅: it shows a fixed "July 17".) */
export function DatePill({ text }: { text: string }) {
  const { theme } = useApp();
  const c = theme.colors;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: c.surface,
        borderRadius: 999,
        paddingHorizontal: theme.space(2),
        paddingVertical: theme.space(0.75),
        borderWidth: c.shadow ? 0 : c.borderWidth,
        borderColor: c.border,
      }}
    >
      <Text style={{ fontSize: theme.font.body }} importantForAccessibility="no">
        🗓️
      </Text>
      <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text }}>{text}</Text>
    </View>
  );
}
