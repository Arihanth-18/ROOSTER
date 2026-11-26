package com.rooster.app.device

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/**
 * Places calls and sends SMS directly. Only invoked by the app AFTER the user has said or tapped "yes".
 * Every result is verified (call intent accepted / SMS radio result) before the app reports success.
 */
object DirectComms {

  private val requestSeq = AtomicInteger(1)

  private fun granted(ctx: Context, permission: String) =
    ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED

  /** Returns "calling" if the call was started, "no_permission" or "failed" otherwise. */
  fun placeCall(ctx: Context, activity: Activity?, phone: String): String {
    if (!granted(ctx, Manifest.permission.CALL_PHONE)) return "no_permission"
    return try {
      val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(phone)))
      if (activity != null) activity.startActivity(intent)
      else ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      "calling"
    } catch (_: Exception) {
      "failed"
    }
  }

  private fun smsManager(ctx: Context): SmsManager {
    val subId = SmsManager.getDefaultSmsSubscriptionId()
    val base: SmsManager =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) ctx.getSystemService(SmsManager::class.java)
      else @Suppress("DEPRECATION") SmsManager.getDefault()
    return if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) base.createForSubscriptionId(subId) else base
  }

  /**
   * Sends [body] to each number and waits for the radio's "sent" result for every part.
   * Calls [done] with JSON { sent, failed, total, error? } on the main thread.
   */
  fun sendSms(ctx: Context, phones: List<String>, body: String, done: (String) -> Unit) {
    if (!granted(ctx, Manifest.permission.SEND_SMS)) {
      done(JSONObject().put("sent", 0).put("failed", phones.size).put("total", phones.size).put("error", "no_permission").toString())
      return
    }
    val manager = try {
      smsManager(ctx)
    } catch (e: Exception) {
      done(JSONObject().put("sent", 0).put("failed", phones.size).put("total", phones.size).put("error", "no_sms_service").toString())
      return
    }

    val action = "com.rooster.app.SMS_SENT." + requestSeq.getAndIncrement()
    val handler = Handler(Looper.getMainLooper())
    val parts = manager.divideMessage(body)
    val expected = phones.size * parts.size
    // A recipient counts as sent only when the radio confirmed every part of their message.
    val okParts = IntArray(phones.size)
    var received = 0
    var finished = false

    lateinit var receiver: BroadcastReceiver
    fun finish(error: String? = null) {
      if (finished) return
      finished = true
      try { ctx.unregisterReceiver(receiver) } catch (_: Exception) { }
      val sent = okParts.count { it == parts.size }
      val out = JSONObject().put("sent", sent).put("failed", phones.size - sent).put("total", phones.size)
      // Parts that never reported back are counted as failed — never claim an unverified send.
      val err = error ?: if (received < expected) "timeout" else null
      if (err != null) out.put("error", err)
      done(out.toString())
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        val recipient = intent.getIntExtra("recipient", -1)
        if (resultCode == Activity.RESULT_OK && recipient in okParts.indices) okParts[recipient] += 1
        received += 1
        if (received >= expected) handler.post { finish() }
      }
    }
    ContextCompat.registerReceiver(ctx, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
    handler.postDelayed({ finish() }, 30_000)

    try {
      phones.forEachIndexed { i, phone ->
        val sentIntents = ArrayList<PendingIntent>()
        for (p in parts.indices) {
          val intent = Intent(action).setPackage(ctx.packageName).putExtra("recipient", i)
          sentIntents.add(
            PendingIntent.getBroadcast(ctx, requestSeq.getAndIncrement(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT),
          )
        }
        if (parts.size == 1) manager.sendTextMessage(phone, null, body, sentIntents[0], null)
        else manager.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
      }
    } catch (e: Exception) {
      handler.post { finish("send_failed") }
    }
  }
}
