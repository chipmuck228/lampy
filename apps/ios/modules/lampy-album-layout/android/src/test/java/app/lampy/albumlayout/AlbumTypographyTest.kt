package app.lampy.albumlayout

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AlbumTypographyTest {
  @Test fun measuredRangesCoverChineseEnglishEmojiAndNewlinesExactly() {
    val text = ("周末的雨，a quiet morning. 👨‍👩‍👧‍👦 🦞💩 e\u0301\n\n下一段：照片与声音。\r\n").repeat(30)
    val lines = AlbumTypography.measure(text, "serif", 17.0, 32.0, 180.0)
    assertTrue(lines.size > 30)
    var end = 0
    val slices = StringBuilder()
    for (line in lines) {
      assertEquals(end, line.getValue("start").toInt())
      end = line.getValue("end").toInt()
      assertTrue(end > line.getValue("start").toInt())
      assertTrue(line.getValue("heightPt") >= 32.0)
      assertTrue(line.getValue("ascentPt") > 0)
      slices.append(AlbumTypography.scalarSlice(text, line.getValue("start").toInt(), end))
    }
    assertEquals(text.codePointCount(0, text.length), end)
    assertEquals(text, slices.toString())
  }
  @Test fun narrowerPagesProduceMoreLinesWithoutSplittingSurrogates() {
    val text = "这些日子 🦞 kept in a little book. ".repeat(12)
    val narrow = AlbumTypography.measure(text, "serif", 17.0, 32.0, 80.0)
    val wide = AlbumTypography.measure(text, "serif", 17.0, 32.0, 320.0)
    assertTrue(narrow.size > wide.size)
    assertEquals("🦞", AlbumTypography.scalarSlice("甲🦞乙", 1, 2))
    assertTrue(AlbumTypography.measure("", "serif", 17.0, 32.0, 80.0).isEmpty())
  }
  @Test fun pageRendererDrawsPaperTextAndPhotosWithSharedCoordinates() {
    val page = JSONObject("""{"index":0,"rendering":{"paper":"#F3ECDD","serif":"serif","ui":"sans-serif","photoBorderWidth":6},"blocks":[{"kind":"note","text":"周末 Hello 🦞","box":{"xPt":36,"yPt":40,"widthPt":340,"heightPt":32}},{"kind":"image","assetId":"photo","status":"available","box":{"xPt":36,"yPt":100,"widthPt":100,"heightPt":100}},{"kind":"audio","assetId":"voice","status":"available","text":"一段声音","box":{"xPt":36,"yPt":240,"widthPt":300,"heightPt":22}}]}""")
    val image = Bitmap.createBitmap(50, 50, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
    val bitmap = Bitmap.createBitmap(420, 595, Bitmap.Config.ARGB_8888)
    AlbumPageRenderer.draw(Canvas(bitmap), page, mapOf("photo" to image), setOf("voice"), 420, 595)
    assertEquals(Color.parseColor("#F3ECDD"), bitmap.getPixel(0, 0))
    assertEquals(Color.RED, bitmap.getPixel(85, 150))
    assertEquals(Color.WHITE, bitmap.getPixel(38, 102))
    val paper = Color.parseColor("#F3ECDD")
    assertTrue((40..70).any { y -> (36..300).any { x -> bitmap.getPixel(x,y) != paper } })
    assertTrue((242..255).any { y -> (36..50).any { x -> bitmap.getPixel(x,y) != paper } })
    bitmap.recycle()
    image.recycle()
  }
}
