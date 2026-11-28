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

  /**
   * "Read this message": the visible text of the app in front, top to bottom, for the backend to pick
   * out the messages. Typing boxes and password fields are skipped; nothing is stored.
   * JSON { app, lines: [...] } or { error }.
   */
  fun readActiveScreen(): JSONObject {
    val root = rootInActiveWindow ?: return JSONObject().put("error", "no_window")
    val app = root.packageName?.toString().orEmpty()
    if (app == packageName) return JSONObject().put("error", "rooster_in_front")
    val home = packageManager.resolveActivity(
      android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME), 0,
    )?.activityInfo?.packageName
    if (app == home) return JSONObject().put("error", "home_screen")
    // Chat apps put received messages on the left and the user's own on the right: mark each line
    // "L|", "R|" or "C|" so the backend can say who wrote what.
    val screenWidth = resources.displayMetrics.widthPixels.coerceAtLeast(1)
    val bounds = android.graphics.Rect()
    val lines = ArrayList<String>()
    fun walk(node: AccessibilityNodeInfo?) {
      if (node == null || !node.isVisibleToUser) return
      if (!node.isEditable && !node.isPassword) {
        val text = node.text?.toString()?.trim().orEmpty()
        if (text.isNotEmpty()) {
          node.getBoundsInScreen(bounds)
          val left = bounds.left.toFloat() / screenWidth
          val right = bounds.right.toFloat() / screenWidth
          val side = when {
            left > 0.25f && right > 0.9f -> "R"
            left < 0.2f && right < 0.85f -> "L"
            else -> "C"
          }
          val line = "$side|$text"
          if (lines.lastOrNull() != line) lines.add(line)
        }
      }
      for (i in 0 until node.childCount) walk(node.getChild(i))
    }
    walk(root)
    // Newest messages are at the bottom of chat screens: keep the end if the screen is long.
    var total = 0
    val kept = ArrayList<String>()
    for (line in lines.asReversed()) {
      if (total + line.length > 3500) break
      kept.add(0, line)
      total += line.length + 1
    }
    return JSONObject().put("app", app).put("lines", JSONArray(kept))
  }

  /**
   * Flips a switch on the settings page in front, as the user asked by voice. Settings rows are a
   * clickable row holding a title ("Wi-Fi") and a switch: find the title, take its row, read the switch,
   * click the row if needed. If the row has no switch it leads to a sub-page ("Personal hotspot"):
   * open it and look again (once). Confirms an "Are you sure?" pop-up. Never touches anything else.
   * JSON { result: done | already | not_found | failed, pages } — `pages` is how many screens to go back.
   */
  fun toggleSetting(labels: List<String>, wantOn: Boolean): JSONObject {
    val wanted = labels.map(::normLabel).filter { it.isNotEmpty() }.toSet()
    var pages = 1
    for (level in 0..1) {
      val row = waitFor(3000) { findSettingRow(wanted) } ?: return JSONObject().put("result", "not_found").put("pages", pages)
      val sw = findCheckable(row)
      if (sw == null) {
        if (level == 1 || !row.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
          return JSONObject().put("result", "not_found").put("pages", pages)
        }
        pages++
        Thread.sleep(700)
        continue
      }
      if (sw.isChecked == wantOn) return JSONObject().put("result", "already").put("pages", pages)
      val target = if (sw.isClickable) sw else row
      if (!target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return JSONObject().put("result", "failed").put("pages", pages)
      // Wait for the switch to change; confirm a pop-up ("Turn off mobile data?") if one appears.
      val deadline = System.currentTimeMillis() + 3000
      var confirmed = false
      while (System.currentTimeMillis() < deadline) {
        Thread.sleep(250)
        val now = waitFor(300) { findSettingRow(wanted) }?.let(::findCheckable)
        if (now != null && now.isChecked == wantOn) return JSONObject().put("result", "done").put("pages", pages)
        if (!confirmed) confirmed = confirmDialog()
      }
      return JSONObject().put("result", if (confirmed) "done" else "failed").put("pages", pages)
    }
    return JSONObject().put("result", "not_found").put("pages", pages)
  }

  private fun normLabel(s: String) =
    s.lowercase().replace('‑', '-').replace(' ', ' ').replace(Regex("\\s+"), " ").trim()

  private fun <T> waitFor(ms: Long, find: () -> T?): T? {
    val deadline = System.currentTimeMillis() + ms
    while (true) {
      find()?.let { return it }
      if (System.currentTimeMillis() >= deadline) return null
      Thread.sleep(200)
    }
  }

  /** The clickable row whose title exactly matches one of the labels (page headers aren't rows). */
  private fun findSettingRow(wanted: Set<String>): AccessibilityNodeInfo? {
    val root = rootInActiveWindow ?: return null
    if (root.packageName == packageName) return null
    var found: AccessibilityNodeInfo? = null
    fun walk(n: AccessibilityNodeInfo?) {
      if (n == null || found != null) return
      val t = n.text?.toString() ?: n.contentDescription?.toString()
      if (t != null && normLabel(t) in wanted && n.isVisibleToUser) {
        var p: AccessibilityNodeInfo? = n
        var hops = 0
        while (p != null && hops < 5) {
          if (p.isClickable) { found = p; return }
          p = p.parent
          hops++
        }
      }
      for (i in 0 until n.childCount) walk(n.getChild(i))
    }
    walk(root)
    return found
  }

  private fun findCheckable(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (n == null) return null
    if (n.isCheckable) return n
    for (i in 0 until n.childCount) findCheckable(n.getChild(i))?.let { return it }
    return null
  }

  /** Presses the confirming button of a small "Are you sure?" dialog, only if it also has a Cancel. */
  private fun confirmDialog(): Boolean {
    val root = rootInActiveWindow ?: return false
    val positive = setOf("turn off", "turn on", "ok", "allow", "yes", "continue", "confirm", "enable", "disable",
      "बंद करें", "चालू करें", "ठीक है", "ಆಫ್ ಮಾಡಿ", "ಆನ್ ಮಾಡಿ", "ಸರಿ")
    val negative = setOf("cancel", "no", "रद्द करें", "ರದ್ದುಮಾಡಿ")
    val buttons = ArrayList<AccessibilityNodeInfo>()
    fun walk(n: AccessibilityNodeInfo?) {
      if (n == null) return
      if (n.isClickable && n.text != null) buttons.add(n)
      for (i in 0 until n.childCount) walk(n.getChild(i))
    }
    walk(root)
    if (buttons.size > 4 || buttons.none { normLabel(it.text.toString()) in negative }) return false
    val ok = buttons.firstOrNull { normLabel(it.text.toString()) in positive } ?: return false
    return ok.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  }

  fun goBack(times: Int) {
    repeat(times.coerceIn(0, 3)) {
      performGlobalAction(GLOBAL_ACTION_BACK)
      Thread.sleep(350)
    }
  }

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
