package com.rooster.app.reminders

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.rooster.app.specs.NativeRoosterRemindersSpec
import java.time.LocalDateTime

class RoosterRemindersModule(private val ctx: ReactApplicationContext) : NativeRoosterRemindersSpec(ctx) {

  companion object { const val NAME = "RoosterReminders" }

  override fun getName() = NAME

  override fun schedule(
    id: String,
    title: String,
    body: String,
    localDateTime: String,
    recurrence: String,
    spokenText: String,
    locale: String,
    promise: Promise,
  ) {
    try {
      LocalDateTime.parse(localDateTime) // validate before storing
      val rec = if (recurrence in setOf("none", "daily", "weekly")) recurrence else "none"
      val existing = ReminderStore.get(ctx, id)
      val r = StoredReminder(
        id, title, body, localDateTime, rec, spokenText, locale,
        firedFor = if (existing?.localDateTime == localDateTime) existing.firedFor else -1,
      )
      promise.resolve(ReminderScheduler.schedule(ctx, r).toDouble())
    } catch (e: Exception) {
      promise.reject("schedule_failed", e.message ?: "Could not schedule reminder", e)
    }
  }

  override fun cancel(id: String) = ReminderScheduler.cancel(ctx, id)

  override fun cancelAll() = ReminderScheduler.cancelAll(ctx)

  override fun canScheduleExactAlarms(promise: Promise) = promise.resolve(ReminderScheduler.canScheduleExact(ctx))

  private fun start(intent: Intent): Boolean = try {
    ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
  } catch (_: Exception) { false }

  override fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      start(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}")))
    ) return
    start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
  }

  override fun areNotificationsEnabled(promise: Promise) =
    promise.resolve(NotificationManagerCompat.from(ctx).areNotificationsEnabled())

  override fun isIgnoringBatteryOptimizations(promise: Promise) {
    val pm = ctx.getSystemService(PowerManager::class.java)
    promise.resolve(pm.isIgnoringBatteryOptimizations(ctx.packageName))
  }

  override fun openBatteryOptimizationSettings() {
    if (!start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
      start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
    }
  }
}
