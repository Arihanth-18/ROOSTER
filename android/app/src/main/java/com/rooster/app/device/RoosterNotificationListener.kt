package com.rooster.app.device

import android.service.notification.NotificationListenerService

/**
 * Only active if the user explicitly enables ROOSTER under Settings → Notification access.
 * We do not store notifications; the app reads the current list on request.
 */
class RoosterNotificationListener : NotificationListenerService() {
  companion object {
    @Volatile var instance: RoosterNotificationListener? = null
      private set
  }

  override fun onListenerConnected() {
    instance = this
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }
}
