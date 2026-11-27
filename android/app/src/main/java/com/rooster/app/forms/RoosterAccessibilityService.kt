package com.rooster.app.forms

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * Voice form filling: when the user says "fill this form", ROOSTER fills the empty fields it
 * recognises in the app on screen. It does not watch the screen otherwise (events are ignored),
 * never presses submit, and never fills passwords, OTPs or other secrets (see [FormProfile]).
 */
class RoosterAccessibilityService : AccessibilityService() {

  companion object {
    @Volatile var instance: RoosterAccessibilityService? = null
      private set
  }

  override fun onServiceConnected() { instance = this }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
  override fun onInterrupt() {}
  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  /** Package of the app currently in front, or null. */
  fun activePackage(): String? = rootInActiveWindow?.packageName?.toString()

  /** JSON { app, filled: [{ key, label }], skipped } or { error }. */
  fun fillActiveForm(profile: Map<String, String>): JSONObject {
    val root = rootInActiveWindow ?: return JSONObject().put("error", "no_window")
    val app = root.packageName?.toString().orEmpty()
    if (app == packageName) return JSONObject().put("error", "rooster_in_front")
    val filled = JSONArray()
    var skipped = 0
    val lastLabel = arrayOf<String?>(null)
    fun walk(node: AccessibilityNodeInfo?) {
      if (node == null) return
      if (node.isEditable && node.isVisibleToUser) {
        val showingHint = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && node.isShowingHintText
        val current = if (showingHint) "" else node.text?.toString().orEmpty()
        val hint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) node.hintText?.toString() else null
        val labels = listOf(
          hint, if (showingHint) node.text?.toString() else null, node.contentDescription?.toString(),
          node.viewIdResourceName?.substringAfter(":id/"), node.labeledBy?.text?.toString(), lastLabel[0],
        )
        val key = if (node.isPassword) null else FormProfile.classify(labels, emptyList(), node.inputType)
        val value = FormProfile.value(profile, key)
        if (value != null && current.isBlank()) {
          val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
          }
          if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
            filled.put(JSONObject().put("key", key).put("label", (hint ?: lastLabel[0] ?: key.orEmpty()).take(40)))
          } else skipped++
        } else skipped++
        lastLabel[0] = null // a label belongs to one field only
      } else {
        node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() && it.length < 80 }?.let { lastLabel[0] = it }
      }
      for (i in 0 until node.childCount) walk(node.getChild(i))
    }
    walk(root)
    return JSONObject().put("app", app).put("filled", filled).put("skipped", skipped)
  }
}
