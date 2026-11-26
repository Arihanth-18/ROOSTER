import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** System camera / photo picker + on-device ML Kit OCR. Images never leave the phone. */
export interface Spec extends TurboModule {
  /** Opens the system camera. Resolves a content URI, or '' if the user cancelled. */
  captureImage(): Promise<string>;
  /** Opens the Android photo picker. Resolves a content URI, or '' if cancelled. */
  pickImage(): Promise<string>;
  /** script: 'latin' | 'devanagari'. Resolves JSON { text, lineCount }. */
  recognizeText(uri: string, script: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterVision');
