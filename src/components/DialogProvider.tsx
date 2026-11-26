import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../app/AppContext';
import { BigButton } from './BigButton';
import { speak, stopSpeaking } from '../services/speech';

export type AskOptions = {
  title?: string;
  message: string;
  yesLabel?: string;
  noLabel?: string;
  /** Optional list of choices (e.g. which "Ravi"). Resolves with the chosen index. */
  choices?: string[];
  danger?: boolean;
  /** Speak the message aloud (defaults to the user's spoken-confirmation preference). */
  speakIt?: boolean;
  /** Extra line shown in small text, e.g. low-confidence warning. */
  note?: string;
};

export type AskResult = { confirmed: boolean; choice?: number };

type DialogApi = {
  ask: (o: AskOptions) => Promise<AskResult>;
  /** Resolve the open dialog from outside (voice "yes"/"no"/choice). Returns false if none open. */
  answer: (r: AskResult) => boolean;
  isOpen: () => boolean;
  current: () => AskOptions | null;
};

const Ctx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { theme, t, prefs, haptic } = useApp();
  const [opts, setOpts] = useState<AskOptions | null>(null);
  const resolver = useRef<((r: AskResult) => void) | null>(null);
  const optsRef = useRef<AskOptions | null>(null);

  const close = useCallback((r: AskResult) => {
    const res = resolver.current;
    resolver.current = null;
    optsRef.current = null;
    setOpts(null);
    res?.(r);
  }, []);

  const ask = useCallback(
    (o: AskOptions) => {
      if (resolver.current) resolver.current({ confirmed: false });
      optsRef.current = o;
      setOpts(o);
      haptic();
      const shouldSpeak = o.speakIt ?? (prefs.spokenConfirmation || prefs.audioFirst);
      if (shouldSpeak) {
        const list = o.choices?.length ? ' ' + o.choices.map((c, i) => `${i + 1}. ${c}`).join('. ') : '';
        void speak(o.message + list);
      }
      return new Promise<AskResult>(resolve => {
        resolver.current = resolve;
      });
    },
    [prefs.spokenConfirmation, prefs.audioFirst, haptic],
  );

  const answer = useCallback(
    (r: AskResult) => {
      if (!resolver.current) return false;
      close(r);
      return true;
    },
    [close],
  );

  const api = useRef<DialogApi>({ ask, answer, isOpen: () => false, current: () => null });
  api.current.ask = ask;
  api.current.answer = answer;
  api.current.isOpen = () => resolver.current !== null;
  api.current.current = () => optsRef.current;

  const c = theme.colors;
  return (
    <Ctx.Provider value={api.current}>
      {children}
      <Modal
        visible={opts !== null}
        transparent
        animationType={prefs.reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => { stopSpeaking(); close({ confirmed: false }); }}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border, borderWidth: c.borderWidth, borderRadius: theme.radius }]}
          >
            <ScrollView contentContainerStyle={{ padding: theme.space(3) }}>
              {opts?.title ? (
                <Text accessibilityRole="header" style={{ color: c.text, fontSize: theme.font.heading, fontWeight: theme.bold, marginBottom: theme.space(1) }}>
                  {opts.title}
                </Text>
              ) : null}
              <Text style={{ color: c.text, fontSize: theme.font.body, lineHeight: theme.font.body * 1.4 }}>{opts?.message}</Text>
              {opts?.note ? (
                <Text style={{ color: c.warning, fontSize: theme.font.small, marginTop: theme.space(1) }}>{opts.note}</Text>
              ) : null}
              <View style={{ marginTop: theme.space(3), gap: theme.space(1.5) }}>
                {opts?.choices?.length ? (
                  opts.choices.map((choice, i) => (
                    <BigButton key={choice + i} label={`${i + 1}. ${choice}`} onPress={() => { stopSpeaking(); close({ confirmed: true, choice: i }); }} />
                  ))
                ) : (
                  <BigButton
                    label={opts?.yesLabel ?? t('yes')}
                    variant={opts?.danger ? 'danger' : 'primary'}
                    onPress={() => { stopSpeaking(); close({ confirmed: true }); }}
                  />
                )}
                <BigButton label={opts?.noLabel ?? t('cancel')} variant="secondary" onPress={() => { stopSpeaking(); close({ confirmed: false }); }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

export function useDialog(): DialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialog must be used inside DialogProvider');
  return v;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 12 },
  sheet: { maxHeight: '88%', overflow: 'hidden' },
});
