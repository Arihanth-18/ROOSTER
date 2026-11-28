package com.rooster.app.wake

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.rooster.app.MainActivity
import com.rooster.app.R
import com.rooster.app.reminders.ReminderNotifier
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import com.rooster.app.speech.VoskModels

/**
 * Listens on-device (Vosk, no network) for "Hey ROOSTER" / "OK ROOSTER".
 *
 * Battery: the recogniser only decodes a tiny grammar, and it is fully stopped (mic released)
 * when the screen is off (in "screen_on" mode), in battery saver, below 15% battery while not
 * charging, and while ROOSTER's own speech recognition is using the microphone.
 */
class WakeWordService : Service() {

  companion object {
    const val TAG = "RoosterWake"
    const val ACTION_START = "com.rooster.app.wake.START"
    const val ACTION_STOP = "com.rooster.app.wake.STOP"
    const val ACTION_PAUSE = "com.rooster.app.wake.PAUSE"
    const val ACTION_RESUME = "com.rooster.app.wake.RESUME"
    const val EXTRA_MODE = "mode"
    private const val CHANNEL_ID = "rooster_wake_v1"
    private const val NOTIFICATION_ID = 7301
    private const val SAMPLE_RATE = 16000f
    /** Words the recogniser may output. Anything else becomes [unk], which keeps false triggers low. */
    private const val GRAMMAR = """["hey rooster", "ok rooster", "okay rooster", "hi rooster", "rooster", "[unk]"]"""
    /** After a wake, wait for the app to call resume(); resume on our own after this as a safety net. */
    private const val AUTO_RESUME_MS = 90_000L
    private val LEAD_WORDS = setOf("hey", "ok", "okay", "hi")
    private const val MIN_CONF = 0.75

    @Volatile var status: String = "off"
      private set

    fun send(ctx: Context, action: String, mode: String? = null) {
      val i = Intent(ctx, WakeWordService::class.java).setAction(action)
      if (mode != null) i.putExtra(EXTRA_MODE, mode)
      if (action == ACTION_START) ContextCompat.startForegroundService(ctx, i) else ctx.startService(i)
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private var model: Model? = null
  private var speech: SpeechService? = null
  private var mode = "screen_on"
  private var pausedByApp = false
  private var lastWake = 0L

  // ------------------------------------------------------------------ lifecycle

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> { stopEverything(); return START_NOT_STICKY }
      ACTION_PAUSE -> { pausedByApp = true; main.removeCallbacks(autoResume); evaluate() }
      ACTION_RESUME -> { pausedByApp = false; main.removeCallbacks(autoResume); evaluate() }
      else -> {
        mode = intent?.getStringExtra(EXTRA_MODE) ?: mode
        goForeground()
        registerReceivers()
        loadModel()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopEverything()
    super.onDestroy()
  }

  private fun stopEverything() {
    main.removeCallbacksAndMessages(null)
    stopRecognition()
    try { unregisterReceiver(conditions) } catch (_: Exception) { }
    model = null // shared (VoskModels): offline voice commands may still use it, so don't close it
    status = "off"
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // ------------------------------------------------------------------ notification

  private fun goForeground() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while ROOSTER listens for \"Hey ROOSTER\""
          setShowBadge(false)
        },
      )
    }
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(
      this, 1, Intent(this, WakeWordService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
    )
    val n: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("ROOSTER is listening for \"Hey ROOSTER\"")
      .setContentText("Audio stays on this phone. Tap to open.")
      .setOngoing(true)
      .setContentIntent(open)
      .addAction(0, "Turn off", stop)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
  }

  // ------------------------------------------------------------------ model

  private fun loadModel() {
    if (model != null) { evaluate(); return }
    status = "loading"
    // Shared with offline voice commands; copied from assets to app storage once.
    VoskModels.load(this, "model-en-in") { m ->
      if (m == null) {
        Log.e(TAG, "Model load failed")
        status = "error"
      } else {
        model = m
        evaluate()
      }
    }
  }

  // ------------------------------------------------------------------ battery-aware on/off

  private val conditions = object : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) = evaluate()
  }

  private fun registerReceivers() {
    val f = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
      addAction(Intent.ACTION_BATTERY_LOW)
      addAction(Intent.ACTION_BATTERY_OKAY)
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
    }
    try { unregisterReceiver(conditions) } catch (_: Exception) { }
    ContextCompat.registerReceiver(this, conditions, f, ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  private fun shouldListen(): Boolean {
    if (model == null || pausedByApp) return false
    val pm = getSystemService(PowerManager::class.java)
    if (mode == "screen_on" && !pm.isInteractive) return false
    if (pm.isPowerSaveMode) return false
    val bm = getSystemService(BatteryManager::class.java)
    val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    if (level in 0..14 && !bm.isCharging) return false
    return true
  }

  private fun evaluate() {
    main.post {
      if (shouldListen()) startRecognition() else stopRecognition()
      status = when {
        model == null -> if (status == "error") "error" else "loading"
        speech != null -> "listening"
        else -> "paused"
      }
    }
  }

  // ------------------------------------------------------------------ recognition

  private fun startRecognition() {
    if (speech != null) return
    val m = model ?: return
    try {
      val rec = Recognizer(m, SAMPLE_RATE, GRAMMAR)
      rec.setWords(true) // per-word confidence, used to reject weak matches
      speech = SpeechService(rec, SAMPLE_RATE).also { it.startListening(listener) }
    } catch (e: Exception) {
      Log.e(TAG, "Could not start listening: ${e.message}")
      speech = null
    }
  }

  private fun stopRecognition() {
    speech?.let {
      try { it.stop(); it.shutdown() } catch (_: Exception) { }
    }
    speech = null
  }

  private val listener = object : RecognitionListener {
    // Partials have no confidence scores, so only finished utterances can wake ROOSTER.
    override fun onPartialResult(hypothesis: String?) {}
    override fun onResult(hypothesis: String?) = check(hypothesis)
    override fun onFinalResult(hypothesis: String?) = check(hypothesis)
    override fun onError(e: Exception?) {
      Log.e(TAG, "Recognition error: ${e?.message}")
      stopRecognition()
      main.postDelayed({ evaluate() }, 3000)
    }
    override fun onTimeout() = evaluate()
  }

  /**
   * Wake only on "<hey|ok|okay|hi> rooster" where the recogniser is confident about both words.
   * A lone "rooster" is in the grammar only to absorb near-misses; it never triggers on its own.
   */
  private fun check(json: String?) {
    if (json.isNullOrEmpty()) return
    val obj = try { JSONObject(json) } catch (_: Exception) { return }
    val text = obj.optString("text")
    if (!text.contains("rooster")) return
    val words = obj.optJSONArray("result")
    var accepted = false
    var detail = text
    if (words != null) {
      for (i in 1 until words.length()) {
        val prev = words.getJSONObject(i - 1)
        val cur = words.getJSONObject(i)
        if (cur.optString("word") == "rooster" && prev.optString("word") in LEAD_WORDS) {
          val c1 = prev.optDouble("conf", 0.0)
          val c2 = cur.optDouble("conf", 0.0)
          detail = "$text (conf ${"%.2f".format(c1)}, ${"%.2f".format(c2)})"
          if (c1 >= MIN_CONF && c2 >= MIN_CONF) accepted = true
        }
      }
    }
    if (!accepted) {
      Log.i(TAG, "Rejected: $detail")
      return
    }
    val now = System.currentTimeMillis()
    if (now - lastWake < 3000) return
    lastWake = now
    Log.i(TAG, "Wake word detected: $detail")
    onWake()
  }

  private fun onWake() {
    // Free the microphone immediately so ROOSTER's full speech recognition can use it.
    pausedByApp = true
    stopRecognition()
    status = "paused"
    main.postDelayed(autoResume, AUTO_RESUME_MS)
    val intent = Intent(this, MainActivity::class.java)
      .setAction(Intent.ACTION_VIEW)
      .setData(Uri.parse("rooster://wake?t=${System.currentTimeMillis()}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    val overlayOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    if (MainActivity.isVisible) {
      startActivity(intent)
      return
    }
    if (overlayOk) {
      // Newer Android / OEM builds only let overlay apps open an activity from the background while
      // one of their overlay windows is visible, so show an invisible 1px overlay for the launch.
      val anchor = addLaunchAnchor()
      main.postDelayed({
        try { startActivity(intent) } catch (e: Exception) { Log.w(TAG, "Activity start failed: ${e.message}") }
      }, 60)
      main.postDelayed({ removeLaunchAnchor(anchor) }, 2500)
    }
    // Android blocks background starts silently, so verify the pop-up really appeared.
    main.postDelayed({
      if (!MainActivity.isVisible) {
        Log.w(TAG, "Pop-up did not appear (blocked by the system); showing tap-to-talk notification")
        postTapToTalk(intent)
      }
    }, if (overlayOk) 1500L else 0L)
  }

  private fun addLaunchAnchor(): View? = try {
    val wm = getSystemService(WindowManager::class.java)
    val v = View(this)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
               else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val lp = WindowManager.LayoutParams(
      1, 1, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }
    wm.addView(v, lp)
    v
  } catch (e: Exception) {
    Log.w(TAG, "Overlay anchor failed: ${e.message}")
    null
  }

  private fun removeLaunchAnchor(v: View?) {
    if (v == null) return
    try { getSystemService(WindowManager::class.java).removeView(v) } catch (_: Exception) { }
  }

  /** Fallback when ROOSTER may not open itself: a heads-up notification the user can tap. */
  private fun postTapToTalk(intent: Intent) {
    val pi = PendingIntent.getActivity(this, 2, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    ReminderNotifier.ensureChannel(this)
    val n = NotificationCompat.Builder(this, ReminderNotifier.CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("ROOSTER heard you")
      .setContentText("Tap to talk")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .build()
    try { getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID + 1, n) } catch (_: SecurityException) { }
    main.postDelayed({ pausedByApp = false; evaluate() }, 8000)
  }

  private val autoResume = Runnable {
    pausedByApp = false
    evaluate()
  }
}
