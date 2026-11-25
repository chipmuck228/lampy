package app.lampy.albumlayout

import android.net.Uri
import java.io.File

/** Own private preview tree only; no file/content URL navigation and no network fallback. */
object EpubPreviewFiles {
  const val ORIGIN = "https://lampy-preview.invalid"
  fun root(cache: File, uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file" && parsed.authority.isNullOrEmpty())
    val file = File(parsed.path!!).canonicalFile
    val parent = File(cache, "album-epub-preview").canonicalFile
    require(file.parentFile == parent && file.name.matches(Regex("preview_[a-zA-Z0-9_-]+")) && file.isDirectory)
    return file
  }
  fun document(root: File, uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file" && parsed.authority.isNullOrEmpty())
    val file = File(parsed.path!!).canonicalFile
    require(file.parentFile == File(root, "OEBPS").canonicalFile && file.name.matches(Regex("[a-zA-Z0-9_-]+\\.xhtml")) && file.isFile)
    return file
  }
  fun resource(root: File, uri: Uri): File? {
    if (uri.scheme != "https" || uri.host != "lampy-preview.invalid" || uri.port != -1 || uri.userInfo != null || uri.query != null) return null
    val path = uri.path ?: return null
    if (!path.startsWith("/OEBPS/") || path.contains('\\') || path.contains('\u0000')) return null
    val file = File(root, path.removePrefix("/")).canonicalFile
    if (!file.path.startsWith(File(root, "OEBPS").canonicalPath + File.separator) || !file.isFile) return null
    if (file.extension !in setOf("xhtml", "css", "js", "svg", "jpg", "png", "m4a", "mp3")) return null
    return file
  }
  fun range(header: String?, length: Long): LongRange? {
    if (header == null) return 0L until length
    val match = Regex("bytes=(\\d*)-(\\d*)").matchEntire(header) ?: return null
    val a = match.groupValues[1]; val b = match.groupValues[2]
    if (length <= 0 || (a.isEmpty() && b.isEmpty())) return null
    val start = if (a.isEmpty()) maxOf(0, length - (b.toLongOrNull() ?: return null)) else a.toLongOrNull() ?: return null
    val end = if (a.isEmpty() || b.isEmpty()) length - 1 else minOf(length - 1, b.toLongOrNull() ?: return null)
    return if (start in 0 until length && end >= start) start..end else null
  }
}
