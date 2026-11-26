import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';
import NativeSpeech from '../native/specs/NativeRoosterSpeech';
import { SPEECH_LOCALE, type Language } from '../types';
import { splitForSpeech } from '../utils/textChunks';
import { pauseWake, resumeWake } from './wake';

type SpeechConfig = { language: Language; rate: number; volume: number; enabled: boolean };

let config: SpeechConfig = { language: 'en', rate: 0.9, volume: 1, enabled: true };
let lastSpoken = '';
let utteranceSeq = 0;

export function configureSpeech(c: SpeechConfig) {
  config = c;
}

export function getLastSpoken() {
  return lastSpoken;
}

// ---------------------------------------------------------------------------- TTS

export type SpeakOutcome = 'done' | 'stopped' | 'disabled' | 'lang_missing_data' | 'lang_not_supported' | 'tts_unavailable';

type Queue = {
  chunks: string[];
  index: number;
  resolve: (o: SpeakOutcome) => void;
  onProgress?: (index: number, total: number) => void;
  currentId: string;
};

let queue: Queue | null = null;
let ttsListeners: EmitterSubscription[] = [];
const speakingListeners = new Set<(speaking: boolean) => void>();

function setSpeaking(v: boolean) {
  speakingListeners.forEach(l => l(v));
}

export function onSpeakingChange(l: (speaking: boolean) => void): () => void {
  speakingListeners.add(l);
  return () => speakingListeners.delete(l);
}

function ensureTtsListeners() {
  if (ttsListeners.length) return;
  const advance = (e: { id: string }) => {
    if (!queue || e.id !== queue.currentId) return;
    queue.index += 1;
    if (queue.index >= queue.chunks.length) {
      const q = queue;
      queue = null;
      setSpeaking(false);
      q.resolve('done');
    } else {
      void speakChunk();
    }
  };
  ttsListeners = [
    DeviceEventEmitter.addListener('RoosterTts.done', advance),
    DeviceEventEmitter.addListener('RoosterTts.error', advance),
  ];
}

async function speakChunk() {
  if (!queue) return;
  const q = queue;
  q.currentId = `u${++utteranceSeq}`;
  q.onProgress?.(q.index, q.chunks.length);
  const status = await NativeSpeech.speak(
    q.chunks[q.index],
    SPEECH_LOCALE[config.language],
    config.rate,
    config.volume,
    q.currentId,
  );
  if (status !== 'started' && queue === q) {
    queue = null;
    setSpeaking(false);
    q.resolve(status as SpeakOutcome);
  }
}

/**
 * Speak text in the current language. Resolves when finished, stopped, or if speech is unavailable.
 * `startAt` lets the text reader resume from a chunk after pausing.
 */
export function speak(
  text: string,
  opts: { remember?: boolean; force?: boolean; startAt?: number; onProgress?: (i: number, total: number) => void } = {},
): Promise<SpeakOutcome> {
  const clean = text.trim();
  if (!clean) return Promise.resolve('done');
  if (opts.remember !== false) lastSpoken = clean;
  if (!config.enabled && !opts.force) return Promise.resolve('disabled');
  ensureTtsListeners();
  stopSpeaking();
  const chunks = splitForSpeech(clean);
  return new Promise(resolve => {
    queue = { chunks, index: Math.min(opts.startAt ?? 0, chunks.length - 1), resolve, onProgress: opts.onProgress, currentId: '' };
    setSpeaking(true);
    void speakChunk();
  });
}

export function stopSpeaking() {
  if (queue) {
    const q = queue;
    queue = null;
    q.resolve('stopped');
  }
  setSpeaking(false);
  NativeSpeech.stopSpeaking();
}

export function ttsLanguageStatus(lang: Language): Promise<string> {
  return NativeSpeech.getTtsLanguageStatus(SPEECH_LOCALE[lang]);
}

export const openTtsSettings = () => NativeSpeech.openTtsSettings();
export const openVoiceInputSettings = () => NativeSpeech.openVoiceInputSettings();
export const playCue = (kind: 'listen' | 'done' | 'error') => NativeSpeech.playCue(kind);

// ---------------------------------------------------------------------------- STT

export type ListenResult =
  | { ok: true; text: string }
  | { ok: false; code: string };

let activeListen: { finish: (r: ListenResult) => void } | null = null;

export function isRecognitionAvailable(): Promise<boolean> {
  return NativeSpeech.isRecognitionAvailable();
}

/** Listen once. Resolves with the final transcript or an error code; `onPartial` streams interim text. */
export function listen(onPartial?: (text: string) => void, onReady?: () => void): Promise<ListenResult> {
  cancelListening();
  stopSpeaking();
  return new Promise(resolve => {
    const subs: EmitterSubscription[] = [];
    let done = false;
    let lastPartial = '';
    const finish = (r: ListenResult) => {
      if (done) return;
      done = true;
      subs.forEach(s => s.remove());
      clearTimeout(timer);
      activeListen = null;
      resumeWake();
      resolve(r);
    };
    // Hard stop so the UI can never be stuck in "Listening".
    const timer = setTimeout(() => {
      NativeSpeech.stopListening();
      setTimeout(() => finish(lastPartial ? { ok: true, text: lastPartial } : { ok: false, code: 'no_speech' }), 1500);
    }, 20000);
    subs.push(
      DeviceEventEmitter.addListener('RoosterSpeech.partial', (e: { text: string }) => {
        lastPartial = e.text;
        onPartial?.(e.text);
      }),
      DeviceEventEmitter.addListener('RoosterSpeech.result', (e: { text: string }) => finish({ ok: true, text: e.text })),
      DeviceEventEmitter.addListener('RoosterSpeech.error', (e: { code: string }) =>
        finish(e.code === 'no_match' && lastPartial ? { ok: true, text: lastPartial } : { ok: false, code: e.code }),
      ),
      DeviceEventEmitter.addListener('RoosterSpeech.state', (e: { state: string }) => {
        if (e.state === 'ready') onReady?.();
      }),
    );
    activeListen = { finish };
    // Release the wake-word listener's microphone first; give it a moment to let go.
    pauseWake();
    setTimeout(() => {
      if (!done) NativeSpeech.startListening(SPEECH_LOCALE[config.language]);
    }, 250);
  });
}

/** Stop and use whatever was heard so far. */
export function stopListening() {
  NativeSpeech.stopListening();
}

export function cancelListening() {
  if (activeListen) {
    activeListen.finish({ ok: false, code: 'cancelled' });
  }
  NativeSpeech.cancelListening();
}
