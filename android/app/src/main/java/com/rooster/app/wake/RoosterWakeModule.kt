package com.rooster.app.wake

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.rooster.app.specs.NativeRoosterWakeSpec

class RoosterWakeModule(private val ctx: ReactApplicationContext) : NativeRoosterWakeSpec(ctx) {

  companion object {
    const val NAME = "RoosterWake"
    const val PREFS = "rooster_native_prefs"
    const val KEY_SPEAK_REMINDERS = "speak_reminders"

    fun speakReminders(c: Context): Boolean =
      c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SPEAK_REMINDERS, true)
  }

  override fun getName() = NAME

  override fun start(mode: String, promise: Promise) {
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(false); return
    }
    try {
      WakeWordService.send(ctx, WakeWordService.ACTION_START, if (mode == "always") "always" else "screen_on")
      promise.resolve(true)
    } catch (e: Exception) {
      // Android only allows starting a microphone service while ROOSTER is on screen.
      promise.resolve(false)
    }
  }

  override fun stop() {
    if (WakeWordService.status != "off") WakeWordService.send(ctx, WakeWordService.ACTION_STOP)
  }

  override fun pause() {
    if (WakeWordService.status != "off") WakeWordService.send(ctx, WakeWordService.ACTION_PAUSE)
  }

  override fun resume() {
    if (WakeWordService.status != "off") WakeWordService.send(ctx, WakeWordService.ACTION_RESUME)
  }

  override fun getStatus(promise: Promise) = promise.resolve(WakeWordService.status)

  override fun canDrawOverlays(promise: Promise) =
    promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx))

  override fun openOverlaySettings() {
    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try { ctx.startActivity(intent) } catch (_: Exception) {
      ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  override fun moveToBack() {
    ctx.currentActivity?.runOnUiThread { ctx.currentActivity?.moveTaskToBack(true) }
  }

  override fun setSpeakReminders(enabled: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SPEAK_REMINDERS, enabled).apply()
  }
}
