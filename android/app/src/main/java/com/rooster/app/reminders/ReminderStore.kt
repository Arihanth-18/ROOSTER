package com.rooster.app.reminders

import android.content.Context
import org.json.JSONObject

/**
 * Native mirror of scheduled reminders, so alarms can be restored after reboot without
 * starting the JavaScript runtime. The app's SQLite database remains the source of truth for the UI;
 * the app re-syncs this mirror on every launch.
 */
data class StoredReminder(
  val id: String,
  val title: String,
  val body: String,
  /** Wall-clock "YYYY-MM-DDTHH:mm" — kept as local time so 8 AM stays 8 AM after a time-zone change. */
  val localDateTime: String,
  val recurrence: String,
  val spokenText: String,
  val locale: String,
  /** Epoch ms of the trigger currently scheduled with AlarmManager. */
  val scheduledFor: Long = -1,
  /** Epoch ms of the trigger that last fired — used to prevent duplicate notifications. */
  val firedFor: Long = -1,
) {
  fun toJson(): String = JSONObject()
    .put("id", id).put("title", title).put("body", body)
    .put("localDateTime", localDateTime).put("recurrence", recurrence)
    .put("spokenText", spokenText).put("locale", locale)
    .put("scheduledFor", scheduledFor).put("firedFor", firedFor)
    .toString()

  companion object {
    fun fromJson(s: String): StoredReminder? = try {
      val o = JSONObject(s)
      StoredReminder(
        id = o.getString("id"),
        title = o.optString("title"),
        body = o.optString("body"),
        localDateTime = o.getString("localDateTime"),
        recurrence = o.optString("recurrence", "none"),
        spokenText = o.optString("spokenText"),
        locale = o.optString("locale", "en-IN"),
        scheduledFor = o.optLong("scheduledFor", -1),
        firedFor = o.optLong("firedFor", -1),
      )
    } catch (_: Exception) { null }
  }
}

object ReminderStore {
  private const val PREFS = "rooster_reminders"

  // App-private storage (sandboxed per app). Holds titles only, no contacts or notes.
  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun get(ctx: Context, id: String): StoredReminder? =
    prefs(ctx).getString(id, null)?.let { StoredReminder.fromJson(it) }

  fun put(ctx: Context, r: StoredReminder) {
    prefs(ctx).edit().putString(r.id, r.toJson()).commit()
  }

  fun remove(ctx: Context, id: String) {
    prefs(ctx).edit().remove(id).commit()
  }

  fun all(ctx: Context): List<StoredReminder> =
    prefs(ctx).all.values.mapNotNull { (it as? String)?.let(StoredReminder::fromJson) }

  fun clear(ctx: Context) {
    prefs(ctx).edit().clear().commit()
  }
}
