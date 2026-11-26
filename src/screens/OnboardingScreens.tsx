import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../app/AppContext';
import { Screen } from '../components/Screen';
import { BigButton } from '../components/BigButton';
import { Body, Card, Heading, OptionGroup, Stepper, ToggleRow, Banner } from '../components/Controls';
import { LANGUAGE_OPTIONS, translate } from '../localization/i18n';
import { speak, ttsLanguageStatus, openTtsSettings } from '../services/speech';
import type { RootStackParamList } from '../navigation/navigationRef';
import type { Language } from '../types';
import { buildTheme } from '../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------- Welcome

export function OnboardingScreen() {
  const { t, theme } = useApp();
  const nav = useNavigation<Nav>();
  useEffect(() => {
    // Spoken welcome so a blind user knows where they are before touching anything.
    void speak(`${t('welcome_title')}. ${t('welcome_body')}`, { remember: false, force: true });
  }, [t]);
  return (
    <Screen title={t('app_name')} showBack={false} footer={<BigButton label={t('get_started')} onPress={() => nav.navigate('Language')} />}>
      <View style={{ alignItems: 'center', paddingVertical: theme.space(3) }}>
        <Text style={{ fontSize: 96 }} importantForAccessibility="no">🐓</Text>
        <Text accessibilityRole="header" style={{ fontSize: theme.font.huge, fontWeight: '800', color: theme.colors.primary }}>ROOSTER</Text>
        <Body center muted>{t('tagline')}</Body>
      </View>
      <Card>
        <Heading>{t('welcome_title')}</Heading>
        <Body>{t('welcome_body')}</Body>
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------------------- Language

export function LanguageScreen() {
  const { t, theme, settings, updateSettings, haptic } = useApp();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Language'>>();
  const fromSettings = route.params?.fromSettings;
  const [voiceMissing, setVoiceMissing] = React.useState(false);
  const c = theme.colors;

  const choose = async (code: Language) => {
    haptic();
    updateSettings({ language: code });
    const status = await ttsLanguageStatus(code);
    setVoiceMissing(status !== 'available');
    // Speak in the chosen language so the user hears it works (forced even if voice replies are off).
    if (status === 'available') void speak(translate(code, 'welcome_title'), { remember: false, force: true });
  };

  return (
    <Screen
      title={t('choose_language')}
      intro={t('language_hint')}
      footer={<BigButton label={fromSettings ? t('done') : t('continue')} onPress={() => (fromSettings ? nav.goBack() : nav.navigate('AccessibilitySetup'))} />}
    >
      <Body muted>{t('language_hint')}</Body>
      {LANGUAGE_OPTIONS.map(o => {
        const selected = settings.language === o.code;
        return (
          <Pressable
            key={o.code}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${o.native}, ${o.english}`}
            onPress={() => choose(o.code)}
            style={{
              minHeight: theme.touch + 24,
              borderRadius: theme.radius,
              borderWidth: selected ? 4 : 2,
              borderColor: selected ? c.primary : c.border,
              backgroundColor: selected ? c.surfaceAlt : c.background,
              padding: theme.space(2),
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: theme.font.title, fontWeight: theme.bold, color: c.text }}>{o.native}</Text>
              <Text style={{ fontSize: theme.font.body, color: c.textMuted }}>{o.english}</Text>
            </View>
            {selected ? <Text style={{ fontSize: theme.font.title, color: c.primary }}>✓</Text> : null}
          </Pressable>
        );
      })}
      {voiceMissing ? <Banner text={t('tts_lang_missing')} actionLabel={t('install_voice')} onAction={openTtsSettings} /> : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------- Accessibility setup

export function AccessibilitySetupScreen() {
  const { t, theme, prefs, updatePrefs, updateSettings, settings } = useApp();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AccessibilitySetup'>>();
  const fromSettings = route.params?.fromSettings || settings.onboarded;

  const finish = () => {
    if (fromSettings) {
      nav.goBack();
      return;
    }
    updateSettings({ onboarded: true });
    nav.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  // The preview is rendered with a theme built from the *current* choices — it is the real theme.
  const preview = buildTheme(prefs);
  const pc = preview.colors;

  return (
    <Screen title={t('a11y_title')} intro={t('a11y_intro')} footer={<BigButton label={fromSettings ? t('done') : t('continue')} onPress={finish} />}>
      <Body muted>{t('a11y_intro')}</Body>

      <View
        accessibilityLabel={`${t('preview')}: ${t('preview_text')}`}
        style={{ borderRadius: preview.radius, borderWidth: Math.max(2, pc.borderWidth), borderColor: pc.border, backgroundColor: pc.background, padding: preview.space(2), gap: preview.space(1) }}
      >
        <Text style={{ fontSize: theme.font.small, color: theme.colors.textMuted, fontWeight: theme.bold }}>{t('preview').toUpperCase()}</Text>
        <Text style={{ fontSize: preview.font.body, color: pc.text, fontWeight: preview.bold }}>{t('preview_text')}</Text>
        <View style={{ minHeight: preview.touch, borderRadius: preview.radius, backgroundColor: pc.primary, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: pc.onPrimary, fontSize: preview.font.button, fontWeight: preview.bold }}>{t('mark_done')}</Text>
        </View>
      </View>

      <Card>
        <OptionGroup
          label={t('text_size')}
          value={prefs.textSize}
          onChange={v => updatePrefs({ textSize: v })}
          options={[
            { value: 'standard', label: t('text_standard') },
            { value: 'large', label: t('text_large') },
            { value: 'xlarge', label: t('text_xlarge') },
          ]}
        />
        <OptionGroup
          label={t('contrast')}
          value={prefs.contrast}
          onChange={v => updatePrefs({ contrast: v })}
          options={[
            { value: 'standard', label: t('contrast_standard') },
            { value: 'high', label: t('contrast_high') },
            { value: 'aaa', label: t('contrast_aaa') },
          ]}
        />
        <ToggleRow label={t('large_targets')} value={prefs.largeTouchTargets} onChange={v => updatePrefs({ largeTouchTargets: v })} />
        <ToggleRow label={t('simplified_ui')} value={prefs.simplifiedInterface} onChange={v => updatePrefs({ simplifiedInterface: v })} />
        <ToggleRow label={t('reduced_motion')} value={prefs.reducedMotion} onChange={v => updatePrefs({ reducedMotion: v })} />
      </Card>

      <Card>
        <ToggleRow label={t('audio_first')} hint={t('audio_first_hint')} value={prefs.audioFirst} onChange={v => updatePrefs({ audioFirst: v, voiceOutput: v ? true : prefs.voiceOutput })} />
        <ToggleRow label={t('voice_output')} value={prefs.voiceOutput} onChange={v => updatePrefs({ voiceOutput: v })} />
        <ToggleRow label={t('spoken_confirmation')} value={prefs.spokenConfirmation} onChange={v => updatePrefs({ spokenConfirmation: v })} />
        <Stepper
          label={t('speech_rate')}
          value={prefs.speechRate}
          min={0.5}
          max={1.5}
          step={0.1}
          format={v => `${Math.round(v * 100)}%`}
          lowerLabel={t('slower')}
          higherLabel={t('faster')}
          onChange={v => updatePrefs({ speechRate: v })}
        />
        <Stepper
          label={t('speech_volume')}
          value={prefs.speechVolume}
          min={0.2}
          max={1}
          step={0.1}
          format={v => `${Math.round(v * 100)}%`}
          lowerLabel={t('quieter')}
          higherLabel={t('louder')}
          onChange={v => updatePrefs({ speechVolume: v })}
        />
        <BigButton variant="secondary" icon="🔊" label={t('test_voice')} onPress={() => void speak(t('test_voice_sample'), { remember: false, force: true })} />
      </Card>

      <Card>
        <OptionGroup
          label={t('confirm_level')}
          value={prefs.confirmationLevel}
          onChange={v => updatePrefs({ confirmationLevel: v })}
          options={[
            { value: 'low', label: t('confirm_low') },
            { value: 'standard', label: t('confirm_standard') },
            { value: 'high', label: t('confirm_high') },
          ]}
        />
        <ToggleRow label={t('simple_language')} value={prefs.simplifiedLanguage} onChange={v => updatePrefs({ simplifiedLanguage: v })} />
        <ToggleRow label={t('text_input')} value={prefs.textInput} onChange={v => updatePrefs({ textInput: v })} />
        <ToggleRow label={t('haptics')} value={prefs.haptics} onChange={v => updatePrefs({ haptics: v })} />
      </Card>
    </Screen>
  );
}
