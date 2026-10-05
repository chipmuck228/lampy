# 生活册 · 阶段 C 走查

独立分支 `ios/life-album-layout-preview`。不续写 #64。不开始 D 正式导出、系统分享、付费、云端、家庭、AI 或搜索。不清理 Liuz17，不覆盖 TestFlight。隔离实拍不入库。

## 基线

| 项 | 值 |
| --- | --- |
| 起始 `origin/main` | `fa2096b6c4315dbe59ed010e0a73d1669173715e`（#64 普通合并） |
| 提交前相对 head | `a6ede66`；本轮完整 commit 见文末 |
| 原生模块 | `apps/ios/modules/lampy-album-layout`（`measureText` / `AlbumPageView` / `writeProbePdf` / `diagnoseFonts` 共用 `resolveAlbumFont`；预览与 PDF 在 `baselineYPt` `CTLineDraw`） |
| JS 测量双 | `wrapByGlyphWidth` 仅 Jest；生产必须走 Core Text |
| 缓存 | 进程内 `Map`；`layoutVersion` 现为 **`album-a5-v2`**（字体解析规则变更会使旧断行缓存失效） |
| 字体目标 | 衬线 `Songti SC`（album-serif），UI `PingFang SC`（album-ui）。**以设备 `diagnoseFonts` 实际解析为准，不得在系统回退后仍宣称 Songti** |
| Unicode | 全链路 `unicode-scalar` |

## 技术选择

1. iOS Core Text `CTTypesetterSuggestLineBreak` 输出字形行宽、行高与 Unicode scalar 起止。
2. 最小 Expo Module；autolinking `nativeModulesDir = ./modules`。
3. 字体与媒体本机处理；不下载字体、不引入许可不明字体。
4. 预览与 PDF 探针读同一份 `AlbumLayout`；设备文字由 `AlbumPageView` 在 **`baselineYPt`** 绘制（正号，UIKit 未翻转）。
5. 页面在 `getUseCases()` 前捕获 seq + signal；`cancelAlbumLayout(requestId)` 只作废所属请求。
6. PDF：`/FontFile` 字节扫描只称**初步探测**。须查 `/Font`、`/BaseFont`、`/FontFile`/`/FontFile2`/`/FontFile3`。不能可靠判定时 `fontsEmbedded = null` → verdict **NOT VERIFIED**。嵌入事实与字体许可是两件事。

## 产品接入

- 管理页有收入后「看看这一册」→ `/albums/:id/preview`
- 声音点击才播；翻页 / 离开 / 后台暂停
- 本机保护未解锁不读个人来源；页面不查 SQLite

---

## 本轮隔离走查（2026-10-05 / 06）

只开 `Lampy-guide-isol`。合成库。未开始正式导出或付费。本轮代码与走查**不**记到 `a6ede66`。

### 设备 / 构建 / 指纹

| 项 | 实际 |
| --- | --- |
| 模拟器 | `Lampy-guide-isol` UDID `DEB86847-34C6-4ADA-B3C6-9657C897E4E7` |
| 机型 / 系统 | iPhone 17 Pro，iOS 26.5（Liuz17 未启动） |
| Bundle | `app.lampy.ios` |
| 原生构建 | `xcodebuild` + `expo run:ios` **Build Succeeded**；`Lampy.app` mtime `2026-10-06 00:14:34`；`LampyAlbumLayoutModule.o` 同轮编入 |
| 推送前 base | `a6ede66e0e96c577497e1de01c5c339fa9cdadaf` |
| 走查 JS／模块 SHA-256 | `life-album-preview-screen.tsx` `76683b96…e752`；`album-preview-speech.ts` `d3dd8243…25ff`；`album-layout.ts` `73551342…8ec8`；`album-paginate.ts` `1d786bb7…edf3`；`album-pdf-probe.ts` `2d3bc357…6487`；`lampy-album-layout/index.ts` `fbead984…e17a` |
| 上述拼接 SHA-256 | `16975a75ed9be48611af7186392a74986033ce3811f271be5f8ade294c1d7c61` |
| Swift SHA-256 | `LampyAlbumLayoutModule.swift` `18c2c0d9ea7c813abcf4213cd8015d5521af298404d5c0390aeacf0d0263ceb1` |
| 完整 commit SHA | 见文末（推送后本地 / 远端 / PR head 应一致） |
| 探针 | `__DEV__` `isol-album-c-layout.json` / `isol-album-c-fonts.json` / `isol-album-c-probe.pdf` / `isol-album-c-probe-meta.json` |

### 自动化

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（layout / unicode / pdf-probe / preview-speech / preview-screen / device-lock） | PASS（59） |
| eslint 改动 TS | PASS |
| `git diff --check` | PASS |

### 字体回退根因与实际字体

**根因（本 isol 模拟器）：** `diagnoseFonts` 显示系统**没有** Songti / STSong 族。`availableRelatedFamilies` 仅有 `PingFang HK/MO/SC/TC`。请求 `Songti SC` 时 `usedSystemFallback: true`，解析为 `.AppleSystemUIFont` / `.SFUI-Regular`。Core Text 跑样「字Aa.，😀」时实际 run 字体为 `.PingFangUITextSC-Regular`（CJK）、`.SFUI-Regular`（拉丁）、`.AppleColorEmojiUI`（emoji）。

**PingFang SC（UI）** 解析成功：`PingFangSC-Regular` / `matchedRequestedFamily: true`。

**未静默宣称 Songti：** layout `fontFaces.resolvedSerif` 写入真实 `familyName`/`fontName`/`usedSystemFallback`。排版版本升为 `album-a5-v2`。测量 / 预览 / PDF 共用 `resolveAlbumFont`。

**备选（未在本轮实施）：**

1. 在**实机**（含 Songti SC）复跑 `diagnoseFonts` 与整册对照，才能验收衬线层次。
2. 若产品必须在无 Songti 环境也保持衬线：需另选**许可明确**的可嵌入中文衬线，并更新版式版本与许可文案——本轮不引入来源不明字体。

### 1. 整册阅读（字体变更后）

**视觉 PASS（无衬线层次）。** 封面到收尾 13 页（改名后册）；中英标点 emoji、跨页「续」、长图、缺失媒介句均正向在页内。标题/正文在本机为无衬线（见上），**不能**记为 Songti 层次 PASS。

### 2. 预览／PDF 对照

| 项 | 结果 |
| --- | --- |
| 人工视觉（断行、基线、图框、缺失提示、跨页） | PASS（同份 `AlbumLayout`；封面图在资产路径修好后可见） |
| 程序 `boxes` 逐框 | 仍为 `false` → verdict **NOT VERIFIED**（不为 PASS 降低条件） |
| `/FontFile` 初步扫描 | `preliminaryFontFileScan: true`（仅关键字；另见 `/FontFile`×7、`/FontFile2`×4） |
| `fontsEmbedded` | `null`（unknown） |
| PDF `fontResources` | 多数 `embedStream: unknown`；一例 `FontFile2`（`.SFUI-Regular`）。**不能**据关键字声称全部已嵌入 |
| PDF `/BaseFont` | PingFang UI/SC、SF UI、CJKSymbolsFallback、AppleColorEmoji — **无 Songti/STSong**，与 diagnose 一致 |

### 3. VoiceOver

| 项 | 结果 |
| --- | --- |
| 实现（绘图层隐藏、朗读层按块、audio 不重复） | Jest + 既有 AX 顺序 **AX PASS** |
| 本轮系统 VoiceOver 引擎 | **NOT VERIFIED**（本环境未能开启系统 VO；不用 Jest/AX 树冒充） |

### 4. 声音与保护

| 项 | 结果 |
| --- | --- |
| 放大 | PASS（「恢复整页」、不重排） |
| 播放三角→暂停双杠 | **PASS**（合成 `asset_album_eval_sound_long` 8s m4a；AX 变「暂停」；截图见双杠；`playingJson` 重挂载 + 原生 `setNeedsDisplay`） |
| 再点暂停停声 | **PASS**（播放后立刻按「暂停」，AX 回到「一段声音 · 8秒」） |
| 放大点击区域 ≥ 48pt | **PASS**（放大后音频 hit AX `584×80`） |
| 翻页暂停、返回不自动播 | **PASS**（播中翻页再回；AX 非「暂停」） |
| 离开 / 后台暂停、同 Asset 进度保留 | 代码路径在；后台专项 **NOT VERIFIED**（本轮未单独听完后台停声） |
| 本机保护遮挡册名正文 | Jest 盖层 PASS；开启流程弹出系统密码页时界面被系统遮挡（无册名/正文露出）**部分证据**；因认证未完成开关仍为「未开启」，后台返回盖层 **NOT VERIFIED**（未改保护规则） |

### 5. 重新生成

**PASS（上一轮保留，本轮 layout v2 再生成仍为改名册 13 页）。** 册名「隔离册 · 改名」、开篇「开篇已改过。」、调序后无旧封面名。

### 总表

| 检查 | 自动化 | 隔离模拟器 | 人工视觉 | 系统 VO |
| --- | --- | --- | --- | --- |
| 整册阅读 | — | PASS（无衬线） | PASS | — |
| 预览/PDF 同版视觉 | — | PASS | PASS | — |
| PDF 字体资源 | null / NOT VERIFIED | 已查：无 Songti；嵌入 unknown | — | — |
| Songti 衬线层次 | diagnose 记录回退 | **FAIL 环境无字体** | 可见无衬线 | — |
| VoiceOver | Jest 朗读序 PASS | AX PASS | — | NOT VERIFIED |
| 声音播放/图标/暂停/放大 hit | — | PASS | PASS | — |
| 后台停声 / 进度保留 | — | NOT VERIFIED | — | — |
| 本机保护盖层（完整开启后） | Jest PASS | 认证遮挡有证据；完整开启后后台盖层 NOT VERIFIED | — | — |
| 重新生成 | — | PASS | PASS | — |
| 正式导出/付费 | 未开始 | 未开始 | — | — |
| 阶段 C 设备 PASS | **否**（缺 Songti 环境 + 系统 VO + 完整本机保护） | | | |

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 提交 SHA（推送后）

| 项 | 值 |
| --- | --- |
| 完整 commit | （`git rev-parse HEAD` 推送后填入） |
| 本地 / 远端 / PR head | 推送后三者应一致 |
