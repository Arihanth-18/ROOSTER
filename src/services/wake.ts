import NativeWake from '../native/specs/NativeRoosterWake';

export type WakeMode = 'off' | 'screen_on' | 'always';
export type WakeStatus = 'off' | 'loading' | 'listening' | 'paused' | 'error';

/** Start/stop the on-device "Hey ROOSTER" listener. Returns false if Android refused (e.g. no mic permission). */
export async function applyWakeMode(mode: WakeMode): Promise<boolean> {
  if (mode === 'off') {
    NativeWake.stop();
    return true;
  }
  return NativeWake.start(mode);
}

export const getWakeStatus = () => NativeWake.getStatus() as Promise<WakeStatus>;
export const canDrawOverlays = () => NativeWake.canDrawOverlays();
export const openOverlaySettings = () => NativeWake.openOverlaySettings();
export const moveToBack = () => NativeWake.moveToBack();
export const setSpeakReminders = (on: boolean) => NativeWake.setSpeakReminders(on);

/** Hand the microphone to ROOSTER's own speech recognition, then give it back. */
export const pauseWake = () => NativeWake.pause();
export const resumeWake = () => NativeWake.resume();
