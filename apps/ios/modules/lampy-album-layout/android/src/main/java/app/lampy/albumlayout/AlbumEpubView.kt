package app.lampy.albumlayout

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.LifecycleEventListener
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FilterInputStream

/** A private, disposable 4:3 Chronicle reader, with no export, file chooser or JS bridge. */
@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
class AlbumEpubView(context: Context, appContext: AppContext) : ExpoView(context, appContext), LifecycleEventListener {
  val onReady by EventDispatcher()
  val onFailure by EventDispatcher()
  val onPageTurn by EventDispatcher()
  private var rootUri = ""
  private var documentUri = ""
  @Volatile private var root: File? = null
  private var document: File? = null
  private val web = WebView(context)
  private var attached = false
  private val gestures = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onFling(first: MotionEvent?, last: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
      if (first == null || kotlin.math.abs(last.x - first.x) < 80 * resources.displayMetrics.density || kotlin.math.abs(last.y - first.y) > 80 * resources.displayMetrics.density) return false
      web.evaluateJavascript("!!document.querySelector('.photo-detail.is-open')") { opened -> if (root != null && opened == "false") onPageTurn(mapOf("direction" to if (last.x < first.x) 1 else -1)) }
      return false
    }
  })
  init {
    setBackgroundColor(Color.rgb(21, 28, 25))
    addView(web)
    web.setBackgroundColor(Color.rgb(250, 249, 245))
    web.settings.apply {
      javaScriptEnabled = true
      allowFileAccess = false
      allowContentAccess = false
      domStorageEnabled = false
      databaseEnabled = false
      javaScriptCanOpenWindowsAutomatically = false
      setSupportMultipleWindows(false)
      setSupportZoom(false)
      builtInZoomControls = false
      displayZoomControls = false
      useWideViewPort = true
      loadWithOverviewMode = true
      mediaPlaybackRequiresUserGesture = true
      mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
      cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
      blockNetworkLoads = true
    }
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
    web.isHorizontalScrollBarEnabled = false
    web.isVerticalScrollBarEnabled = false
    web.setOnLongClickListener { true }
    web.isHapticFeedbackEnabled = false
    web.setDownloadListener { _, _, _, _, _ -> /* No downloads or external handoff. */ }
    web.webChromeClient = object : WebChromeClient() { override fun onPermissionRequest(request: PermissionRequest) { request.deny() } }
    web.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse = serve(request)
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val current = document ?: return true
        return request.url.toString().substringBefore('#') != EpubPreviewFiles.ORIGIN + "/OEBPS/" + current.name
      }
      override fun onPageFinished(view: WebView, url: String) {
        if (root != null && url.startsWith(EpubPreviewFiles.ORIGIN + "/OEBPS/")) onReady(emptyMap<String, Any>())
      }
      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
        if (request.isForMainFrame && root != null) onFailure(emptyMap<String, Any>())
      }
      override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
        stop(); onFailure(emptyMap<String, Any>()); return true
      }
    }
    web.setOnTouchListener { _, event -> gestures.onTouchEvent(event); false }
  }
  fun setRoot(uri: String) { if (uri != rootUri) { stop(); rootUri = uri }; load() }
  fun setDocument(uri: String) { if (uri != documentUri) { stop(); documentUri = uri }; load() }
  private fun load() {
    if (!attached || rootUri.isEmpty() || documentUri.isEmpty()) return
    try {
      val safeRoot = EpubPreviewFiles.root(context.cacheDir, rootUri)
      val page = EpubPreviewFiles.document(safeRoot, documentUri)
      if (root == safeRoot && document == page) return
      root = safeRoot; document = page
      web.onResume()
      web.loadUrl(EpubPreviewFiles.ORIGIN + "/OEBPS/" + page.name)
    } catch (_: Exception) { stop(); onFailure(emptyMap<String, Any>()) }
  }
  private fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))
  private fun serve(request: WebResourceRequest): WebResourceResponse {
    return try {
      val base = root ?: return denied()
      if (request.method != "GET") return denied()
      val file = EpubPreviewFiles.resource(base, request.url) ?: return denied()
      val mime = when (file.extension) { "xhtml" -> "application/xhtml+xml"; "css" -> "text/css"; "js" -> "text/javascript"; "svg" -> "image/svg+xml"; "jpg" -> "image/jpeg"; "png" -> "image/png"; "m4a" -> "audio/mp4"; "mp3" -> "audio/mpeg"; else -> return denied() }
      val header = request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value
      val range = EpubPreviewFiles.range(header, file.length()) ?: return WebResourceResponse("text/plain", "UTF-8", 416, "Range Not Satisfiable", mapOf("Content-Range" to "bytes */${file.length()}"), ByteArrayInputStream(ByteArray(0)))
      val input = file.inputStream(); input.channel.position(range.first)
      val stream = object : FilterInputStream(input) {
        var remaining = range.last - range.first + 1
        override fun read(): Int { if (remaining <= 0) return -1; val b = super.read(); if (b >= 0) remaining--; return b }
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int { if (remaining <= 0) return -1; val n = `in`.read(buffer, offset, minOf(length.toLong(), remaining).toInt()); if (n > 0) remaining -= n; return n }
      }
      val headers = mutableMapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff", "Accept-Ranges" to "bytes", "Content-Length" to (range.last - range.first + 1).toString(), "Content-Security-Policy" to "default-src 'none'; img-src 'self'; media-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
      if (header != null) headers["Content-Range"] = "bytes ${range.first}-${range.last}/${file.length()}"
      WebResourceResponse(mime, if (file.extension in listOf("xhtml", "css", "js", "svg")) "UTF-8" else null, if (header == null) 200 else 206, if (header == null) "OK" else "Partial Content", headers, stream)
    } catch (_: Exception) { denied() }
  }
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val w = minOf(width, (height * 4f / 3f).toInt()); val h = (w * 3f / 4f).toInt()
    web.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
    web.layout((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2)
  }
  private fun stop() { root = null; document = null; web.stopLoading(); web.loadUrl("about:blank"); web.onPause() }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); attached = true; appContext.reactContext?.addLifecycleEventListener(this); load() }
  override fun onDetachedFromWindow() { attached = false; appContext.reactContext?.removeLifecycleEventListener(this); stop(); super.onDetachedFromWindow() }
  override fun onHostPause() { stop() }
  override fun onHostResume() { /* JS revalidates family/account and creates a fresh preview lease. */ }
  override fun onHostDestroy() { stop(); web.destroy() }
}
