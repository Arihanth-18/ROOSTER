package com.rooster.app.ocr

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.rooster.app.specs.NativeRoosterVisionSpec
import org.json.JSONObject
import java.io.File

/**
 * Uses the system camera app (ACTION_IMAGE_CAPTURE) and the system photo picker, so ROOSTER needs
 * neither the CAMERA nor any storage permission. OCR runs fully on-device with bundled ML Kit models.
 */
class RoosterVisionModule(private val ctx: ReactApplicationContext) : NativeRoosterVisionSpec(ctx) {

  companion object {
    const val NAME = "RoosterVision"
    private const val REQ_CAPTURE = 41001
    private const val REQ_PICK = 41002
  }

  private var pending: Promise? = null
  private var captureUri: Uri? = null

  private val activityListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQ_CAPTURE && requestCode != REQ_PICK) return
      val p = pending ?: return
      pending = null
      if (resultCode != Activity.RESULT_OK) { p.resolve(""); return }
      val uri = if (requestCode == REQ_CAPTURE) captureUri else data?.data
      p.resolve(uri?.toString() ?: "")
    }
  }

  init {
    ctx.addActivityEventListener(activityListener)
  }

  override fun getName() = NAME

  private fun begin(promise: Promise): Activity? {
    val activity = ctx.currentActivity
    if (activity == null) { promise.reject("no_activity", "App is not in the foreground"); return null }
    pending?.resolve("") // a previous request was abandoned
    pending = promise
    return activity
  }

  override fun captureImage(promise: Promise) {
    val activity = begin(promise) ?: return
    try {
      val dir = File(ctx.cacheDir, "ocr").apply { mkdirs() }
      // Keep only the latest capture; images are never uploaded.
      dir.listFiles()?.forEach { it.delete() }
      val file = File(dir, "capture_${System.currentTimeMillis()}.jpg")
      val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
      captureUri = uri
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        .putExtra(MediaStore.EXTRA_OUTPUT, uri)
        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivityForResult(intent, REQ_CAPTURE)
    } catch (e: ActivityNotFoundException) {
      pending = null
      promise.reject("no_camera", "No camera app available", e)
    } catch (e: Exception) {
      pending = null
      promise.reject("capture_failed", e.message ?: "Could not open camera", e)
    }
  }

  override fun pickImage(promise: Promise) {
    val activity = begin(promise) ?: return
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
    } else {
      Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
    }
    try {
      activity.startActivityForResult(intent, REQ_PICK)
    } catch (e: Exception) {
      pending = null
      promise.reject("pick_failed", e.message ?: "Could not open photo picker", e)
    }
  }

  override fun recognizeText(uri: String, script: String, promise: Promise) {
    val image = try {
      InputImage.fromFilePath(ctx, Uri.parse(uri))
    } catch (e: Exception) {
      promise.reject("image_unreadable", "Could not open the image", e); return
    }
    val recognizer = if (script == "devanagari") {
      TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
    } else {
      TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }
    recognizer.process(image)
      .addOnSuccessListener { result ->
        val lines = result.textBlocks.sumOf { it.lines.size }
        promise.resolve(JSONObject().put("text", result.text).put("lineCount", lines).toString())
      }
      .addOnFailureListener { e -> promise.reject("ocr_failed", e.message ?: "Text recognition failed", e) }
      .addOnCompleteListener { recognizer.close() }
  }

  override fun invalidate() {
    ctx.removeActivityEventListener(activityListener)
    super.invalidate()
  }
}
