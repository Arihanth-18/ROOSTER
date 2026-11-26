import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Android SpeechRecognizer + TextToSpeech.
 * Events (DeviceEventEmitter):
 *  - RoosterSpeech.state   { state: 'ready' | 'speech_start' | 'speech_end' }
 *  - RoosterSpeech.partial { text }
 *  - RoosterSpeech.result  { text }
 *  - RoosterSpeech.error   { code: string, message: string }
 *  - RoosterTts.start / RoosterTts.done / RoosterTts.error   { id }
 */
export interface Spec extends TurboModule {
  isRecognitionAvailable(): Promise<boolean>;
  startListening(locale: string): void;
  stopListening(): void;
  cancelListening(): void;

  /** Resolves 'started' | 'lang_missing_data' | 'lang_not_supported' | 'tts_unavailable'. */
  speak(text: string, locale: string, rate: number, volume: number, utteranceId: string): Promise<string>;
  stopSpeaking(): void;
  /** 'available' | 'missing_data' | 'not_supported' | 'tts_unavailable' */
  getTtsLanguageStatus(locale: string): Promise<string>;
  openTtsSettings(): void;
  openVoiceInputSettings(): void;
  /** 'listen' | 'done' | 'error' — short tone for audio-first feedback. */
  playCue(kind: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterSpeech');
