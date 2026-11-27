package com.rooster.app.forms

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.InputType
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The user's own details for filling forms, encrypted with an Android Keystore key (never leaves
 * the phone), plus the rules that decide which form field gets which detail.
 *
 * Never filled: passwords, OTPs, PINs, card/bank/ID numbers, usernames, captchas, and fields about
 * someone else (father's name, nominee, company...).
 */
object FormProfile {
  val KEYS = listOf("name", "phone", "email", "address", "city", "state", "pincode", "dob")

  private const val PREFS = "rooster_form_profile"
  private const val KEY_DATA = "data"
  private const val KEY_ALIAS = "rooster_form_profile_key"

  // ------------------------------------------------------------------ storage

  fun load(ctx: Context): Map<String, String> = try {
    val stored = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DATA, null)
    if (stored == null) emptyMap() else {
      val json = JSONObject(decrypt(stored))
      KEYS.mapNotNull { k -> json.optString(k).trim().takeIf { it.isNotEmpty() }?.let { k to it } }.toMap()
    }
  } catch (_: Exception) { emptyMap() }

  fun save(ctx: Context, json: String) {
    val clean = JSONObject()
    val input = JSONObject(json)
    KEYS.forEach { k -> input.optString(k).trim().take(200).takeIf { it.isNotEmpty() }?.let { clean.put(k, it) } }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DATA, encrypt(clean.toString())).apply()
  }

  fun toJson(profile: Map<String, String>): String = JSONObject(profile).toString()

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gen.generateKey()
  }

  private fun encrypt(plain: String): String {
    val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val out = c.iv + c.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(out, Base64.NO_WRAP)
  }

  private fun decrypt(stored: String): String {
    val bytes = Base64.decode(stored, Base64.NO_WRAP)
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
    return String(c.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
  }

  // ------------------------------------------------------------------ which field is which

  private val O = setOf(RegexOption.IGNORE_CASE)
  private val SENSITIVE = Regex(
    """pass|otp|one.?time|verification code|cvv|cvc|card|expiry|upi|mpin|atm|\bpin\b(?!\s*code)|aadhaa?r|\bpan\b|account|ifsc|captcha|user.?name|login|security|पासवर्ड|ओटीपी|आधार|खाता|ಪಾಸ್‌?ವರ್ಡ್|ಒಟಿಪಿ|ಆಧಾರ್""",
    O,
  )
  private val OTHER_PERSON = Regex(
    """father|mother|parent|spouse|husband|wife|nominee|guardian|company|business|employer|organi[sz]ation|emergency|reference|friend|पिता|माता|पति|पत्नी|नॉमिनी|ತಂದೆ|ತಾಯಿ|ಪತಿ|ಪತ್ನಿ""",
    O,
  )

  /** Standard autofill hints (Android and HTML autocomplete) mapped to profile keys. */
  private val HINTS = mapOf(
    "emailaddress" to "email", "email" to "email",
    "phone" to "phone", "phonenumber" to "phone", "tel" to "phone", "tel-national" to "phone",
    "name" to "name", "personname" to "name",
    "persongivenname" to "first_name", "given-name" to "first_name",
    "personfamilyname" to "last_name", "family-name" to "last_name",
    "postaladdress" to "address", "street-address" to "address", "address-line1" to "address",
    "postaladdressstreetaddress" to "address",
    "postaladdresslocality" to "city", "address-level2" to "city",
    "postaladdressregion" to "state", "address-level1" to "state",
    "postalcode" to "pincode", "postal-code" to "pincode",
    "birthdatefull" to "dob", "bday" to "dob",
  )

  private val RULES: List<Pair<Regex, String>> = listOf(
    Regex("""e-?mail|ईमेल|ಇಮೇಲ್""", O) to "email",
    Regex("""phone|mobile|contact\s*(no|number)|\btel\b|whatsapp|मोबाइल|फ़ोन|फोन|ಮೊಬೈಲ್|ಫೋನ್|ದೂರವಾಣಿ""", O) to "phone",
    Regex("""pin\s*code|postal|\bzip\b|post\s*code|पिन\s*कोड|ಪಿನ್\s*ಕೋಡ್""", O) to "pincode",
    Regex("""birth|\bdob\b|d\.o\.b|जन्म|ಜನ್ಮ""", O) to "dob",
    Regex("""\bcity\b|\btown\b|शहर|ನಗರ""", O) to "city",
    Regex("""\bstate\b|राज्य|ರಾಜ್ಯ""", O) to "state",
    Regex("""address|street|line\s*1|house|flat|locality|पता|ವಿಳಾಸ""", O) to "address",
    Regex("""first\s*name|given\s*name|\bfname\b""", O) to "first_name",
    Regex("""last\s*name|surname|family\s*name|\blname\b""", O) to "last_name",
    Regex("""name|नाम|ಹೆಸರು""", O) to "name",
  )

  fun isPasswordInput(inputType: Int): Boolean {
    val cls = inputType and InputType.TYPE_MASK_CLASS
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return (cls == InputType.TYPE_CLASS_TEXT && variation in setOf(
      InputType.TYPE_TEXT_VARIATION_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
    )) || (cls == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
  }

  /**
   * The profile key for a field, or null to leave it alone. `labels` is everything known about the
   * field (hint, placeholder, id, label text); `hints` are its standard autofill hints.
   */
  fun classify(labels: List<String?>, hints: List<String?> = emptyList(), inputType: Int = 0): String? {
    if (isPasswordInput(inputType)) return null
    val text = labels.filterNotNull().filter { it.isNotBlank() }.joinToString(" ").replace('_', ' ')
    val hintKeys = hints.filterNotNull().map { it.lowercase().trim() }
    if (hintKeys.any { it.contains("password") || it.contains("one-time") || it.startsWith("cc-") }) return null
    if (SENSITIVE.containsMatchIn(text) || OTHER_PERSON.containsMatchIn(text)) return null
    hintKeys.firstNotNullOfOrNull { HINTS[it] }?.let { return it }
    val cls = inputType and InputType.TYPE_MASK_CLASS
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    if (cls == InputType.TYPE_CLASS_TEXT && variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS) return "email"
    if (cls == InputType.TYPE_CLASS_PHONE) return "phone"
    if (text.isBlank()) return null
    return RULES.firstOrNull { it.first.containsMatchIn(text) }?.second
  }

  /** The value for a key; first/last name come from the saved full name. */
  fun value(profile: Map<String, String>, key: String?): String? {
    if (key == null) return null
    val name = profile["name"]
    return when (key) {
      "first_name" -> name?.trim()?.split(Regex("\\s+"))?.firstOrNull()
      "last_name" -> name?.trim()?.split(Regex("\\s+"))?.takeIf { it.size > 1 }?.last()
      else -> profile[key]
    }?.takeIf { it.isNotBlank() }
  }
}
