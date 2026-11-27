package com.rooster.app.device

import android.app.Notification
import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.service.notification.StatusBarNotification
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Reads WhatsApp replies aloud, but only from a person the user just messaged through ROOSTER,
 * and only for a limited time afterwards. Needs Notification access (granted by the user).
 * Nothing is stored except the watched name, its expiry and the time of the last reply read.
 */
object ReplyWatcher {
  private const val TAG = "RoosterReplies"
  private const val PREFS = "rooster_replies"
  private const val KEY = "watches"
  private val WHATSAPP = setOf("com.whatsapp", "com.whatsapp.w4b")
  private const val MAX_CHARS = 300

  /** template uses {name} and {message}; locale is a BCP-47 tag such as "hi-IN". */
  fun watch(ctx: Context, name: String, minutes: Int, locale: String, template: String) {
    val now = System.currentTimeMillis()
    val key = norm(name)
    if (key.isEmpty()) return
    val list = load(ctx).filter { it.optLong("until") > now && it.optString("key") != key }.toMutableList()
    list.add(
      JSONObject()
        .put("key", key).put("name", name)
        .put("until", now + minutes * 60_000L)
        .put("since", now)
        .put("locale", locale).put("template", template),
    )
    save(ctx, list)
  }

  fun onPosted(ctx: Context, sbn: StatusBarNotification) {
    if (sbn.packageName !in WHATSAPP) return
    val n = sbn.notification
    if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    val now = System.currentTimeMillis()
    val watches = load(ctx).filter { it.optLong("until") > now }
    if (watches.isEmpty()) return

    val incoming = extract(n) // (sender, text, timestamp)
    if (incoming.isEmpty()) return

    var changed = false
    val toSpeak = mutableListOf<Pair<String, String>>() // locale to sentence
    for (w in watches) {
      val key = w.optString("key")
      val since = w.optLong("since")
      val fresh = incoming.filter { norm(it.first) == key && it.third > since }
      if (fresh.isEmpty()) continue
      val text = fresh.joinToString(". ") { it.second }.take(MAX_CHARS)
      val sentence = w.optString("template")
        .replace("{name}", w.optString("name"))
        .replace("{message}", text)
      toSpeak.add(w.optString("locale") to sentence)
      w.put("since", fresh.maxOf { it.third })
      changed = true
    }
    if (!changed) return
    save(ctx, watches) // also drops expired watches
    toSpeak.forEach { (locale, sentence) -> Speaker.say(ctx.applicationContext, sentence, locale) }
  }

  /** One-to-one WhatsApp messages as (sender, text, timestamp). Group chats are ignored. */
  private fun extract(n: Notification): List<Triple<String, String, Long>> {
    val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
    if (style != null) {
      if (style.isGroupConversation) return emptyList()
      return style.messages.mapNotNull { m ->
        val sender = m.person?.name?.toString() ?: return@mapNotNull null
        val text = m.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) null else Triple(sender, text, m.timestamp)
      }
    }
    val extras = n.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: return emptyList()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    if (text.isEmpty()) return emptyList()
    return listOf(Triple(title, text, n.`when`))
  }

  private fun norm(s: String) = s.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")

  private fun load(ctx: Context): List<JSONObject> = try {
    val arr = JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"))
    (0 until arr.length()).map { arr.getJSONObject(it) }
  } catch (_: Exception) { emptyList() }

  private fun save(ctx: Context, list: List<JSONObject>) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, JSONArray(list).toString()).apply()
  }

  /** Short-lived text-to-speech: started for one reply, shut down when done (or after 30 s). */
  private object Speaker {
    private val main = Handler(Looper.getMainLooper())

    fun say(ctx: Context, text: String, locale: String) {
      main.post {
        var tts: TextToSpeech? = null
        var finished = false
        val finish = {
          if (!finished) {
            finished = true
            try { tts?.shutdown() } catch (_: Exception) { }
          }
        }
        main.postDelayed({ finish() }, 30_000)
        tts = TextToSpeech(ctx) { status ->
          main.post {
            val t = tts
            if (status != TextToSpeech.SUCCESS || t == null) { Log.w(TAG, "TTS unavailable"); finish(); return@post }
            val loc = Locale.forLanguageTag(locale)
            t.language = if (t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE) loc else Locale.forLanguageTag("en-IN")
            t.setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            )
            t.setSpeechRate(0.9f)
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
              override fun onStart(utteranceId: String?) {}
              override fun onDone(utteranceId: String?) { main.post { finish() } }
              @Deprecated("Deprecated in Java")
              override fun onError(utteranceId: String?) { main.post { finish() } }
            })
            t.speak(text, TextToSpeech.QUEUE_ADD, null, "reply")
          }
        }
      }
    }
  }
}
