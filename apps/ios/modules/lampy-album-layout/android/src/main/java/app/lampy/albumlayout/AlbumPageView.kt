package app.lampy.albumlayout

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.Future
import org.json.JSONArray
import org.json.JSONObject

/** One page owns only its downsampled photos; no album-wide bitmap cache or network access. */
class AlbumPageView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var page = JSONObject()
  private var media = JSONObject()
  private var playing = emptySet<String>()
  private var photos = emptyMap<String, Bitmap>()
  private var generation = 0
  private var decode: Future<*>? = null

  init {
    setWillNotDraw(false)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    isClickable = false
  }
  fun setPage(json: String) {
    page = runCatching { JSONObject(json) }.getOrDefault(JSONObject())
    loadPhotos()
    invalidate()
  }
  fun setMedia(json: String) {
    media = runCatching { JSONObject(json) }.getOrDefault(JSONObject())
    loadPhotos()
  }
  fun setPlaying(json: String) {
    val list = runCatching { JSONArray(json) }.getOrDefault(JSONArray())
    playing = (0 until list.length()).map { list.optString(it) }.toSet()
    invalidate()
  }
  override fun onDetachedFromWindow() {
    generation++
    decode?.cancel(true)
    photos = emptyMap()
    super.onDetachedFromWindow()
  }
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    loadPhotos()
  }
  private fun loadPhotos() {
    val ticket = ++generation
    decode?.cancel(true)
    // Clear the previous page synchronously so stale photos cannot flash in another page.
    photos = emptyMap()
    invalidate()
    val blocks = page.optJSONArray("blocks") ?: return
    val sources = (0 until blocks.length()).mapNotNull { i ->
      val block = blocks.optJSONObject(i) ?: return@mapNotNull null
      if (block.optString("kind") !in listOf("image", "cover-image") || block.optString("status") != "available") return@mapNotNull null
      val id = block.optString("assetId")
      val uri = Uri.parse(media.optString(id))
      if (uri.scheme != "file" || uri.path.isNullOrEmpty()) null else id to uri.path!!
    }.distinctBy { it.first }
    if (sources.isEmpty()) return
    decode = decoder.submit {
      val result = mutableMapOf<String, Bitmap>()
      for ((id, path) in sources) {
        if (Thread.currentThread().isInterrupted) return@submit
        val bitmap = runCatching { decodePhoto(path) }.getOrNull()
        if (bitmap != null) result[id] = bitmap
      }
      post {
        if (generation == ticket && isAttachedToWindow) {
          photos = result
          invalidate()
        }
      }
    }
  }
  private fun decodePhoto(path: String): Bitmap? {
    if (!File(path).isFile) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2
    val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val orientation = runCatching { ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
    val matrix = Matrix()
    when (orientation) {
      2 -> matrix.setScale(-1f, 1f)
      3 -> matrix.setRotate(180f)
      4 -> matrix.setScale(1f, -1f)
      5 -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
      6 -> matrix.setRotate(90f)
      7 -> { matrix.setRotate(270f); matrix.postScale(-1f, 1f) }
      8 -> matrix.setRotate(270f)
    }
    if (matrix.isIdentity) return bitmap
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true).also { if (it !== bitmap) bitmap.recycle() }
  }
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    AlbumPageRenderer.draw(canvas, page, photos, playing, width, height)
  }
  companion object {
    private val decoder = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "LampyAlbumPhotos").apply { isDaemon = true } }
  }
}
