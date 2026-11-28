package com.rooster.app.speech

import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.rooster.app.specs.NativeRoosterSpeechSpec
import java.util.Locale

class RoosterSpeechModule(private val ctx: ReactApplicationContext) : NativeRoosterSpeechSpec(ctx) {

  companion object {
    const val NAME = "RoosterSpeech"
    private const val GOOGLE_TTS = "com.google.android.tts"
  }

  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null

  private var tts: TextToSpeech? = null
  private var ttsState = TtsState.NOT_STARTED
  private val pendingTts = mutableListOf<(TextToSpeech?) -> Unit>()

  private enum class TtsState { NOT_STARTED, INITIALISING, READY, FAILED }

  override fun getName() = NAME

  // ---------------------------------------------------------------- events

  private fun emit(event: String, vararg pairs: Pair<String, String>) {
    val map = Arguments.createMap()
    pairs.forEach { (k, v) -> map.putString(k, v) }
    ctx.emitDeviceEvent(event, map)
  }

  // ---------------------------------------------------------------- speech recognition

  override fun isRecognitionAvailable(promise: Promise) {
    main.post { promise.resolve(SpeechRecognizer.isRecognitionAvailable(ctx)) }
  }

  override fun startListening(locale: String) {
    main.post {
      recognizer?.destroy()
      recognizer = null
      if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
        emit("RoosterSpeech.error", "code" to "unavailable", "message" to "Speech recognition service not available")
        return@post
      }
      val r = SpeechRecognizer.createSpeechRecognizer(ctx)
      r.setRecognitionListener(listener)
      recognizer = r
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, locale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
        // Older users often pause mid-sentence; ask the engine to wait longer (engines may ignore this).
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
        // No internet: use the phone's downloaded speech pack so voice commands still work offline.
        if (!com.rooster.app.device.DeviceSettings.isOnline(ctx)) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      }
      try {
        r.startListening(intent)
      } catch (e: Exception) {
        emit("RoosterSpeech.error", "code" to "client", "message" to (e.message ?: "Could not start listening"))
      }
    }
  }

  override fun stopListening() {
    main.post { recognizer?.stopListening() }
  }

  override fun cancelListening() {
    main.post {
      recognizer?.cancel()
      recognizer?.destroy()
      recognizer = null
    }
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) = emit("RoosterSpeech.state", "state" to "ready")
    override fun onBeginningOfSpeech() = emit("RoosterSpeech.state", "state" to "speech_start")
    override fun onEndOfSpeech() = emit("RoosterSpeech.state", "state" to "speech_end")
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    override fun onPartialResults(partialResults: Bundle?) {
      val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
      if (!text.isNullOrBlank()) emit("RoosterSpeech.partial", "text" to text)
    }

    override fun onResults(results: Bundle?) {
      val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
      if (text.isNullOrBlank()) {
        emit("RoosterSpeech.error", "code" to "no_match", "message" to "No speech recognised")
      } else {
        emit("RoosterSpeech.result", "text" to text)
      }
    }

    override fun onError(error: Int) {
      val code = when (error) {
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
        SpeechRecognizer.ERROR_AUDIO -> "audio"
        SpeechRecognizer.ERROR_SERVER -> "server"
        SpeechRecognizer.ERROR_CLIENT -> "client"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
        SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
        10 -> "busy" // ERROR_TOO_MANY_REQUESTS
        11 -> "server" // ERROR_SERVER_DISCONNECTED
        12 -> "language_not_supported" // ERROR_LANGUAGE_NOT_SUPPORTED (API 31)
        13 -> "language_unavailable" // ERROR_LANGUAGE_UNAVAILABLE (API 31)
        else -> "unknown"
      }
      emit("RoosterSpeech.error", "code" to code, "message" to "Speech error $error")
    }
  }

  // ---------------------------------------------------------------- text to speech

  private fun withTts(block: (TextToSpeech?) -> Unit) {
    main.post {
      when (ttsState) {
        TtsState.READY -> block(tts)
        TtsState.FAILED -> block(null)
        TtsState.INITIALISING -> pendingTts.add(block)
        TtsState.NOT_STARTED -> {
          pendingTts.add(block)
          ttsState = TtsState.INITIALISING
          val engine = try {
            ctx.packageManager.getPackageInfo(GOOGLE_TTS, 0); GOOGLE_TTS
          } catch (e: Exception) { null }
          val onInit = TextToSpeech.OnInitListener { status ->
            main.post {
              ttsState = if (status == TextToSpeech.SUCCESS) TtsState.READY else TtsState.FAILED
              if (ttsState == TtsState.READY) tts?.setOnUtteranceProgressListener(progress)
              val waiting = pendingTts.toList()
              pendingTts.clear()
              waiting.forEach { it(if (ttsState == TtsState.READY) tts else null) }
            }
          }
          tts = if (engine != null) TextToSpeech(ctx, onInit, engine) else TextToSpeech(ctx, onInit)
        }
      }
    }
  }

  private val progress = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String?) = emit("RoosterTts.start", "id" to (utteranceId ?: ""))
    override fun onDone(utteranceId: String?) = emit("RoosterTts.done", "id" to (utteranceId ?: ""))
    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) = emit("RoosterTts.error", "id" to (utteranceId ?: ""))
    override fun onStop(utteranceId: String?, interrupted: Boolean) =
      emit("RoosterTts.done", "id" to (utteranceId ?: ""))
  }

  private fun languageStatus(t: TextToSpeech, locale: Locale): String =
    when (t.isLanguageAvailable(locale)) {
      TextToSpeech.LANG_MISSING_DATA -> "missing_data"
      TextToSpeech.LANG_NOT_SUPPORTED -> "not_supported"
      else -> "available"
    }

  override fun speak(text: String, locale: String, rate: Double, volume: Double, utteranceId: String, promise: Promise) {
    withTts { t ->
      if (t == null) { promise.resolve("tts_unavailable"); return@withTts }
      val loc = Locale.forLanguageTag(locale)
      when (languageStatus(t, loc)) {
        "missing_data" -> { promise.resolve("lang_missing_data"); return@withTts }
        "not_supported" -> { promise.resolve("lang_not_supported"); return@withTts }
      }
      t.language = loc
      t.setSpeechRate(rate.toFloat().coerceIn(0.3f, 2.0f))
      val params = Bundle().apply {
        putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.toFloat().coerceIn(0f, 1f))
      }
      t.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
      promise.resolve("started")
    }
  }

  override fun stopSpeaking() {
    main.post { if (ttsState == TtsState.READY) tts?.stop() }
  }

  override fun getTtsLanguageStatus(locale: String, promise: Promise) {
    withTts { t ->
      promise.resolve(if (t == null) "tts_unavailable" else languageStatus(t, Locale.forLanguageTag(locale)))
    }
  }

  private fun startSettings(vararg actions: String) {
    for (action in actions) {
      try {
        ctx.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (_: Exception) { }
    }
  }

  override fun openTtsSettings() = startSettings("com.android.settings.TTS_SETTINGS", Settings.ACTION_SETTINGS)

  override fun openVoiceInputSettings() =
    startSettings(Settings.ACTION_VOICE_INPUT_SETTINGS, "com.android.settings.TTS_SETTINGS", Settings.ACTION_SETTINGS)

  // ---------------------------------------------------------------- audio cues

  override fun playCue(kind: String) {
    val tone = when (kind) {
      "listen" -> ToneGenerator.TONE_PROP_BEEP
      "done" -> ToneGenerator.TONE_PROP_ACK
      else -> ToneGenerator.TONE_PROP_NACK
    }
    try {
      val gen = ToneGenerator(AudioManager.STREAM_MUSIC, 80)
      gen.startTone(tone, 180)
      main.postDelayed({ gen.release() }, 400)
    } catch (_: Exception) { }
  }

  override fun invalidate() {
    main.post {
      recognizer?.destroy()
      recognizer = null
      tts?.shutdown()
      tts = null
      ttsState = TtsState.NOT_STARTED
    }
    super.invalidate()
  }
}
