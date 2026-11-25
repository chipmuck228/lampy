package app.lampy.albumlayout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.util.Base64
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

/** Bounded derivatives only. Source images are never overwritten or uploaded as a fallback. */
object AndroidPhotoCopies {
  private fun decode(bytes: ByteArray, edge: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val w = bounds.outWidth; val h = bounds.outHeight
    require(w > 0 && h > 0 && w.toLong() * h <= 120_000_000L) { "DIMENSIONS" }
    
    if (Build.VERSION.SDK_INT >= 28) {
      return ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
        val orientedScale = minOf(1.0, edge.toDouble() / max(info.size.width, info.size.height))
        val tw = max(1, (info.size.width * orientedScale).roundToInt()); val th = max(1, (info.size.height * orientedScale).roundToInt())
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        decoder.setTargetSize(tw, th)
        decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
      }
    }
    var sample = 1
    while (max(w, h) / (sample * 2) >= edge) sample *= 2
    var bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("DECODE_FAILED")
    val orientation = runCatching { ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
    val matrix = Matrix().apply {
      when (orientation) { 2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f); 5 -> { setRotate(90f); postScale(-1f, 1f) }; 6 -> setRotate(90f); 7 -> { setRotate(270f); postScale(-1f, 1f) }; 8 -> setRotate(270f) }
    }
    val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (turned !== bitmap) { bitmap.recycle(); bitmap = turned }
    val factor = minOf(1.0, edge.toDouble() / max(bitmap.width, bitmap.height))
    if (factor < 1) { val resized = Bitmap.createScaledBitmap(bitmap, max(1, (bitmap.width * factor).roundToInt()), max(1, (bitmap.height * factor).roundToInt()), true); if (resized !== bitmap) bitmap.recycle(); bitmap = resized }
    return bitmap
  }
  private fun render(source: Bitmap, png: Boolean): Bitmap {
    val output = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    canvas.drawColor(if (png) Color.TRANSPARENT else Color.rgb(250, 249, 245))
    canvas.drawBitmap(source, 0f, 0f, null)
    source.recycle()
    return output
  }
  fun preparePreview(source: String, destination: String, cache: File): Map<String, Any> {
    val inputUri = Uri.parse(source); val outputUri = Uri.parse(destination)
    require(inputUri.scheme == "file" && outputUri.scheme == "file") { "EPUB_INVALID_PATH" }
    val input = File(inputUri.path!!).canonicalFile; val output = File(outputUri.path!!).canonicalFile
    val root = File(cache, "album-epub-preview").canonicalFile
    require(output.path.startsWith(root.path + File.separator) && input != output) { "EPUB_INVALID_PATH" }
    require(input.length() in 1..(32L * 1024 * 1024)) { "SOURCE_TOO_LARGE" }
    val bytes = input.readBytes()
    val png = bytes.size >= 8 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4e.toByte() && bytes[3] == 0x47.toByte()
    val bitmap = render(decode(bytes, 1600), png)
    try {
      output.parentFile?.mkdirs()
      output.outputStream().use { require(bitmap.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 82, it)) { "ENCODE_FAILED" } }
      return mapOf("mime" to if (png) "image/png" else "image/jpeg", "extension" to if (png) "png" else "jpg", "bytes" to output.length(), "width" to bitmap.width, "height" to bitmap.height)
    } catch (error: Exception) { output.delete(); throw error } finally { bitmap.recycle() }
  }
  fun familyCopy(base64: String, mime: String): Map<String, Any> {
    if (base64.length > 44_739_244) return mapOf("error" to "SOURCE_TOO_LARGE")
    return try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      require(bytes.size in 1..(32 * 1024 * 1024)) { "SOURCE_TOO_LARGE" }
      val png = mime == "image/png"
      val bitmap = render(decode(bytes, 2304), png)
      try {
        for (quality in if (png) listOf(100) else listOf(90, 80, 70, 60)) {
          val out = ByteArrayOutputStream()
          require(bitmap.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, quality, out)) { "ENCODE_FAILED" }
          if (out.size() <= 8 * 1024 * 1024) return mapOf("base64" to Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP), "mimeType" to if (png) "image/png" else "image/jpeg", "width" to bitmap.width, "height" to bitmap.height)
        }
        mapOf("error" to "OUTPUT_TOO_LARGE")
      } finally { bitmap.recycle() }
    } catch (error: Exception) { mapOf("error" to if (error.message in listOf("SOURCE_TOO_LARGE", "DIMENSIONS", "ENCODE_FAILED")) error.message!! else "DECODE_FAILED") }
  }
}
