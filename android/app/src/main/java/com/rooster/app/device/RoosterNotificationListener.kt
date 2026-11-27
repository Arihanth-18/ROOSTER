package com.rooster.app.device

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Only active if the user explicitly enables ROOSTER under Settings → Notification access.
 * We do not store notifications; the app reads the current list on request, and WhatsApp
 * replies are read aloud only from someone the user just messaged (see [ReplyWatcher]).
 */
class RoosterNotificationListener : NotificationListenerService() {
  companion object {
    @Volatile var instance: RoosterNotificationListener? = null
      private set
  }

  override fun onListenerConnected() {
    instance = this
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try { ReplyWatcher.onPosted(this, sbn) } catch (_: Exception) { }
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }
}
