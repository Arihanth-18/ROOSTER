package com.rooster.app.speech

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.vosk.Model
import org.vosk.android.StorageService

/**
 * On-device Vosk speech models, bundled in the APK and shared by the "Hey ROOSTER" wake word and
 * offline voice commands, so each model is unpacked and loaded into memory only once.
 */
object VoskModels {
  /** ROOSTER language → bundled model folder in assets. English (India) ships with the app. */
  private val ASSETS = mapOf("en" to "model-en-in", "hi" to "model-hi")
  /** Where each model is unpacked (the English one keeps the folder the wake word already used). */
  private val TARGETS = mapOf("model-en-in" to "model", "model-hi" to "model-hi")

  private val main = Handler(Looper.getMainLooper())
  private val loaded = HashMap<String, Model>()
  private val waiting = HashMap<String, MutableList<(Model?) -> Unit>>()

  /** Asset folder for a locale such as "en-IN", or null if no offline model is bundled for it. */
  fun assetFor(ctx: Context, locale: String): String? {
    val asset = ASSETS[locale.substringBefore('-').lowercase()] ?: return null
    return if (ctx.assets.list("")?.contains(asset) == true) asset else null
  }

  /** Loads (once) and returns the model on the main thread; null if it could not be loaded. */
  fun load(ctx: Context, asset: String, done: (Model?) -> Unit) {
    main.post {
      loaded[asset]?.let { done(it); return@post }
      val queue = waiting.getOrPut(asset) { mutableListOf() }
      queue.add(done)
      if (queue.size > 1) return@post // already loading
      StorageService.unpack(
        ctx.applicationContext, asset, TARGETS[asset] ?: asset,
        { m ->
          main.post {
            loaded[asset] = m
            waiting.remove(asset)?.forEach { it(m) }
          }
        },
        { _ ->
          main.post { waiting.remove(asset)?.forEach { it(null) } }
        },
      )
    }
  }
}
