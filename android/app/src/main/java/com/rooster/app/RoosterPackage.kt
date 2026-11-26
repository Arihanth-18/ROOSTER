package com.rooster.app

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.rooster.app.device.RoosterDeviceModule
import com.rooster.app.ocr.RoosterVisionModule
import com.rooster.app.reminders.RoosterRemindersModule
import com.rooster.app.speech.RoosterSpeechModule
import com.rooster.app.wake.RoosterWakeModule

/** Registers ROOSTER's own TurboModules. */
class RoosterPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = when (name) {
    RoosterSpeechModule.NAME -> RoosterSpeechModule(reactContext)
    RoosterRemindersModule.NAME -> RoosterRemindersModule(reactContext)
    RoosterDeviceModule.NAME -> RoosterDeviceModule(reactContext)
    RoosterVisionModule.NAME -> RoosterVisionModule(reactContext)
    RoosterWakeModule.NAME -> RoosterWakeModule(reactContext)
    else -> null
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    listOf(
      RoosterSpeechModule.NAME,
      RoosterRemindersModule.NAME,
      RoosterDeviceModule.NAME,
      RoosterVisionModule.NAME,
      RoosterWakeModule.NAME,
    ).associateWith { name ->
      ReactModuleInfo(
        name = name,
        className = name,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      )
    }
  }
}
