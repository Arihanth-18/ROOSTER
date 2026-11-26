import React, { useCallback } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../app/AppContext';
import { speak } from '../services/speech';

type Props = {
  title: string;
  /** Spoken when the screen opens in audio-first mode, and announced to TalkBack. */
  intro?: string;
  children: React.ReactNode;
  showBack?: boolean;
  scroll?: boolean;
  footer?: React.ReactNode;
};

export function Screen({ title, intro, children, showBack = true, scroll = true, footer }: Props) {
  const { theme, prefs, t } = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

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
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.space(1.5),
          minHeight: theme.touch + 8,
          borderBottomWidth: c.borderWidth,
          borderBottomColor: c.border,
          gap: theme.space(1),
        }}
      >
        {showBack && nav.canGoBack() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            onPress={() => nav.goBack()}
            style={{ minWidth: theme.touch, minHeight: theme.touch, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius }}
          >
            <Text style={{ fontSize: theme.font.title, color: c.primary, fontWeight: theme.bold }}>‹</Text>
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text }} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View style={{ padding: theme.space(2), paddingBottom: theme.space(2) + insets.bottom, borderTopWidth: c.borderWidth, borderTopColor: c.border, backgroundColor: c.background }}>
          {footer}
        </View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </View>
  );
}
