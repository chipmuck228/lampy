package app.lampy.albumlayout

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LampyAlbumLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LampyAlbumLayout")
    Function("measureText") { text: String, font: String, size: Double, lineHeight: Double, width: Double ->
      AlbumTypography.measure(text, font, size, lineHeight, width)
    }
    // Chronicle cache preparation only. No PDF/EPUB file exporter, share API or purchases.
    Function("epubPreviewAvailable") { true }
    AsyncFunction("prepareEpubImage") { source: String, destination: String ->
      AndroidPhotoCopies.preparePreview(source, destination, appContext.reactContext?.cacheDir ?: error("PREVIEW_UNAVAILABLE"))
    }
    View(AlbumEpubView::class) {
      Events("onReady", "onFailure", "onPageTurn")
      Prop("rootUri") { view: AlbumEpubView, value: String -> view.setRoot(value) }
      Prop("documentUri") { view: AlbumEpubView, value: String -> view.setDocument(value) }
    }
    View(AlbumPageView::class) {
      Prop("pageJson") { view: AlbumPageView, value: String -> view.setPage(value) }
      Prop("mediaJson") { view: AlbumPageView, value: String -> view.setMedia(value) }
      Prop("playingJson") { view: AlbumPageView, value: String -> view.setPlaying(value) }
    }
  }
}
