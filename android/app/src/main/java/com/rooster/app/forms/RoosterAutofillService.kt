package com.rooster.app.forms

import android.app.assist.AssistStructure
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.rooster.app.R

/**
 * Android's official autofill: when the user taps a form field in any app or in Chrome, a
 * "Fill with ROOSTER" suggestion fills every field we recognise. Only active if the user picks
 * ROOSTER under Settings → Autofill service. Never fills passwords or other secrets (see [FormProfile]).
 */
class RoosterAutofillService : AutofillService() {

  override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
    try {
      val structure = request.fillContexts.lastOrNull()?.structure ?: return callback.onSuccess(null)
      if (structure.activityComponent?.packageName == packageName) return callback.onSuccess(null)
      val profile = FormProfile.load(this)
      if (profile.isEmpty()) return callback.onSuccess(null)

      val matches = LinkedHashMap<AutofillId, String>()
      for (i in 0 until structure.windowNodeCount) {
        walk(structure.getWindowNodeAt(i).rootViewNode, profile, matches, arrayOf<String?>(null))
      }
      if (matches.isEmpty()) return callback.onSuccess(null)

      val name = profile["name"]?.let { " · $it" } ?: ""
      val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
        setTextViewText(R.id.autofill_text, "Fill with ROOSTER$name")
      }
      @Suppress("DEPRECATION")
      val dataset = Dataset.Builder(presentation).apply {
        matches.forEach { (id, v) -> setValue(id, AutofillValue.forText(v)) }
      }.build()
      callback.onSuccess(FillResponse.Builder().addDataset(dataset).build())
    } catch (_: Exception) {
      callback.onSuccess(null)
    }
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess() // ROOSTER never saves what people type into other apps.
  }

  /** `lastLabel[0]` carries the most recent plain text seen (usually the field's visible label). */
  private fun walk(
    node: AssistStructure.ViewNode,
    profile: Map<String, String>,
    out: MutableMap<AutofillId, String>,
    lastLabel: Array<String?>,
  ) {
    val id = node.autofillId
    val html = node.htmlInfo?.attributes?.associate { it.first.lowercase() to it.second }.orEmpty()
    val isTextField = node.autofillType == View.AUTOFILL_TYPE_TEXT && id != null && node.visibility == View.VISIBLE
    if (isTextField && html["type"]?.lowercase() != "password" && html["type"]?.lowercase() != "hidden") {
      val labels = listOf(
        node.hint, node.idEntry, node.contentDescription?.toString(),
        html["name"], html["id"], html["placeholder"], html["aria-label"], html["label"], html["title"],
        lastLabel[0],
      )
      val hints = (node.autofillHints?.toList() ?: emptyList()) + listOf(html["autocomplete"])
      val value = FormProfile.value(profile, FormProfile.classify(labels, hints, node.inputType))
      if (value != null && node.autofillValue?.textValue.isNullOrBlank()) out[id!!] = value
      lastLabel[0] = null // a label belongs to one field only
    } else if (!isTextField) {
      node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() && it.length < 80 }?.let { lastLabel[0] = it }
    }
    for (i in 0 until node.childCount) walk(node.getChildAt(i), profile, out, lastLabel)
  }
}
