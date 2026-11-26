package com.rooster.app.device

import android.Manifest
import android.app.Notification
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
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

  companion object { const val NAME = "RoosterDevice" }

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
