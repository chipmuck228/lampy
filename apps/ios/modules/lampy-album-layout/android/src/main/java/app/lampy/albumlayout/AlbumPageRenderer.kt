package app.lampy.albumlayout

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.min

internal object AlbumPageRenderer {
  private const val PAGE_WIDTH = 148f * 72 / 25.4f
  private const val PAGE_HEIGHT = 210f * 72 / 25.4f
  private val ink = 0xff25231f.toInt()
  private val soft = 0xff5c5851.toInt()
  private val sage = 0xff53604f.toInt()
  private fun color(value: String, fallback: Int) = runCatching { Color.parseColor(value) }.getOrDefault(fallback)
  fun draw(canvas: Canvas, page: JSONObject, photos: Map<String, Bitmap>, playing: Set<String>, width: Int, height: Int) {
    val render = page.optJSONObject("rendering") ?: JSONObject()
    canvas.drawColor(color(render.optString("paper"), 0xfff3f0e9.toInt()))
    if (width <= 0 || height <= 0) return
    canvas.save()
    canvas.scale(width / PAGE_WIDTH, height / PAGE_HEIGHT)
    canvas.clipRect(0f, 0f, PAGE_WIDTH, PAGE_HEIGHT)
    val serif = render.optString("serif", "serif")
    val ui = render.optString("ui", "sans-serif")
    val copy = render.optJSONObject("copy") ?: JSONObject()
    if (render.optBoolean("pageNumbers")) {
      val text = "${page.optInt("index") + 1} / ${render.optInt("pageCount", 1)}"
      AlbumTypography.draw(canvas, text, AlbumTypography.paint(ui, 10f, soft), PAGE_WIDTH / 2 - 12, PAGE_HEIGHT - 20, 100f)
    }
    val blocks = page.optJSONArray("blocks") ?: JSONArray()
    for (i in 0 until blocks.length()) {
      val block = blocks.optJSONObject(i) ?: continue
      val box = block.optJSONObject("box") ?: continue
      val x = box.optDouble("xPt").toFloat()
      val y = box.optDouble("yPt").toFloat()
      val w = box.optDouble("widthPt").toFloat()
      val h = box.optDouble("heightPt").toFloat()
      val kind = block.optString("kind")
      val body = kind in listOf("cover-name", "note", "opening", "close")
      val size = if (kind == "cover-name") 28f else if (body) 17f else 15f
      val textPaint = AlbumTypography.paint(if (body) serif else ui, size, if (body) ink else if (kind == "day-rule") sage else soft)
      val baseline = y - textPaint.fontMetrics.ascent
      if (kind == "image" || kind == "cover-image") {
        val bitmap = photos[block.optString("assetId")]
        val rect = RectF(x, y, x + w, y + h)
        if (bitmap == null) {
          canvas.drawRect(rect, Paint().apply { this.color = 0xffe6e6e6.toInt() })
          AlbumTypography.draw(canvas, copy.optString("imageMissing", "这张照片现在看不到。"), AlbumTypography.paint(ui, 15f, soft), x + 8, baseline, w - 16)
        } else {
          val border = render.optDouble("photoBorderWidth", 0.0).toFloat().coerceIn(0f, min(w, h) / 4)
          canvas.drawRect(rect, Paint().apply { this.color = Color.WHITE })
          rect.inset(border, border)
          val scale = min(rect.width() / bitmap.width, rect.height() / bitmap.height)
          val bw = bitmap.width * scale
          val bh = bitmap.height * scale
          canvas.drawBitmap(bitmap, null, RectF(rect.centerX() - bw / 2, rect.centerY() - bh / 2, rect.centerX() + bw / 2, rect.centerY() + bh / 2), Paint(Paint.FILTER_BITMAP_FLAG))
        }
        continue
      }
      if (kind == "feeling") {
        canvas.drawCircle(x + 4, y + 11, 4f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color(block.optString("accent"), sage) })
        AlbumTypography.draw(canvas, block.optString("value"), textPaint, x + 16, baseline, w - 16)
        continue
      }
      if (kind == "audio") {
        val available = block.optString("status") == "available"
        if (available) {
          val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = soft }
          if (playing.contains(block.optString("assetId"))) {
            canvas.drawRect(x, y + 2, x + 5, y + 16, paint)
            canvas.drawRect(x + 9, y + 2, x + 14, y + 16, paint)
          } else {
            val path = Path().apply { moveTo(x, y); lineTo(x + 14, y + 9); lineTo(x, y + 18); close() }
            canvas.drawPath(path, paint)
          }
        }
        AlbumTypography.draw(canvas, block.optString("text"), textPaint, x + if (available) 28 else 0, baseline, w - if (available) 28 else 0)
        continue
      }
      val text = block.optString("text", block.optString("label", block.optString("value", when (kind) {
        "source-gone" -> copy.optString("sourceGone", "这条已经不在。")
        "source-unreadable" -> copy.optString("sourceUnreadable", "这条记录暂时读不出来。")
        "source-changed" -> copy.optString("sourceChanged", "这条后来改过。")
        else -> ""
      })))
      val lines = block.optJSONArray("lines")
      if (lines != null && lines.length() > 0) {
        for (j in 0 until lines.length()) {
          val line = lines.getJSONObject(j)
          AlbumTypography.draw(canvas, AlbumTypography.scalarSlice(text, line.optInt("start"), line.optInt("end")), textPaint,
            line.optDouble("xPt", x.toDouble()).toFloat(), line.optDouble("baselineYPt", baseline.toDouble()).toFloat(), w)
        }
      } else AlbumTypography.draw(canvas, text, textPaint, x, baseline, w)
    }
    canvas.restore()
  }
}
