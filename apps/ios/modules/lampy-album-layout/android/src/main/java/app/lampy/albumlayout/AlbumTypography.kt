package app.lampy.albumlayout

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import kotlin.math.ceil
import kotlin.math.max

/** All coordinates use the shared page's logical points, not Android pixels or sp. */
internal object AlbumTypography {
  fun paint(font: String, size: Float, color: Int = 0xff25231f.toInt()) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(if (font == "serif") "serif" else "sans-serif", Typeface.NORMAL)
    textSize = size
    this.color = color
  }

  private fun layout(text: String, paint: TextPaint, width: Float, maxLines: Int = Int.MAX_VALUE): StaticLayout =
    StaticLayout.Builder.obtain(text, 0, text.length, paint, ceil(width.toDouble()).toInt().coerceAtLeast(1))
      .setIncludePad(false)
      .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
      .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
      .setMaxLines(maxLines)
      .build()

  fun measure(text: String, font: String, size: Double, lineHeight: Double, width: Double): List<Map<String, Double>> {
    require(size.isFinite() && size > 0 && lineHeight.isFinite() && lineHeight > 0 && width.isFinite() && width > 0)
    if (text.isEmpty()) return emptyList()
    val layout = layout(text, paint(font, size.toFloat()), width.toFloat())
    return (0 until layout.lineCount).mapNotNull { i ->
      val start = layout.getLineStart(i)
      val end = layout.getLineEnd(i)
      // StaticLayout adds an empty final line after a trailing newline; it owns no source range.
      if (end <= start) null else mapOf(
        "start" to text.codePointCount(0, start).toDouble(),
        "end" to text.codePointCount(0, end).toDouble(),
        "widthPt" to layout.getLineWidth(i).toDouble(),
        "heightPt" to max(lineHeight, (layout.getLineDescent(i) - layout.getLineAscent(i)).toDouble()),
        "ascentPt" to -layout.getLineAscent(i).toDouble()
      )
    }
  }

  fun scalarSlice(text: String, start: Int, end: Int): String {
    val length = text.codePointCount(0, text.length)
    val lo = start.coerceIn(0, length)
    val hi = end.coerceIn(lo, length)
    return text.substring(text.offsetByCodePoints(0, lo), text.offsetByCodePoints(0, hi))
  }

  fun draw(canvas: Canvas, text: String, paint: TextPaint, x: Float, baseline: Float, width: Float) {
    val value = text.trimEnd('\r', '\n')
    if (value.isEmpty() || width <= 0) return
    // Use the same shaper for measurement and drawing, including system CJK/emoji fallback.
    val line = layout(value, paint, width, 1)
    canvas.save()
    canvas.translate(x, baseline - line.getLineBaseline(0))
    line.draw(canvas)
    canvas.restore()
  }
}
