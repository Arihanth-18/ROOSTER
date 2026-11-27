package com.rooster.app.forms

import android.text.InputType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FormProfileTest {
  private fun c(vararg labels: String, hints: List<String> = emptyList(), type: Int = InputType.TYPE_CLASS_TEXT) =
    FormProfile.classify(labels.toList(), hints, type)

  @Test fun recognisesCommonFields() {
    assertEquals("name", c("Full Name"))
    assertEquals("name", c("Applicant name"))
    assertEquals("first_name", c("First name"))
    assertEquals("last_name", c("Surname"))
    assertEquals("phone", c("Mobile Number"))
    assertEquals("email", c("Email address"))
    assertEquals("address", c("Address line 1"))
    assertEquals("city", c("City"))
    assertEquals("state", c("State"))
    assertEquals("pincode", c("Pin code"))
    assertEquals("pincode", c("PINCODE"))
    assertEquals("dob", c("Date of Birth"))
    assertEquals("name", c("नाम"))
    assertEquals("phone", c("ಮೊಬೈಲ್ ಸಂಖ್ಯೆ"))
  }

  @Test fun usesStandardHintsAndInputTypes() {
    assertEquals("email", c(hints = listOf("emailAddress")))
    assertEquals("pincode", c(hints = listOf("postal-code")))
    assertEquals("phone", c(type = InputType.TYPE_CLASS_PHONE))
    assertEquals("email", c(type = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS))
  }

  @Test fun neverFillsSecretsOrOtherPeoplesDetails() {
    assertNull(c("Password"))
    assertNull(c("Name", type = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD))
    assertNull(c("Enter OTP"))
    assertNull(c("ATM PIN"))
    assertNull(c("UPI PIN"))
    assertNull(c("Card number"))
    assertNull(c("CVV"))
    assertNull(c("Aadhaar number"))
    assertNull(c("Username"))
    assertNull(c("Account number"))
    assertNull(c("Father's name"))
    assertNull(c("Nominee name"))
    assertNull(c("Company name"))
    assertNull(c("पिता का नाम"))
    assertNull(c(hints = listOf("current-password")))
    assertNull(c(hints = listOf("cc-number")))
    assertNull(c("Search"))
  }

  @Test fun splitsTheFullName() {
    val p = mapOf("name" to "Ramesh Kumar Rao")
    assertEquals("Ramesh", FormProfile.value(p, "first_name"))
    assertEquals("Rao", FormProfile.value(p, "last_name"))
    assertNull(FormProfile.value(mapOf("name" to "Ramesh"), "last_name"))
    assertNull(FormProfile.value(p, "phone"))
  }
}
