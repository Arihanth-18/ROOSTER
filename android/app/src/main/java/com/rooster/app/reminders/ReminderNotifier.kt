package com.rooster.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.rooster.app.MainActivity
import com.rooster.app.R

object ReminderNotifier {
  const val CHANNEL_ID = "rooster_reminders_v1"

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Medicine, appointment and task reminders"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 600, 300, 600)
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build(),
      )
    }
    nm.createNotificationChannel(channel)
  }

  fun notificationId(id: String) = id.hashCode()

  /** Returns false if notifications are disabled (the app warns the user about this up front). */
  fun show(ctx: Context, r: StoredReminder, missed: Boolean = false): Boolean {
    ensureChannel(ctx)
    val nm = NotificationManagerCompat.from(ctx)
    if (!nm.areNotificationsEnabled()) return false
    val open = PendingIntent.getActivity(
      ctx, notificationId(r.id),
      Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val title = if (missed) "Missed: ${r.title}" else r.title
    val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(r.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(r.body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    return try {
      nm.notify(notificationId(r.id), n)
      true
    } catch (_: SecurityException) {
      false
    }
  }

  fun cancel(ctx: Context, id: String) {
    NotificationManagerCompat.from(ctx).cancel(notificationId(id))
  }
}
