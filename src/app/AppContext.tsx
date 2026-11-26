import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Vibration } from 'react-native';
import { initDb } from '../storage/db';
import { settingsRepo } from '../storage/repositories';
import { DEFAULT_SETTINGS, type AccessibilityPrefs, type AppSettings } from '../accessibility/types';
import { buildTheme, type Theme } from '../theme/tokens';
import { makeT, type TFunction } from '../localization/i18n';
import { configureSpeech } from '../services/speech';
import { syncAllReminders } from '../services/reminders';
import { applyWakeMode, setSpeakReminders } from '../services/wake';
import { hasPermission } from '../services/device';
import { checkHealth } from '../services/assistantClient';

type AppContextValue = {
  ready: boolean;
  error: string | null;
  settings: AppSettings;
  prefs: AccessibilityPrefs;
  theme: Theme;
  t: TFunction;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updatePrefs: (patch: Partial<AccessibilityPrefs>) => void;
  /** Short vibration if the user enabled haptics. */
  haptic: (kind?: 'light' | 'strong') => void;
};

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        const loaded = await settingsRepo.load();
        // Respect the phone's own "remove animations" setting on first run.
        if (!loaded.onboarded && (await AccessibilityInfo.isReduceMotionEnabled())) {
          loaded.prefs = { ...loaded.prefs, reducedMotion: true };
        }
        settingsRef.current = loaded;
        setSettings(loaded);
        // Wake the hosted backend now (free hosting sleeps when idle) so it's ready by the first question.
        checkHealth(loaded.serverUrl).catch(() => {});
        if (loaded.onboarded) await syncAllReminders(loaded.language);
        setSpeakReminders(loaded.speakReminders);
        // Restart "Hey ROOSTER" whenever the app is opened (Android only allows starting it while visible).
        if (loaded.wakeMode !== 'off' && (await hasPermission('mic'))) {
          applyWakeMode(loaded.wakeMode).catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    configureSpeech({
      language: settings.language,
      rate: settings.prefs.speechRate,
      volume: settings.prefs.speechVolume,
      enabled: settings.prefs.voiceOutput || settings.prefs.audioFirst,
    });
  }, [settings.language, settings.prefs.speechRate, settings.prefs.speechVolume, settings.prefs.voiceOutput, settings.prefs.audioFirst]);

  const persist = useCallback((next: AppSettings) => {
    settingsRef.current = next;
    setSettings(next);
    settingsRepo.save(next).catch(() => {});
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...patch };
      persist(next);
      // Reminder notifications are spoken in the chosen language, so re-register on change.
      if (patch.language && patch.language !== prev.language && next.onboarded) {
        syncAllReminders(next.language).catch(() => {});
      }
      if (patch.speakReminders !== undefined) setSpeakReminders(patch.speakReminders);
    },
    [persist],
  );

  const updatePrefs = useCallback(
    (patch: Partial<AccessibilityPrefs>) => {
      const prev = settingsRef.current;
      persist({ ...prev, prefs: { ...prev.prefs, ...patch } });
    },
    [persist],
  );

  const haptic = useCallback((kind: 'light' | 'strong' = 'light') => {
    if (settingsRef.current.prefs.haptics) Vibration.vibrate(kind === 'strong' ? 80 : 30);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      error,
      settings,
      prefs: settings.prefs,
      theme: buildTheme(settings.prefs),
      t: makeT(settings.language),
      updateSettings,
      updatePrefs,
      haptic,
    }),
    [ready, error, settings, updateSettings, updatePrefs, haptic],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
