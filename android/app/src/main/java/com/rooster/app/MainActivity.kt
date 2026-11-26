package com.rooster.app

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  companion object {
    /** True while ROOSTER is on screen — the wake service can then bring up the pop-up without overlay permission. */
    @Volatile var isVisible = false
      private set
  }

  override fun getMainComponentName(): String = "Rooster"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onResume() {
    super.onResume()
    isVisible = true
  }

  override fun onPause() {
    isVisible = false
    super.onPause()
  }
}
