package app.lampy.familyimages

import app.lampy.albumlayout.AndroidPhotoCopies
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LampyFamilyImagesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LampyFamilyImages")
    AsyncFunction("prepare") { base64: String, mime: String -> AndroidPhotoCopies.familyCopy(base64, mime) }
  }
}
