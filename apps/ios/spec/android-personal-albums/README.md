# Android 个人生活册

基于 main `f78fe6ed50a1c53880e344959c855b0c30816dae`（PR #136）。沿用 Expo SDK 57 / RN 0.86.3，不改已有目录或数据库 schema。

## 本阶段闭环

从主导航“生活册”或本机设置“我的生活册”进入；创建册子，从记录详情“收进生活册”或册内选取记录；预览纸页，切换连续阅读；退出后重新进入或重启应用时恢复连续阅读的位置与纸色。创建、收录、排序、移出、删册、来源记录保全继续使用共享实现。

Android 入口仅在新原生二进制同时具备文字测量与纸页 View 时开放。旧开发安装包即使加载了新 JS，仍隐藏不可用入口并保护对应路由；需要重新编译原生包。家庭、付费、打印、PDF/EPUB 导出保持关闭。

## Android 排版

本地 Expo 模块 `LampyAlbumLayout` 新增 Android 注册、Kotlin `StaticLayout` 文本测量与 `Canvas` 纸页 View。仍使用共享分页、内容保全和点击音频覆盖层。

- JS 与 Kotlin 使用 Unicode code point/scalar 索引；不把 UTF-16 下标直接当文字范围。测量与绘制共用 TextPaint / StaticLayout，覆盖中文、英文、换行及 emoji。
- 使用 Android 系统 serif / sans-serif 和设备 CJK/emoji fallback；不复制 Apple 字体，也不承诺与 iOS 逐行同版。
- 纸页按共享 A5 逻辑坐标缩放，支持纸色、照片白边、感受色、页码、来源/媒体缺失提示与播放图形。
- 仅解码当前页所需本机照片，在后台线程按最长边不超过 1600 的采样目标解码并修正 EXIF 方向。不请求网络、不缓存全册原图，换页/卸载取消旧工作并清除旧图，异步结果检查页面代次。
- 连续阅读直接复用 React Native / expo-image，不依赖纸页栅格化。阅读状态通过原有 SecureStore 序列化保存，包含内容指纹、宽度、纸色和记录锚点。滚动后 500ms 防抖保存；离页与切后台立即发起保存。内容或宽度变化时按记录锚点恢复，不强用旧像素偏移。

## 构建与检查

先确认 `java -version` 与 Gradle JVM 为 **21**；新版 Android Studio 自带 JBR 可能是 25，不能直接假设其版本合适。

```bash
cd apps/ios
npm ci
npm run test:android
npx tsc --noEmit
npm run android:prebuild
npm run android:release
```

无需重新设置个人/家庭环境变量，专用启动器继续强制关闭家庭与付费。模拟器启动并设置系统 PIN 后才能验收本机保护。

原生测试：

```bash
cd android
./gradlew :lampy-album-layout:testDebugUnitTest --no-daemon --max-workers=2
```

Robolectric 测试真实 Android 文本布局和 Canvas：长中英文、组合 emoji、空行、scalar 范围连续性、宽窄页面、纸色、照片白边及音频图形。CI 同时编译 arm64 APK；这些不能替代屏幕视觉与触控验收。

## 模拟器人工验收

1. 从最新原生 Release 包启动，出现生活册；家庭、付费与导出仍不出现。
2. 新建一册并填写开场白。收进文字、照片、录音和 emoji 记录；重复收录不增加副本，记录原件不被改写。
3. 打开“看看这一册”连续阅读；正文、照片、声音、日期和感受完整；点击播放/暂停，切后台停止播放。
4. 点击“看纸页”：封面、开场、长段跨页、照片与声音排版正常，前后翻页、放大和返回正常。
5. 素纸/手作切换正常；连续阅读滚到中间，返回/重新进入，以及完全退出应用重开，恢复位置和纸色。
6. 更改册内内容或旋转屏幕后，恢复到对应记录附近，不跳到错位内容。删除册子不删除个人记录。
7. 开启本机保护后，阅读期间切后台或取消系统认证时不露出册内内容，认证后可继续。

真机、系统回收、覆盖升级及大册容量压力仍需后续验收。阅读位置最多存在正常滚动保存防抖窗口；系统直接杀进程时不能保证尚未落盘的最新滚动事件。
