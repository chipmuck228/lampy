package app.lampy.quickactions

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.UUID

/** Launcher actions carry only allowlisted public IDs and an app-private capability. Never notes/paths. */
class LampyQuickActionsModule : Module() {
  private val mailbox = Any()
  private var pending: Map<String, String>? = null
  private fun token(context: Context): String {
    val prefs = context.getSharedPreferences("lampy-public-actions", Context.MODE_PRIVATE)
    return prefs.getString("token", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("token", it).apply() }
  }
  private fun receive(intent: Intent?) {
    val context = appContext.reactContext ?: return
    if (intent?.action != "app.lampy.quick" || intent.getStringExtra("lampyCapability") != token(context)) return
    val id = intent.getStringExtra("lampyPublicAction") ?: return
    intent.removeExtra("lampyPublicAction"); intent.removeExtra("lampyCapability")
    if (id !in listOf("app.lampy.write", "app.lampy.camera", "app.lampy.record", "app.lampy.share")) return
    val action = mapOf("id" to id, "requestId" to UUID.randomUUID().toString())
    synchronized(mailbox) { pending = action }
    sendEvent("onAction", action)
  }
  private fun install() {
    if (Build.VERSION.SDK_INT < 25) return
    val activity = appContext.currentActivity ?: return
    val context = activity.applicationContext
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return
    val chinese = Locale.getDefault().language == "zh"
    val labels = if (chinese) listOf("写下来", "拍一张", "录声音", "介绍 Lampy") else listOf("Write", "Take a photo", "Record a sound", "Share Lampy")
    val ids = listOf("write", "camera", "record", "share")
    val icons = listOf(android.R.drawable.ic_menu_edit, android.R.drawable.ic_menu_camera, android.R.drawable.ic_btn_speak_now, android.R.drawable.ic_menu_share)
    runCatching {
      manager.dynamicShortcuts = ids.mapIndexed { i, id ->
        ShortcutInfo.Builder(context, "app.lampy.$id").setShortLabel(labels[i]).setRank(i)
          .setIcon(Icon.createWithResource(context, icons[i])).setIntent(Intent(context, activity.javaClass).setAction("app.lampy.quick").putExtra("lampyPublicAction", "app.lampy.$id").putExtra("lampyCapability", token(context))).build()
      }
    }
  }
  override fun definition() = ModuleDefinition {
    Name("LampyQuickActions")
    Events("onAction")
    OnCreate { receive(appContext.currentActivity?.intent); install() }
    OnActivityEntersForeground { receive(appContext.currentActivity?.intent); install() }
    OnNewIntent { intent -> receive(intent) }
    Function("consumePending") { synchronized(mailbox) { val value = pending; pending = null; value } }
  }
}
