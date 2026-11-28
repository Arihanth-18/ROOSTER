package com.rooster.app.device

import android.app.NotificationManager
import android.bluetooth.BluetoothManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import org.json.JSONObject

/**
 * Phone settings by voice. Android lets apps change only some settings directly:
 *  - direct (after a one-time permission): brightness and auto-rotate ("Modify system settings"),
 *    silent / vibrate / Do Not Disturb ("Do Not Disturb access");
 *  - everything else (Wi-Fi, mobile data, Bluetooth, airplane mode, location, hotspot...) can only be
 *    opened for the user: a quick panel or the right settings page, where they tap the switch.
 * Reading the current state needs no special permission.
 */
object DeviceSettings {

  // ------------------------------------------------------------------ status (read-only)

  fun status(ctx: Context): JSONObject {
    val out = JSONObject()
    val bm = ctx.getSystemService(BatteryManager::class.java)
    out.put("battery", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
    out.put("charging", bm.isCharging)
    val cm = ctx.getSystemService(ConnectivityManager::class.java)
    val caps = cm.getNetworkCapabilities(cm.activeNetwork)
    out.put(
      "network",
      when {
        caps == null -> "none"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
        else -> "other"
      },
    )
    out.put("online", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
    out.put("wifi", try { ctx.getSystemService(WifiManager::class.java).isWifiEnabled } catch (_: Exception) { false })
    out.put("bluetooth", try { ctx.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled == true } catch (_: Exception) { false })
    out.put("airplane", Settings.Global.getInt(ctx.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1)
    out.put("location", try { ctx.getSystemService(LocationManager::class.java).isLocationEnabled } catch (_: Exception) { false })
    out.put("batterySaver", ctx.getSystemService(PowerManager::class.java).isPowerSaveMode)
    val am = ctx.getSystemService(AudioManager::class.java)
    out.put("ringer", when (am.ringerMode) { AudioManager.RINGER_MODE_SILENT -> "silent"; AudioManager.RINGER_MODE_VIBRATE -> "vibrate"; else -> "normal" })
    val nm = ctx.getSystemService(NotificationManager::class.java)
    out.put("dnd", nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL)
    out.put("brightness", Math.round(Settings.System.getInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128) * 100.0 / 255))
    out.put("autoRotate", Settings.System.getInt(ctx.contentResolver, Settings.System.ACCELEROMETER_ROTATION, 0) == 1)
    return out
  }

  /** True when there is a working internet connection (used to prefer offline speech recognition). */
  fun isOnline(ctx: Context): Boolean {
    val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return false
    return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
  }

  // ------------------------------------------------------------------ direct changes

  fun canWriteSettings(ctx: Context) = Settings.System.canWrite(ctx)
  fun hasDndAccess(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

  /** up | down | max | min | auto. Returns the new brightness in percent, or -1 without permission. */
  fun setBrightness(ctx: Context, action: String): Int {
    if (!canWriteSettings(ctx)) return -1
    val cr = ctx.contentResolver
    if (action == "auto") {
      Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC)
      return Math.round(Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, 128) * 100.0 / 255).toInt()
    }
    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
    val now = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, 128)
    val next = when (action) {
      "max" -> 255
      "min" -> 20 // never fully black: the user must still be able to see the screen
      "up" -> now + 64
      "down" -> now - 64
      else -> now
    }.coerceIn(20, 255)
    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, next)
    return Math.round(next * 100.0 / 255).toInt()
  }

  /** Returns false without permission. */
  fun setAutoRotate(ctx: Context, on: Boolean): Boolean {
    if (!canWriteSettings(ctx)) return false
    return Settings.System.putInt(ctx.contentResolver, Settings.System.ACCELEROMETER_ROTATION, if (on) 1 else 0)
  }

  /** normal | vibrate | silent. "no_permission" when Android needs Do Not Disturb access first. */
  fun setRinger(ctx: Context, mode: String): String {
    val am = ctx.getSystemService(AudioManager::class.java)
    val target = when (mode) { "silent" -> AudioManager.RINGER_MODE_SILENT; "vibrate" -> AudioManager.RINGER_MODE_VIBRATE; else -> AudioManager.RINGER_MODE_NORMAL }
    return try {
      am.ringerMode = target
      if (am.ringerMode == target) "ok" else if (hasDndAccess(ctx)) "failed" else "no_permission"
    } catch (_: SecurityException) {
      "no_permission"
    }
  }

  /** Do Not Disturb (priority only) on/off. "no_permission" without Do Not Disturb access. */
  fun setDnd(ctx: Context, on: Boolean): String {
    if (!hasDndAccess(ctx)) return "no_permission"
    ctx.getSystemService(NotificationManager::class.java).setInterruptionFilter(
      if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY else NotificationManager.INTERRUPTION_FILTER_ALL,
    )
    return "ok"
  }

  // ------------------------------------------------------------------ panels and settings pages

  /**
   * The intent that lets the user flip a setting apps may not change: Android's quick panel where one
   * exists (Wi-Fi, internet/mobile data, NFC), otherwise the right settings page.
   */
  fun intentFor(ctx: Context, page: String): Intent {
    val panel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    return when (page) {
      "wifi" -> Intent(if (panel) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS)
      "mobile_data", "internet" -> Intent(if (panel) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIRELESS_SETTINGS)
      "nfc" -> Intent(if (panel) Settings.Panel.ACTION_NFC else Settings.ACTION_NFC_SETTINGS)
      "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
      "airplane_mode" -> Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS)
      "location" -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
      "hotspot" -> Intent().setComponent(ComponentName("com.android.settings", "com.android.settings.TetherSettings"))
      "battery_saver" -> Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
      "dark_mode", "display" -> Intent(Settings.ACTION_DISPLAY_SETTINGS)
      "sound" -> Intent(Settings.ACTION_SOUND_SETTINGS)
      "do_not_disturb" -> Intent("android.settings.ZEN_MODE_SETTINGS")
      "dnd_access" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
      "write_settings" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${ctx.packageName}"))
      "date" -> Intent(Settings.ACTION_DATE_SETTINGS)
      "language" -> Intent(Settings.ACTION_LOCALE_SETTINGS)
      "storage" -> Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS)
      "apps" -> Intent(Settings.ACTION_APPLICATION_SETTINGS)
      "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      else -> Intent(Settings.ACTION_SETTINGS)
    }
  }

  /** Fallback when a page (e.g. hotspot on some phones) doesn't exist. */
  fun fallbackFor(page: String): Intent = when (page) {
    "hotspot", "mobile_data", "internet" -> Intent(Settings.ACTION_WIRELESS_SETTINGS)
    "do_not_disturb" -> Intent(Settings.ACTION_SOUND_SETTINGS)
    else -> Intent(Settings.ACTION_SETTINGS)
  }
}
