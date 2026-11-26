package com.rooster.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.rooster.app.MainActivity
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

object ReminderScheduler {
  const val ACTION_FIRE = "com.rooster.app.REMINDER_FIRE"
  const val EXTRA_ID = "reminder_id"

  /** Next trigger strictly after [after], or null for a one-time reminder already in the past. */
  fun nextTrigger(localDateTime: String, recurrence: String, after: ZonedDateTime): Long? {
    val base = LocalDateTime.parse(localDateTime).atZone(ZoneId.systemDefault())
    val stepDays = when (recurrence) {
      "daily" -> 1L
      "weekly" -> 7L
      else -> return if (base.isAfter(after)) base.toInstant().toEpochMilli() else null
    }
    var t = base
    if (!t.isAfter(after)) {
      // Jump close to "after" first so very old base dates don't loop for long.
      val days = java.time.Duration.between(t, after).toDays()
      t = t.plusDays((days / stepDays) * stepDays)
      while (!t.isAfter(after)) t = t.plusDays(stepDays)
    }
    return t.toInstant().toEpochMilli()
  }

  fun canScheduleExact(ctx: Context): Boolean {
    val am = ctx.getSystemService(AlarmManager::class.java)
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
  }

  private fun firePendingIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, ReminderReceiver::class.java).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(
      ctx, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Schedules (replacing any existing alarm for the same id). Returns the trigger time or -1. */
  fun schedule(ctx: Context, reminder: StoredReminder, after: ZonedDateTime = ZonedDateTime.now()): Long {
    val am = ctx.getSystemService(AlarmManager::class.java)
    val pi = firePendingIntent(ctx, reminder.id)
    am.cancel(pi)
    val trigger = nextTrigger(reminder.localDateTime, reminder.recurrence, after)
    if (trigger == null) {
      ReminderStore.put(ctx, reminder.copy(scheduledFor = -1))
      return -1
    }
    if (canScheduleExact(ctx)) {
      // setAlarmClock is the most reliable path through Doze and OEM battery savers,
      // and shows the alarm icon so the user can see a reminder is set.
      val show = PendingIntent.getActivity(
        ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
      )
      am.setAlarmClock(AlarmManager.AlarmClockInfo(trigger, show), pi)
    } else {
      // Without exact-alarm access Android may delay this by several minutes. The app tells the user.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
    }
    ReminderStore.put(ctx, reminder.copy(scheduledFor = trigger))
    return trigger
  }

  fun cancel(ctx: Context, id: String) {
    ctx.getSystemService(AlarmManager::class.java).cancel(firePendingIntent(ctx, id))
    ReminderStore.remove(ctx, id)
    ReminderNotifier.cancel(ctx, id)
  }

  fun cancelAll(ctx: Context) {
    ReminderStore.all(ctx).forEach { cancel(ctx, it.id) }
    ReminderStore.clear(ctx)
  }

  /**
   * Re-register every stored reminder (after reboot, app update or time change). One-time reminders
   * whose time passed while the phone was off are shown once as "missed" instead of silently dropped.
   */
  fun restoreAll(ctx: Context) {
    val now = ZonedDateTime.now()
    for (r in ReminderStore.all(ctx)) {
      val missed = r.recurrence == "none" && r.scheduledFor > 0 &&
        r.scheduledFor <= now.toInstant().toEpochMilli() && r.firedFor != r.scheduledFor
      if (missed) {
        ReminderNotifier.show(ctx, r, missed = true)
        ReminderStore.put(ctx, r.copy(firedFor = r.scheduledFor, scheduledFor = -1))
      } else {
        schedule(ctx, r, now)
      }
    }
  }
}
