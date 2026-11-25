package app.lampy.albumlayout

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EpubPreviewTest {
  private fun cache() = RuntimeEnvironment.getApplication().cacheDir
  private fun root(): File = File(cache(), "album-epub-preview/preview_test").apply { mkdirs(); File(this, "OEBPS/media").mkdirs() }
  private fun fails(work: () -> Unit) { try { work(); fail("Must reject unsafe input") } catch (_: IllegalArgumentException) {} }
  @Test fun onlyOwnPreviewRootsAndDocumentsAreReadable() {
    val root = root(); val page = File(root, "OEBPS/cover.xhtml").apply { writeText("<html/>") }
    assertEquals(root.canonicalFile, EpubPreviewFiles.root(cache(), root.toURI().toString()))
    assertEquals(page.canonicalFile, EpubPreviewFiles.document(root, page.toURI().toString()))
    fails { EpubPreviewFiles.root(cache(), File(cache(), "family-media").toURI().toString()) }
    fails { EpubPreviewFiles.root(cache(), "content://provider/preview_test") }
    fails { EpubPreviewFiles.document(root, File(cache(), "secret.xhtml").toURI().toString()) }
    assertEquals(page.canonicalFile, EpubPreviewFiles.resource(root, Uri.parse(EpubPreviewFiles.ORIGIN + "/OEBPS/cover.xhtml")))
    for (uri in listOf("https://remote.example/cover.xhtml", "file:///etc/passwd", "content://provider/photo", EpubPreviewFiles.ORIGIN + "/OEBPS/../../secret.xhtml", EpubPreviewFiles.ORIGIN + "/OEBPS/%2e%2e/%2e%2e/secret.xhtml", EpubPreviewFiles.ORIGIN + ":443/OEBPS/cover.xhtml", EpubPreviewFiles.ORIGIN + "/OEBPS/cover.xhtml?remote=1")) assertNull(uri, EpubPreviewFiles.resource(root, Uri.parse(uri)))
    val secret = File(cache(), "private-image.jpg").apply { writeText("private") }
    val link = File(root, "OEBPS/media/symlink.jpg"); link.delete(); Files.createSymbolicLink(link.toPath(), secret.toPath())
    assertNull(EpubPreviewFiles.resource(root, Uri.parse(EpubPreviewFiles.ORIGIN + "/OEBPS/media/symlink.jpg")))
  }
  @Test fun audioRangesAreBoundedAndMalformedRangesRejected() {
    assertEquals(0L..99L, EpubPreviewFiles.range(null, 100))
    assertEquals(20L..49L, EpubPreviewFiles.range("bytes=20-49", 100))
    assertEquals(90L..99L, EpubPreviewFiles.range("bytes=90-", 100))
    assertEquals(80L..99L, EpubPreviewFiles.range("bytes=-20", 100))
    assertEquals(0L..99L, EpubPreviewFiles.range("bytes=0-999", 100))
    for (range in listOf("bytes=200-", "bytes=50-20", "bytes=0-1,5-6", "bytes=-0", "bytes=-", "bytes=x-1")) assertNull(EpubPreviewFiles.range(range, 100))
  }
  private fun png(width: Int, height: Int): ByteArray {
    val image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
    return try { ByteArrayOutputStream().also { image.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray() } finally { image.recycle() }
  }
  @Test fun previewCopiesAreBoundedNeverEnlargeSmallImagesAndNeverModifySources() {
    val root = root()
    for ((w, h) in listOf(120 to 80, 2000 to 1000, 200 to 4000)) {
      val source = File(cache(), "source-$w-$h.png"); val original = png(w, h); source.writeBytes(original)
      val target = File(root, "OEBPS/media/copy-$w-$h.image")
      val copy = AndroidPhotoCopies.preparePreview(source.toURI().toString(), target.toURI().toString(), cache())
      assertTrue((copy["width"] as Int) <= minOf(w, 1600)); assertTrue((copy["height"] as Int) <= minOf(h, 1600))
      assertArrayEquals(original, source.readBytes()); assertEquals("image/png", copy["mime"])
    }
    fails { AndroidPhotoCopies.preparePreview(File(cache(), "source-120-80.png").toURI().toString(), File(cache(), "outside.jpg").toURI().toString(), cache()) }
  }
  @Test fun familyCopiesHaveBoundedDimensionsAndFixedErrorsWithoutOriginalFallback() {
    val source = png(3000, 1000)
    val copy = AndroidPhotoCopies.familyCopy(Base64.encodeToString(source, Base64.NO_WRAP), "image/png")
    assertEquals(2304, copy["width"]); assertEquals(768, copy["height"])
    assertTrue(Base64.decode(copy["base64"] as String, Base64.DEFAULT).size < 8 * 1024 * 1024)
    assertEquals("DECODE_FAILED", AndroidPhotoCopies.familyCopy("not an image", "image/jpeg")["error"])
  }
}
