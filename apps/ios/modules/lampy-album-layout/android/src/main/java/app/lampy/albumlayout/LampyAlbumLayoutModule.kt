package app.lampy.albumlayout

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LampyAlbumLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LampyAlbumLayout")
    Function("measureText") { text: String, font: String, size: Double, lineHeight: Double, width: Double ->
      AlbumTypography.measure(text, font, size, lineHeight, width)
    }
    // Printing and purchases deliberately have no Android implementation in this milestone.
    View(AlbumPageView::class) {
      Prop("pageJson") { view: AlbumPageView, value: String -> view.setPage(value) }
      Prop("mediaJson") { view: AlbumPageView, value: String -> view.setMedia(value) }
      Prop("playingJson") { view: AlbumPageView, value: String -> view.setPlaying(value) }
    }
  }
}
