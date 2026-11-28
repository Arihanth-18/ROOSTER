import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import NativeVision from '../native/specs/NativeRoosterVision';
import { useApp } from '../app/AppContext';
import { Screen } from '../components/Screen';
import { BigButton } from '../components/BigButton';
import { Banner, Body, Card } from '../components/Controls';
import { speak, stopSpeaking } from '../services/speech';
import { copyToClipboard } from '../services/device';
import { splitForSpeech } from '../utils/textChunks';
import type { RootStackParamList } from '../navigation/navigationRef';

type Phase = 'idle' | 'reading_image' | 'ready' | 'speaking' | 'paused' | 'error';

export function ReaderScreen() {
  const { t, theme, settings, prefs } = useApp();
  const route = useRoute<RouteProp<RootStackParamList, 'Reader'>>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [imageUri, setImageUri] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const resumeAt = useRef(0);
  const [current, setCurrent] = useState(0);
  const autoStarted = useRef(false);
  const c = theme.colors;

  // Hindi users get the Devanagari model (which also reads English). Kannada has no ML Kit model.
  const script = settings.language === 'hi' ? 'devanagari' : 'latin';

  useEffect(() => () => stopSpeaking(), []);

  const readAloud = async (from = 0) => {
    setPhase('speaking');
    const outcome = await speak(text, {
      force: true,
      startAt: from,
      onProgress: i => {
        resumeAt.current = i;
        setCurrent(i);
      },
    });
    setPhase(p => (p === 'paused' ? 'paused' : 'ready'));
    if (outcome === 'done') resumeAt.current = 0;
  };

  const process = async (uri: string) => {
    if (!uri) {
      setPhase(text ? 'ready' : 'idle');
      return;
    }
    stopSpeaking();
    setImageUri(uri);
    setText('');
    setMessage(null);
    setPhase('reading_image');
    try {
      const res = JSON.parse(await NativeVision.recognizeText(uri, script)) as { text: string; lineCount: number };
      const clean = res.text.trim();
      if (clean.length < 3) {
        setPhase('error');
        setMessage(t('ocr_empty'));
        void speak(t('ocr_empty'));
        return;
      }
      setText(clean);
      setPhase('ready');
      resumeAt.current = 0;
      // Read immediately — the user pointed the camera at it to hear it.
      setTimeout(() => {
        setPhase('speaking');
        speak(clean, { force: true, onProgress: i => { resumeAt.current = i; setCurrent(i); } }).then(o => {
          setPhase(p => (p === 'paused' ? 'paused' : 'ready'));
          if (o === 'done') resumeAt.current = 0;
        });
      }, 200);
    } catch {
      setPhase('error');
      setMessage(t('ocr_failed'));
      void speak(t('ocr_failed'));
    }
  };

  const capture = async () => {
    try {
      await process(await NativeVision.captureImage());
    } catch {
      setPhase('error');
      setMessage(t('action_failed'));
    }
  };

  const pick = async () => {
    try {
      await process(await NativeVision.pickImage());
    } catch {
      setPhase('error');
      setMessage(t('action_failed'));
    }
  };

  useEffect(() => {
    if (route.params?.autoCapture && !autoStarted.current) {
      autoStarted.current = true;
      void capture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoCapture]);

  const chunks = splitForSpeech(text);

  return (
    <Screen title={t('reader_title')} intro={t('reader_intro')} tab="reader">
      <Body>{t('reader_intro')}</Body>
      <View style={{ flexDirection: 'row', gap: theme.space(1.5) }}>
        <BigButton style={{ flex: 1 }} icon="📷" label={t('take_photo')} onPress={capture} disabled={phase === 'reading_image'} />
        <BigButton style={{ flex: 1 }} variant="secondary" icon="🖼" label={t('choose_photo')} onPress={pick} disabled={phase === 'reading_image'} />
      </View>

      {settings.language === 'kn' ? <Banner text={t('kannada_ocr_note')} /> : null}

      {phase === 'reading_image' ? (
        <View style={{ alignItems: 'center', gap: theme.space(1), padding: theme.space(2) }} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={c.primary} />
          <Body>{t('reading_image')}</Body>
        </View>
      ) : null}

      {message ? <Banner text={message} /> : null}

      {text ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) }}>
            {phase === 'speaking' ? (
              <BigButton
                style={{ flexGrow: 1 }}
                icon="⏸"
                label={t('pause')}
                onPress={() => {
                  setPhase('paused');
                  stopSpeaking();
                }}
              />
            ) : (
              <BigButton
                style={{ flexGrow: 1 }}
                icon="▶"
                label={phase === 'paused' ? t('resume') : t('read_aloud')}
                onPress={() => readAloud(phase === 'paused' ? resumeAt.current : 0)}
              />
            )}
            <BigButton
              style={{ flexGrow: 1 }}
              variant="secondary"
              icon="■"
              label={t('stop')}
              onPress={() => {
                stopSpeaking();
                resumeAt.current = 0;
                setPhase('ready');
              }}
            />
            <BigButton
              style={{ flexGrow: 1 }}
              variant="secondary"
              icon="⧉"
              label={t('copy')}
              onPress={() => {
                copyToClipboard(text);
                void speak(t('copied'), { remember: false });
              }}
            />
          </View>
          <Card>
            {chunks.map((chunk, i) => (
              <Text
                key={i}
                selectable
                style={{
                  fontSize: theme.font.heading,
                  lineHeight: theme.font.heading * 1.5,
                  color: c.text,
                  // Highlight the part being read so low-vision users can follow along.
                  backgroundColor: phase === 'speaking' && i === current ? c.warningBg : 'transparent',
                }}
              >
                {chunk}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      {imageUri && !prefs.simplifiedInterface ? (
        <Image source={{ uri: imageUri }} accessibilityIgnoresInvertColors accessible={false} style={{ width: '100%', height: 180, borderRadius: theme.radius, resizeMode: 'contain', backgroundColor: c.surface }} />
      ) : null}

      <Body muted>ⓘ {t('no_medical_advice')}</Body>
      <Body muted>🔒 {t('local_processing')}</Body>
    </Screen>
  );
}
