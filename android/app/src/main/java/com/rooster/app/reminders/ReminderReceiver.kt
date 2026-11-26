package com.rooster.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.time.ZonedDateTime
import java.util.Locale

/** Restores alarms after reboot, app update, or clock / time-zone changes. Exported for system broadcasts only. */
class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> ReminderScheduler.restoreAll(context.applicationContext)
    }
  }
}

/** Fires a reminder. Not exported: only ROOSTER's own AlarmManager PendingIntents reach it. */
class ReminderReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ReminderScheduler.ACTION_FIRE) {
      fire(context.applicationContext, intent.getStringExtra(ReminderScheduler.EXTRA_ID))
    }
  }

  private fun fire(ctx: Context, id: String?) {
    if (id == null) return
    val r = ReminderStore.get(ctx, id) ?: return // deleted in the app — do nothing
    val now = ZonedDateTime.now()
    // Guard against duplicate delivery of the same occurrence (e.g. restore racing a fire).
    if (r.scheduledFor > 0 && r.firedFor == r.scheduledFor) return

    ReminderNotifier.show(ctx, r)
    val fired = r.copy(firedFor = r.scheduledFor)
    ReminderStore.put(ctx, fired)

    if (r.recurrence != "none") {
      // Schedule the next occurrence at least one minute out so this one cannot re-fire.
      ReminderScheduler.schedule(ctx, fired, now.plusMinutes(1))
    }

    // "Read reminders aloud" setting (on by default).
    if (r.spokenText.isNotBlank() && com.rooster.app.wake.RoosterWakeModule.speakReminders(ctx)) speak(ctx, r.spokenText, r.locale)
  }

  /** Speak the reminder aloud on the alarm stream. Bounded to ~9 s to stay within broadcast limits. */
  private fun speak(ctx: Context, text: String, locale: String) {
    val pending = goAsync()
    val handler = Handler(Looper.getMainLooper())
    var tts: TextToSpeech? = null
    var finished = false
    val finish = {
      if (!finished) {
        finished = true
        try { tts?.shutdown() } catch (_: Exception) { }
        pending.finish()
      }
    }
    handler.postDelayed({ finish() }, 9000)
    tts = TextToSpeech(ctx) { status ->
      handler.post {
        val t = tts
        if (status != TextToSpeech.SUCCESS || t == null) { finish(); return@post }
        val loc = Locale.forLanguageTag(locale)
        val ok = t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE
        t.language = if (ok) loc else Locale.forLanguageTag("en-IN")
        t.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        t.setSpeechRate(0.9f)
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {}
          override fun onDone(utteranceId: String?) { handler.post { finish() } }
          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) { handler.post { finish() } }
        })
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reminder")
      }
    }
  }
}
