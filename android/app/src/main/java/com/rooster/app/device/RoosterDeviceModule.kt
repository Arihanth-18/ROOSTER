package com.rooster.app.device

import android.Manifest
import android.app.Notification
import android.app.SearchManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.provider.MediaStore
import android.view.KeyEvent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.rooster.app.specs.NativeRoosterDeviceSpec
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class RoosterDeviceModule(private val ctx: ReactApplicationContext) : NativeRoosterDeviceSpec(ctx) {

  companion object {
    const val NAME = "RoosterDevice"
    private const val NOTES_PREFS = "rooster_notes_app"
    private const val KEY_NOTES_APP = "package"
    private val KNOWN_NOTES_APPS = setOf(
      "com.google.android.keep", "com.oneplus.note", "com.coloros.note", "com.oplus.note",
      "com.samsung.android.app.notes", "com.miui.notes", "com.vivo.notes", "com.huawei.notepad",
      "com.microsoft.office.onenote", "com.evernote", "com.realme.note",
    )
  }

  private val io = Executors.newSingleThreadExecutor()

  override fun getName() = NAME

  private fun granted(permission: String) =
    ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED

  /** Prefer the current activity so intents open on top of ROOSTER; fall back to a new task. */
  private fun launch(intent: Intent): Boolean {
    return try {
      val activity = ctx.currentActivity
      if (activity != null) activity.startActivity(intent)
      else ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: Exception) {
      false
    }
  }

  // ------------------------------------------------------------ contacts

  override fun getContacts(promise: Promise) {
    if (!granted(Manifest.permission.READ_CONTACTS)) {
      promise.reject("permission", "Contacts permission not granted"); return
    }
    io.execute {
      try {
        val out = JSONArray()
        val seen = HashSet<String>()
        val projection = arrayOf(
          ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER,
        )
        ctx.contentResolver.query(
          ContactsContract.CommonDataKinds.Phone.CONTENT_URI, projection, null, null,
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC",
        )?.use { c ->
          while (c.moveToNext()) {
            val id = c.getString(0) ?: continue
            val name = c.getString(1) ?: continue
            val phone = c.getString(2) ?: continue
            val key = id + "|" + phone.filter { it.isDigit() }.takeLast(10)
            if (!seen.add(key)) continue
            out.put(JSONObject().put("id", id).put("name", name).put("phone", phone))
          }
        }
        promise.resolve(out.toString())
      } catch (e: Exception) {
        promise.reject("contacts_failed", e.message ?: "Could not read contacts", e)
      }
    }
  }

  // ------------------------------------------------------------ calls & sms

  override fun dial(phone: String, promise: Promise) {
    promise.resolve(launch(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone)))))
  }

  /** Direct call after the user confirmed. Resolves 'calling' | 'no_permission' | 'failed'. */
  override fun placeCall(phone: String, promise: Promise) {
    promise.resolve(DirectComms.placeCall(ctx, ctx.currentActivity, phone))
  }

  /** Direct SMS after the user confirmed. Resolves JSON { sent, failed, total, error? } once the radio reports back. */
  override fun sendSms(phones: String, body: String, promise: Promise) {
    val list = phones.split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }
    if (list.isEmpty()) { promise.reject("no_recipients", "No phone numbers"); return }
    DirectComms.sendSms(ctx, list, body) { promise.resolve(it) }
  }

  override fun composeSms(phones: String, body: String, promise: Promise) {
    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(phones, ",;")))
      .putExtra("sms_body", body)
    promise.resolve(launch(intent))
  }

  // ------------------------------------------------------------ apps

  override fun getLaunchableApps(promise: Promise) {
    io.execute {
      try {
        val pm = ctx.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val out = JSONArray()
        val seen = HashSet<String>()
        for (ri in pm.queryIntentActivities(main, 0)) {
          val pkg = ri.activityInfo.packageName
          if (pkg == ctx.packageName || !seen.add(pkg)) continue
          out.put(JSONObject().put("label", ri.loadLabel(pm).toString()).put("packageName", pkg))
        }
        promise.resolve(out.toString())
      } catch (e: Exception) {
        promise.reject("apps_failed", e.message ?: "Could not list apps", e)
      }
    }
  }

  override fun launchApp(packageName: String, promise: Promise) {
    val intent = ctx.packageManager.getLaunchIntentForPackage(packageName)
    promise.resolve(intent != null && launch(intent))
  }

  override fun openAppSettings() {
    launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
  }

  // ------------------------------------------------------------ notifications (opt-in)

  override fun isNotificationAccessEnabled(promise: Promise) {
    promise.resolve(NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName))
  }

  override fun openNotificationAccessSettings() {
    if (!launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))) launch(Intent(Settings.ACTION_SETTINGS))
  }

  override fun getActiveNotifications(promise: Promise) {
    val listener = RoosterNotificationListener.instance
    if (listener == null) { promise.resolve("[]"); return }
    try {
      val pm = ctx.packageManager
      val out = JSONArray()
      val list = listener.activeNotifications ?: emptyArray()
      for (sbn in list.sortedByDescending { it.postTime }) {
        if (sbn.isOngoing || sbn.packageName == ctx.packageName) continue
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
          ?.toString() ?: ""
        if (title.isBlank() && text.isBlank()) continue
        val app = try {
          pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
        } catch (_: Exception) { sbn.packageName }
        out.put(
          JSONObject().put("packageName", sbn.packageName).put("app", app)
            .put("title", title).put("text", text.take(500)).put("postTime", sbn.postTime),
        )
      }
      promise.resolve(out.toString())
    } catch (e: Exception) {
      promise.reject("notifications_failed", e.message ?: "Could not read notifications", e)
    }
  }

  override fun watchReplies(name: String, minutes: Double, locale: String, template: String) {
    ReplyWatcher.watch(ctx, name, minutes.toInt().coerceIn(1, 240), locale, template)
  }

  // ------------------------------------------------------------ clock app (alarms, timers)

  /** days: comma-separated java.util.Calendar days (1 = Sunday) for a repeating alarm, "" for once. */
  override fun setAlarm(hour: Double, minute: Double, label: String, days: String, promise: Promise) {
    val i = Intent(AlarmClock.ACTION_SET_ALARM)
      .putExtra(AlarmClock.EXTRA_HOUR, hour.toInt())
      .putExtra(AlarmClock.EXTRA_MINUTES, minute.toInt())
      .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
    if (label.isNotBlank()) i.putExtra(AlarmClock.EXTRA_MESSAGE, label.take(60))
    val dayList = days.split(',').mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..7 }
    if (dayList.isNotEmpty()) i.putExtra(AlarmClock.EXTRA_DAYS, ArrayList(dayList))
    promise.resolve(launch(i))
  }

  override fun setTimer(seconds: Double, label: String, promise: Promise) {
    val i = Intent(AlarmClock.ACTION_SET_TIMER)
      .putExtra(AlarmClock.EXTRA_LENGTH, seconds.toInt().coerceIn(1, 86_400))
      .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
    if (label.isNotBlank()) i.putExtra(AlarmClock.EXTRA_MESSAGE, label.take(60))
    promise.resolve(launch(i))
  }

  // ------------------------------------------------------------ media apps, search, maps

  /**
   * Asks a media app (YouTube, YouTube Music, Spotify...) to find and START PLAYING the query,
   * like Google Assistant does. Resolves false if that app does not support play-from-search.
   */
  override fun playFromSearch(packageName: String, query: String, promise: Promise) {
    val i = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
      .setPackage(packageName)
      .putExtra(SearchManager.QUERY, query)
      .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
    if (i.resolveActivity(ctx.packageManager) == null) { promise.resolve(false); return }
    promise.resolve(launch(i))
  }

  /** Opens a link (search page, maps, store), in `packageName` when given and installed, else any app. */
  override fun openUrl(url: String, packageName: String, promise: Promise) {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    if (packageName.isNotBlank()) {
      val inApp = Intent(i).setPackage(packageName)
      if (inApp.resolveActivity(ctx.packageManager) != null && launch(inApp)) { promise.resolve(true); return }
    }
    promise.resolve(launch(i))
  }

  /** Google search in the Google app, falling back to the browser. */
  override fun webSearch(query: String, promise: Promise) {
    val g = Intent(Intent.ACTION_WEB_SEARCH).setPackage("com.google.android.googlequicksearchbox")
      .putExtra(SearchManager.QUERY, query)
    if (g.resolveActivity(ctx.packageManager) != null && launch(g)) { promise.resolve(true); return }
    val url = "https://www.google.com/search?q=" + Uri.encode(query)
    promise.resolve(launch(Intent(Intent.ACTION_VIEW, Uri.parse(url))))
  }

  // ------------------------------------------------------------ playback, volume, torch

  /** play | pause | toggle | next | previous | stop — sent to whichever app is playing. */
  override fun mediaControl(action: String) {
    val code = when (action) {
      "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
      "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
      "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
      "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
      "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
      else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
    }
    val am = ctx.getSystemService(AudioManager::class.java)
    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
  }

  /** up | down | mute | unmute | max for media volume. Resolves the new volume in percent. */
  override fun adjustVolume(action: String, promise: Promise) {
    try {
      val am = ctx.getSystemService(AudioManager::class.java)
      val s = AudioManager.STREAM_MUSIC
      val ui = AudioManager.FLAG_SHOW_UI
      when (action) {
        "up" -> repeat(2) { am.adjustStreamVolume(s, AudioManager.ADJUST_RAISE, ui) }
        "down" -> repeat(2) { am.adjustStreamVolume(s, AudioManager.ADJUST_LOWER, ui) }
        "mute" -> am.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, ui)
        "unmute" -> am.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, ui)
        "max" -> am.setStreamVolume(s, am.getStreamMaxVolume(s), ui)
      }
      val max = am.getStreamMaxVolume(s).coerceAtLeast(1)
      promise.resolve(Math.round(am.getStreamVolume(s) * 100.0 / max).toDouble())
    } catch (e: Exception) {
      promise.reject("volume_failed", e.message ?: "Could not change volume", e)
    }
  }

  /** Torch on/off. Needs no permission. Resolves false if the phone has no flash. */
  override fun setFlashlight(on: Boolean, promise: Promise) {
    try {
      val cm = ctx.getSystemService(CameraManager::class.java)
      val id = cm.cameraIdList.firstOrNull {
        cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      }
      if (id == null) { promise.resolve(false); return }
      cm.setTorchMode(id, on)
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  // ------------------------------------------------------------ phone's notes app

  /** JSON [{ label, packageName, preferred }]: apps that accept shared text and look like notes apps. */
  override fun getNotesApps(promise: Promise) {
    try {
      val pm = ctx.packageManager
      val preferred = ctx.getSharedPreferences(NOTES_PREFS, Context.MODE_PRIVATE).getString(KEY_NOTES_APP, null)
      val send = Intent(Intent.ACTION_SEND).setType("text/plain")
      val out = JSONArray()
      val seen = HashSet<String>()
      for (ri in pm.queryIntentActivities(send, 0)) {
        val pkg = ri.activityInfo.packageName
        if (pkg == ctx.packageName || !seen.add(pkg)) continue
        val label = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
        if (!looksLikeNotesApp(pkg, label)) continue
        out.put(JSONObject().put("label", label).put("packageName", pkg).put("preferred", pkg == preferred))
      }
      promise.resolve(out.toString())
    } catch (e: Exception) {
      promise.reject("notes_apps_failed", e.message ?: "Could not list notes apps", e)
    }
  }

  /** Shares the note text into that notes app (the app shows it to save) and remembers the choice. */
  override fun saveToNotesApp(packageName: String, text: String, promise: Promise) {
    val title = text.lineSequence().first().take(40)
    val i = Intent(Intent.ACTION_SEND).setType("text/plain").setPackage(packageName)
      .putExtra(Intent.EXTRA_TEXT, text)
      .putExtra(Intent.EXTRA_SUBJECT, title)
      .putExtra(Intent.EXTRA_TITLE, title)
    val ok = launch(i)
    if (ok) ctx.getSharedPreferences(NOTES_PREFS, Context.MODE_PRIVATE).edit().putString(KEY_NOTES_APP, packageName).apply()
    promise.resolve(ok)
  }

  private fun looksLikeNotesApp(pkg: String, label: String): Boolean {
    if (pkg in KNOWN_NOTES_APPS) return true
    val l = label.lowercase()
    return Regex("""\b(notes?|notepad|memo|keep)\b""").containsMatchIn(l) || pkg.endsWith(".note") || pkg.endsWith(".notes")
  }

  // ------------------------------------------------------------ location (SOS only)

  override fun getCurrentLocation(timeoutMs: Double, promise: Promise) {
    if (!granted(Manifest.permission.ACCESS_FINE_LOCATION) && !granted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
      promise.reject("permission", "Location permission not granted"); return
    }
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    if (!LocationManagerCompat.isLocationEnabled(lm)) {
      promise.reject("disabled", "Location is turned off"); return
    }
    val provider = when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && lm.allProviders.contains(LocationManager.FUSED_PROVIDER) ->
        LocationManager.FUSED_PROVIDER
      lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> LocationManager.GPS_PROVIDER
    }
    val signal = CancellationSignal()
    var done = false
    val handler = android.os.Handler(android.os.Looper.getMainLooper())

    fun finish(loc: Location?) {
      if (done) return
      done = true
      val result = loc ?: try {
        lm.getProviders(true).mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time }
      } catch (_: SecurityException) { null }
      if (result == null) promise.reject("unavailable", "Could not get location")
      else promise.resolve(
        JSONObject().put("latitude", result.latitude).put("longitude", result.longitude)
          .put("accuracy", result.accuracy.toDouble()).toString(),
      )
    }

    handler.postDelayed({ signal.cancel(); finish(null) }, timeoutMs.toLong().coerceIn(2000, 30000))
    try {
      LocationManagerCompat.getCurrentLocation(lm, provider, signal, ContextCompat.getMainExecutor(ctx)) { finish(it) }
    } catch (_: SecurityException) {
      finish(null)
    }
  }

  // ------------------------------------------------------------ clipboard

  override fun copyToClipboard(text: String) {
    val cm = ctx.getSystemService(ClipboardManager::class.java)
    cm.setPrimaryClip(ClipData.newPlainText("ROOSTER", text))
  }

  override fun invalidate() {
    io.shutdown()
    super.invalidate()
  }
}
