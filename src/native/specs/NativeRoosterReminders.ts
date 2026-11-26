import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** AlarmManager-backed reminders that survive app close, reboot and time-zone changes. */
export interface Spec extends TurboModule {
  /**
   * Schedule (or replace) a reminder. localDateTime is wall-clock "YYYY-MM-DDTHH:mm".
   * recurrence: 'none' | 'daily' | 'weekly'. Resolves the next trigger time (epoch ms) or -1 if
   * a one-time reminder is already in the past.
   */
  schedule(
    id: string,
    title: string,
    body: string,
    localDateTime: string,
    recurrence: string,
    spokenText: string,
    locale: string,
  ): Promise<number>;
  cancel(id: string): void;
  cancelAll(): void;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): void;
  areNotificationsEnabled(): Promise<boolean>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  openBatteryOptimizationSettings(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RoosterReminders');
