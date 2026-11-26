import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useDialog, type AskOptions, type AskResult } from '../components/DialogProvider';
import { conversationRepo } from '../storage/repositories';
import type { ChatTurn, IntentResult } from '../types';
import { interpret, AiOfflineError } from '../services/assistantClient';
import { parseOffline } from '../services/offlineParser';
import {
  cancelListening,
  getLastSpoken,
  isRecognitionAvailable,
  listen,
  onSpeakingChange,
  openVoiceInputSettings,
  playCue,
  speak,
  stopListening,
  stopSpeaking,
} from '../services/speech';
import { execute, type Draft } from './executor';
import { ensurePermission } from './permissions';
import { parseConfirmAnswer } from './confirmWords';

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error';

type AssistantApi = {
  state: AssistantState;
  partial: string;
  turns: ChatTurn[];
  offline: boolean;
  lastError: string | null;
  /** Mic button: start listening, or stop if already listening. */
  toggleListening: () => void;
  submitText: (text: string) => Promise<void>;
  repeatLast: () => void;
  stop: () => void;
};

const Ctx = createContext<AssistantApi | null>(null);

/** Intents handled instantly on-device, without a network round trip. */
const LOCAL_FIRST = new Set(['stop_speaking', 'repeat_last_response', 'emergency_help']);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { settings, prefs, t, haptic } = useApp();
  const dialog = useDialog();
  const [state, setState] = useState<AssistantState>('idle');
  const [partial, setPartial] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [offline, setOffline] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const draftRef = useRef<Draft | null>(null);
  const busyRef = useRef(false);
  const stateRef = useRef<AssistantState>('idle');
  const turnsRef = useRef<ChatTurn[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setPhase = useCallback((s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  useEffect(() => {
    conversationRepo.recent().then(list => {
      turnsRef.current = list;
      setTurns(list);
    }).catch(() => {});
  }, []);

  // Reflect TTS activity in the visible state.
  useEffect(
    () =>
      onSpeakingChange(speaking => {
        if (speaking && stateRef.current !== 'listening') setPhase('speaking');
        else if (!speaking && stateRef.current === 'speaking') setPhase('done');
      }),
    [setPhase],
  );

  const addTurn = useCallback((turn: ChatTurn) => {
    const next = [...turnsRef.current, turn].slice(-60);
    turnsRef.current = next;
    setTurns(next);
    conversationRepo.add(turn).catch(() => {});
  }, []);

  const say = useCallback(
    async (text: string, isOffline = false) => {
      if (!text) {
        setPhase('done');
        return;
      }
      addTurn({ role: 'assistant', text, at: Date.now(), offline: isOffline });
      const outcome = await speak(text);
      if (outcome === 'lang_missing_data' || outcome === 'lang_not_supported') setLastError(t('tts_lang_missing'));
      if (stateRef.current !== 'listening') setPhase('done');
    },
    [addTurn, setPhase, t],
  );

  /**
   * Confirmation by voice: speak the question, then listen for "yes" / "no" / "the second one"
   * without the user touching anything. The on-screen buttons keep working at the same time;
   * whichever answers first wins. Up to two listening attempts, then the dialog simply waits.
   */
  const voiceAsk = useCallback(
    (o: AskOptions): Promise<AskResult> => {
      const answered = dialog.ask({ ...o, speakIt: false });
      let settled = false;
      void (async () => {
        const list = o.choices?.length ? ' ' + o.choices.map((c, i) => `${i + 1}. ${c}`).join('. ') : '';
        await speak(o.message + list, { remember: false });
        for (let attempt = 0; attempt < 2 && !settled && dialog.isOpen(); attempt++) {
          setPhase('listening');
          if (settingsRef.current.prefs.audioFirst) playCue('listen');
          const res = await listen(setPartial);
          setPartial('');
          if (settled || !dialog.isOpen()) return;
          if (res.ok) {
            const ans = parseConfirmAnswer(res.text, o.choices);
            if (ans.kind === 'yes') { dialog.answer({ confirmed: true, choice: o.choices?.length ? 0 : undefined }); return; }
            if (ans.kind === 'no') { dialog.answer({ confirmed: false }); return; }
            if (ans.kind === 'choice') { dialog.answer({ confirmed: true, choice: ans.index }); return; }
          } else if (res.code === 'cancelled') {
            return;
          }
          if (attempt === 0) await speak(t('say_yes_or_no'), { remember: false });
        }
        if (!settled) setPhase('thinking');
      })();
      return answered.then(r => {
        settled = true;
        cancelListening();
        setPartial('');
        setPhase('thinking');
        return r;
      });
    },
    [dialog, setPhase, t],
  );

  /** Understand + act on one user utterance. */
  const handle = useCallback(
    async (rawText: string, fromVoice = false) => {
      const text = rawText.trim();
      if (!text || busyRef.current) return;
      const s = settingsRef.current;

      // A spoken "yes"/"no"/"the second one" answers an open confirmation dialog.
      const open = dialog.current();
      if (dialog.isOpen() && open) {
        const ans = parseConfirmAnswer(text, open.choices);
        if (ans.kind === 'yes') { dialog.answer({ confirmed: true, choice: open.choices?.length ? 0 : undefined }); return; }
        if (ans.kind === 'no') { dialog.answer({ confirmed: false }); return; }
        if (ans.kind === 'choice') { dialog.answer({ confirmed: true, choice: ans.index }); return; }
        speak(t('say_yes_or_no'), { remember: false });
        return;
      }

      busyRef.current = true;
      setLastError(null);
      addTurn({ role: 'user', text, at: Date.now() });
      setPhase('thinking');
      const history = turnsRef.current.slice(0, -1);

      try {
        let result: IntentResult | null = null;
        let aiAvailable = true;
        const local = parseOffline(text);

        if (draftRef.current?.kind === 'reminder') {
          // A bare answer like "8 pm" after "what time?" — parse locally, it's reliable.
          const timed = parseOffline(`remind me ${text}`);
          if (timed?.parameters.datetime) {
            result = { ...timed, parameters: { ...timed.parameters, title: draftRef.current.title } };
          }
        }
        if (!result && local && LOCAL_FIRST.has(local.intent)) result = local;

        if (!result) {
          try {
            result = await interpret(s.serverUrl, text, s.language, s.prefs.simplifiedLanguage, history);
            setOffline(false);
          } catch (e) {
            aiAvailable = false;
            setOffline(true);
            result = local;
            if (!result) {
              await say(t('ai_offline_spoken'), true);
              return;
            }
            if (!(e instanceof AiOfflineError)) throw e;
          }
        }

        const draft = draftRef.current;
        draftRef.current = null;
        const out = await execute(
          {
            t,
            settings: s,
            // Spoken commands get spoken confirmations that listen for the answer automatically.
            ask: fromVoice || s.prefs.audioFirst ? voiceAsk : dialog.ask,
            history,
            utterance: text,
            aiAvailable,
          },
          result,
          draft,
        );
        draftRef.current = out.draft ?? null;
        if (out.silent) setPhase('idle');
        else {
          haptic();
          await say(out.say, result.source === 'offline');
        }
      } catch {
        setPhase('error');
        setLastError(t('action_failed'));
        if (prefs.audioFirst) playCue('error');
        await say(t('action_failed'));
      } finally {
        busyRef.current = false;
      }
    },
    [addTurn, dialog, haptic, prefs.audioFirst, say, setPhase, t, voiceAsk],
  );

  const startListening = useCallback(async () => {
    stopSpeaking();
    setLastError(null);
    if (!(await ensurePermission('mic', t, dialog.ask))) return;
    if (!(await isRecognitionAvailable())) {
      setPhase('error');
      setLastError(t('speech_unavailable'));
      await speak(t('speech_unavailable'));
      return;
    }
    setPartial('');
    setPhase('listening');
    haptic();
    if (prefs.audioFirst) playCue('listen');
    const res = await listen(setPartial);
    setPartial('');
    if (res.ok) {
      if (prefs.audioFirst) playCue('done');
      await handle(res.text, true);
      return;
    }
    if (res.code === 'cancelled') {
      setPhase('idle');
      return;
    }
    if (prefs.audioFirst) playCue('error');
    setPhase('error');
    const msg =
      res.code === 'no_speech' || res.code === 'no_match'
        ? t('heard_nothing')
        : res.code === 'language_not_supported' || res.code === 'language_unavailable'
          ? t('speech_lang_unavailable')
          : res.code === 'network' || res.code === 'server'
            ? t('speech_network')
            : res.code === 'permission'
              ? t('perm_denied')
              : t('state_error');
    setLastError(msg);
    await speak(msg);
    if (res.code === 'language_not_supported' || res.code === 'language_unavailable') {
      const go = await dialog.ask({ message: t('speech_lang_unavailable'), yesLabel: t('install_voice'), noLabel: t('close'), speakIt: false });
      if (go.confirmed) openVoiceInputSettings();
    }
  }, [dialog, handle, haptic, prefs.audioFirst, setPhase, t]);

  const toggleListening = useCallback(() => {
    if (stateRef.current === 'listening') {
      stopListening();
      return;
    }
    if (busyRef.current) return;
    void startListening();
  }, [startListening]);

  const api = useMemo<AssistantApi>(
    () => ({
      state,
      partial,
      turns,
      offline,
      lastError,
      toggleListening,
      submitText: (text: string) => handle(text, false),
      repeatLast: () => void speak(getLastSpoken() || t('nothing_to_repeat')),
      stop: () => {
        cancelListening();
        stopSpeaking();
        setPhase('idle');
      },
    }),
    [state, partial, turns, offline, lastError, toggleListening, handle, setPhase, t],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAssistant(): AssistantApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant must be used inside AssistantProvider');
  return v;
}
