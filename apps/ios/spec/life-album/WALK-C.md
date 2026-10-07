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
| 完整 commit SHA | `d48753c2c740531ad98717e098ed61a9fe28afda`（推送后本地 / 远端 / PR head 应一致；若有 SHA 回填提交则以其为准） |
| 探针 | 默认不运行。仅开发态、显式「写入隔离探针」、且身份为合成 `album_eval_window` + `moment_album_eval_*` 时才写 Documents。普通预览成功路径不写 JSON／PDF |

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

**阶段 C 不因缺 Songti 单独阻塞：** isol 已如实记录系统字体回退。衬线层次留作后续视觉工作，不作为本阶段设备 PASS 的否决项。

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
| 放大 | 上一轮「恢复整页」会被 SettingsPage 外层滚动卷走，且 `overflow: hidden` + 嵌套横向 ScrollView 裁切。本轮改为放大时关闭外层滚动、固定「恢复原尺寸」、内容区按放大后宽高滚动。Jest：同页恢复、不自动播。isol 设备因 8081 被其它 `expo run:ios` 占用 **本轮 UI NOT VERIFIED**（未启动 Liuz17） |
| 播放三角→暂停双杠 | **PASS**（合成 `asset_album_eval_sound_long` 8s m4a；AX 变「暂停」；截图见双杠；`playingJson` 重挂载 + 原生 `setNeedsDisplay`） |
| 再点暂停停声 | **PASS**（播放后立刻按「暂停」，AX 回到「一段声音 · 8秒」） |
| 放大点击区域 ≥ 48pt | **PASS**（放大后音频 hit AX `584×80`） |
| 翻页暂停、返回不自动播 | **PASS**（播中翻页再回；AX 非「暂停」） |
| 离开 / 后台暂停、同 Asset 进度保留 | 代码路径在；后台专项 **NOT VERIFIED**（本轮未单独听完后台停声） |
| 本机保护遮挡册名正文 | Jest 盖层 PASS；isol 完整开启后实页验收见 §10 **PASS** |

### 5. 重新生成

**PASS（上一轮保留，本轮 layout v2 再生成仍为改名册 13 页）。** 册名「隔离册 · 改名」、开篇「开篇已改过。」、调序后无旧封面名。

### 总表

| 检查 | 自动化 | 隔离模拟器 | 人工视觉 | 系统 VO |
| --- | --- | --- | --- | --- |
| 整册阅读 | — | PASS（无衬线） | PASS | — |
| 预览/PDF 同版视觉 | — | PASS | PASS | — |
| PDF 字体资源 | null / NOT VERIFIED | 已查：无 Songti；嵌入 unknown | — | — |
| Songti 衬线层次 | diagnose 已记录回退 | 环境无字体；**不单独阻塞 C** | 可见无衬线，后续视觉 | — |
| VoiceOver | Jest 朗读序 PASS | AX PASS | — | NOT VERIFIED |
| 声音播放/图标/暂停/放大 hit | — | 声音 PASS（上一轮）；放大恢复本轮 isol **NOT VERIFIED** | — | — |
| 收进对话框 / 回看册入口 / 新建胶囊 | Jest：加入不创建、遮罩关闭、进 `/albums/new` | isol **NOT VERIFIED** | — | — |
| 后台停声 / 进度保留 | — | NOT VERIFIED | — | — |
| 本机保护盖层（完整开启后） | Jest PASS | **PASS**（见 §10：开启成功后，切换器与认证期间不露册名／纸页；解锁后预览仍可用） | — | — |
| 重新生成 | — | PASS | PASS | — |
| 正式导出/付费 | 未开始 | 未开始 | — | — |
| 阶段 C 设备 PASS | **否**（系统 VoiceOver、PDF 字体嵌入仍 NOT VERIFIED；本机保护实页已 PASS；字体回退已记录、不单独否决） | | | |

### 6. 入口与加入（2026-10-06）

根因（放大）：预览嵌在 `SettingsPage` 的外层 `ScrollView` 里。放大后纸页变高，翻页/恢复按钮滚出视口；舞台 `overflow: 'hidden'` 裁切 `transform: scale`；外层横向、内层纵向在 iOS 上常锁死一个方向。

改动：放大时 `scrollEnabled={false}` 外层；「恢复原尺寸」绝对定位在舞台上、不随正文滚走；舞台按 `420×595 × scale` 可纵向+横向滚动；放大时隐藏翻页；恢复不改 `page`、不重建播放器。不重排分页 / textRange / PDF。

收进对话框：去掉无回调的「新建一册」标签；「加入此册」胶囊只走 `collectAlbumEntry`；已加入显示「已在此册」；真正创建走 `/albums/new`；取消与遮罩关闭不写入。回看入口改 `book.closed.fill` 并与「慢慢看」垂直居中。列表「新建一册」改为淡暖金胶囊，仍进命名页。

isol 本轮 UI：8081 被其它进程占用，未在 isol 热加载本提交 → 入口与放大 **NOT VERIFIED**。系统 VO / PDF 嵌入 / 后台音频 / 完整本机保护仍 **NOT VERIFIED**。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 7. 详情／整理页收紧（2026-10-06）

只改管理页展示与编辑入口。不改分页、textRange、PDF、领域模型，也不替代上一轮放大修复。

**改动：** 默认小封面＋册名＋真实条数＋按日期（非收录顺序）计算的日期范围；突出「看看这一册」。册名／开篇／封面选择收进「编辑册子」，保存仍是显式按钮，取消还原未存稿，无自动保存。封面改为可换行横向选择，带已选标记与 AX 名。记录单列无卡片：图文缩略图＋最多三行摘要＋日期；纯文字不留空缩略图；声音只在真实时长可用时显示时长；多媒介显示张数与声音标识。点击进原记录详情，列表不放假播放键。默认隐藏上移／下移／移出，「整理」后出现并有「完成」。删册进册子菜单。

**自动化：** `npx tsc --noEmit` PASS；Jest manage／use-cases／date-range helpers PASS（12）；eslint 改动 TS PASS。

**isol（`Lampy-guide-isol` / iPhone 17 Pro / iOS 26.5，合成 `album_eval_window`「隔离册 · 改名」）：**

| 项 | 结果 |
| --- | --- |
| 默认浏览 | **PASS**。14条；日期范围 2024年9月3日 — 2024年10月24日（首条仍是 10月24日「这张图很长」，未按日期重排）。「看看这一册」胶囊。无册名输入／开篇／封面选择／每条上移下移移出／删除这一册 |
| 纯文字 | **PASS**。「把杯子洗了。」全宽，无空缩略图 |
| 图文／多媒介／声音 | **PASS**。真实缩略图；长文三行省略；「2张照片」+ 声音 8秒；纯声音行仅日期+8秒；「3张照片」未展开附件。无无作用播放键 |
| 点记录进详情 | **PASS**。点「桌上摊开三张纸」进入原记录（2024年10月2日，大图仍在） |
| 编辑保存／取消、整理排序、移出 | isol 点按未稳定点中「整理／编辑册子」（AX `click at` 落到导航返回或记录行）。**NOT VERIFIED**。Jest：默认隐藏编辑器与上移；整理后出现上移且首条禁用 |
| 缺失媒介占位 | 本册 14 条 moment 均在库中，浏览屏未见「这条已经不在」。未知媒介占位 **NOT VERIFIED**（无该合成条）。代码路径对 unreadable／非图非声资产计 `unknownCount` |
| 横屏／长册名 | 横屏 **NOT VERIFIED**。本册名短，标题两行截断未在本机看到溢出 |

截图：默认浏览 `spec/life-album/shots/isol-c-manage-browse.png`（不入库）。整理模式无可用 isol 截图，不以浏览图冒充。

未启动 Liuz17。8081 上已有本 worktree 的 Metro；本轮为 JS，未再 `expo run:ios --device Liuz17`。

### 8. 真机：封面空白与新建顶栏遮挡（2026-10-06）

根因：管理页封面／缩略图用了库存 `localUri`。`exists` 会经 `resolveUri` 找到重装后的容器路径，Image 仍读旧路径，所以编辑封面是空白色块。新建页顶栏「我的生活册」与「新建一册」挤在一行。

改动：封面候选和列表缩略图改走 `resolveUri`，显示用 `expo-image`。顶栏左右各留弹性空位、标题单行；新建册名全宽并加底边，避免和返回文案叠在一起。

真机复验 **NOT VERIFIED**（本轮未再开 Liuz17）。Jest：resolveUri 修复路径 PASS。

新建页 focus 时 iOS 会把 ScrollView 滚到输入框，册名被顶栏挡住。设置页关闭 `automaticallyAdjustKeyboardInsets`，顶栏下用 `KeyboardAvoidingView`；新建页关闭滚动。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 9. 探针移出普通预览（2026-10-06）

开发版曾在每次预览成功后只凭 `__DEV__` 把完整排版 JSON、PDF、字体探针写入 Documents。个人册也会生成副本；异步探针不随离开／取消／锁定失效。

现改为：默认不运行。仅开发态、操作者点「写入隔离探针」、且册身份为合成夹具 `album_eval_window`（条目均为 `moment_album_eval_*`）时才写入。取消、离开或锁定后，尚未开始的写入不再执行。不是正式导出。

Jest：普通预览不写 JSON／PDF；取消后未开始的探针不写；锁定后不显示探针按钮。系统 VoiceOver、PDF 字体嵌入继续 **NOT VERIFIED**。

### 10. 本机保护实页验收（2026-10-07）

设备：`Lampy-guide-isol`（iPhone 17 Pro / iOS 26.5）。代码 head：`c3ca4fe`。未启动 Liuz17。未开始正式导出／付费。验收后已关闭本机保护，便于后续 isol 使用。

| 步骤 | 结果 |
| --- | --- |
| 本机设置开启「本机保护」并完成 Face ID | **PASS**。状态「已开启」 |
| 打开合成册预览 `album_eval_window` | **PASS**。前台可见「隔离册 · 改名」、第1页／共13页、翻页与「写入隔离探针」 |
| 切后台 → App Switcher | **PASS**。卡片仅为盖层「这台设备已保护」+「进入 Lampy 前…记录还在。」；**不见**册名、纸页正文或页码 |
| 从切换器返回、认证期间 | **PASS**。盖层 + 系统「面容 ID」；**不见**册名与纸页 |
| 认证通过后 | **PASS**。预览仍可用（第1页／共13页、「隔离册 · 改名」、翻页／放大／探针按钮） |

截图（不入库）：`isol-c-lock-press2.png`（已开启）、`isol-c-lock-preview-open.png`、`isol-c-lock-switcher.png`、`isol-c-lock-auth-return.png`、`isol-c-lock-unlocked-preview.png`。

系统 VoiceOver、PDF 字体嵌入继续 **NOT VERIFIED**。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 11. 三项根导航 + 生活册封面墙（2026-10-07）

在 `ios/life-album-layout-preview` 上将「生活册」提升为底带第三根入口；`/albums` 改为根页封面墙 + 轻量引导。不改排版算法、字体、PDF 探针、声音播放器、Moment、schema、本机保护规则。未开始正式导出／付费。

**根页切换契约：** 见 `src/screens/root-nav-switch.ts`。根之间优先 `dismissTo`；最近→回看仍用既有 origin token；生活册不套用该 token；离开回看时关闭目录。

**自动化：** tsc PASS；相关 Jest（root-nav / albums list / cover-wall / collect / catalog）PASS；eslint 改动 TS 仅既有 lookback-chrome warning；`git diff --check` PASS。

**isol（`Lampy-guide-isol`）：**

| 项 | 结果 |
| --- | --- |
| 底带顺序 最近／回看／生活册；sage 当前项；纸色浅顶线 | **PASS** |
| 回看右上重复「我的生活册」已移除 | **PASS**（顶栏仍为「慢慢看」） |
| 生活册封面墙两列；册名+条数；文字封面回退；无 LeaveFab；子页预览无底带 | **PASS** |
| 引导收起后出现「怎么使用」 | **PASS** |
| 深链在三根之间切换 | **PASS**（`lampy://` / `lookback` / `albums`） |
| 收集模式 `?collect=` 横幅仍指向目标册 | **PASS**（正在收进《隔离册 · 改名》） |
| HID 连续点底带两轮位置保留 | 坐标点按不稳 **NOT VERIFIED**；深链切换可用 |
| 引导冷启动持久收起 | **NOT VERIFIED**（本轮未完整复验重启后 SecureStore） |
| 目录打开后切根、播放离开暂停 | **NOT VERIFIED** |
| 短屏／横屏／iPad 底带与列数 | **NOT VERIFIED** |
| 本机保护抽查（新根不绕过） | **NOT VERIFIED**（规则未改；§10 仍有效） |
| VoiceOver 逐册 | **NOT VERIFIED** |

截图不入库：`isol-nav-*.png`。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 12. 选册封面墙 + 宽度／滚动／引导存储（2026-10-07）

在 `ios/life-album-layout-preview` 上：抽出共享封面呈现；「收进生活册」弹层改为封面墙；列表与弹层按容器实测内容宽算列；生活册列表滚动恢复门闩；引导 SecureStore 失败可退化。不改 LeaveFab 参数、RootNavBand 顺序、收集幂等、排版／PDF、本机保护、schema。未开始导出／分享／付费。

**自动化：** `npx tsc --noEmit` PASS；相关 Jest（cover-wall / list / collect-sheet / scroll-restore）PASS（28）；eslint 改动 TS PASS；`git diff --check` PASS。

**isol（`Lampy-guide-isol`）：**

| 项 | 结果 |
| --- | --- |
| 生活册根仍见封面墙两列、册名+条数、文字封面、「怎么使用」、底带三根 | **PASS**（深链／截图抽查；JS 热更后根页可见） |
| 详情「…」→ 选册封面墙（多册、长册名、无／缺失封面） | **NOT VERIFIED**（本轮无可靠 HID／AX 点进详情菜单） |
| 加入成功／失败重试／连点不重复／取消不收入 | **NOT VERIFIED** |
| 多册＋键盘可滚、取消可点；新建后收入路径 | **NOT VERIFIED** |
| 滚到底→详情→返回位置恢复；切根两轮 | **NOT VERIFIED**（Jest 覆盖门闩；设备未复验） |
| 引导收起冷启动；短屏／横屏列数与底带 | **NOT VERIFIED** |
| 回看目录打开后切根、播放离开暂停、收集返回目标册 | **NOT VERIFIED**（规则未改；未本轮重测） |

截图不入库：`isol-sheet-wall-*.png`。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 13. 选册弹层暖纸磨砂外观（2026-10-07）

在 `ios/life-album-layout-preview` 上收紧「收进生活册」弹层视觉：连续圆角外壳、外层轻阴影／内层裁切、暖纸实色（约 96% 填色而非整层 opacity）、背后轻微磨砂＋低透明墨色遮罩。行为（collect 幂等、busy、取消、迟到世代、新建、点外关闭）不变。未开始导出／分享／付费。

**模糊实现：** 复用已链接的 `expo-glass-effect`（`GlassView` + `isLiquidGlassAvailable`）。**未**新增 `expo-blur`（本机 `pod install` 因 hermes/cmake 失败；且项目已有玻璃能力）。Reduce Transparency 开启／查询失败 → 实色纸底＋普通遮罩；运行中偏好变化会更新。无 Liquid Glass 时同样实色回退，不用透明度冒充毛玻璃。

**设备 / 构建：**

| 项 | 实际 |
| --- | --- |
| 模拟器 | `Lampy-guide-isol` UDID `DEB86847-34C6-4ADA-B3C6-9657C897E4E7` |
| 机型 / 系统 | iPhone 17 Pro，iOS 26.5 |
| 原生重建 | **未**为本轮另编；`expo-glass-effect` 已在既有 Dev Client 中 |
| 运行 JS | Metro `8087` 热更本轮 TS；原生玻璃能力依赖既有安装 |

**自动化：** `npx tsc --noEmit` PASS；Jest（collect-sheet / chrome / list）PASS（24）；eslint 改动 TS PASS；`git diff --check` PASS。

**isol：**

| 项 | 结果 |
| --- | --- |
| 多册封面墙＋磨砂背景、边缘柔和、文字清楚 | **真机 PASS**（用户报告；运行 SHA 未确认） |
| 加入／取消／新建；底层不可误点 | **NOT VERIFIED**（不因磨砂 PASS 顺带记过） |
| 多册＋键盘列表可滚、取消可达 | **NOT VERIFIED** |
| Reduce Transparency 开／关实色退路 | **NOT VERIFIED**（Jest 覆盖；设备未切系统设置） |
| 短屏／横屏无越界或底裁 | **NOT VERIFIED** |

截图不入库（若有）：`isol-sheet-frost-*.png`。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 14. 选册底栏 + 新建并收入契约（2026-10-07）

在 `ios/life-album-layout-preview` 上继续「收进生活册」弹层：底部固定「新建一册」(2/3)＋「取消」(1/3)；滚动列表内不再重复新建入口；从选册新建携带可信 `momentId` intent，创建后调用既有 `collectAlbumEntry`；列表新建仅建册。未改封面墙宽度测量、收入幂等／撤回、请求世代、普通册 PDF 探针门控、根导航／LeaveFab／播放器／排版／本机保护。未开始导出／分享／付费。

**契约要点：**
- 选册→新建：`albumCollectCreateHref(momentId)` 发会话 token（`c`）+ `m`；提交文案「创建并加入此册」；成功 Alert 后经可信栈 `back`／`dismissTo` 回详情。
- 列表→新建：无 collect 参数；文案「创建这一册」；成功进该册管理页，不收入任何记录。
- 创建与收入分步：先 `createAlbum` 记下 `albumId`，收入失败可重试同一册；文案区分「册子已建、收入失败」与「记录找不到」。
- 取消／返回：不创建、不收入；消费／遗忘 intent，不接受任意返回 URL。
- Metro：去掉强制 `resolver.nodeModulesPaths`（SDK 52+ Hermes `property is not writable` 踩坑），保留 `@lampy/*` watch／alias。

**设备 / 构建：**

| 项 | 实际 |
| --- | --- |
| 模拟器 | `Lampy-guide-isol` UDID `DEB86847-34C6-4ADA-B3C6-9657C897E4E7` |
| 机型 / 系统 | iPhone 17 Pro，iOS 26.5（Liuz17 未启动） |
| 运行 JS | Metro `8081`；原生未为本轮另编 |

**自动化：** `npx tsc --noEmit` PASS；Jest（collect-sheet / chrome / create-intent / new-screen）PASS（30）；eslint 改动 TS PASS；`git diff --check` PASS。

**isol：**

| 项 | 结果 |
| --- | --- |
| 冷启动／Metro 连上后主页可见（runtime 修复后） | **PASS**（抽查 boot；不替代弹层验收） |
| 多册列表可滚，底栏新建＋取消始终可达 | **真机 PASS**（用户报告；运行 SHA 未确认） |
| 点已有册加入／取消／遮罩 | **NOT VERIFIED**（不因底栏 PASS 顺带记过） |
| 详情→新建→创建并收入→返回；新册含原记录 | **真机 PASS**（用户报告；见 §16；运行 SHA 未确认） |
| 新建中取消，无写入 | **NOT VERIFIED**（Jest 覆盖） |
| 短屏／横屏底栏完整 | **NOT VERIFIED** |
| Reduce Transparency／GlassView 磨砂外观 | **真机 PASS**（用户报告；运行 SHA 未确认；同 §13） |

此前 §1–§12 已验收项不重测。创建并收入真机 PASS 见 §16（用户报告；运行 SHA 未确认）。

截图不入库：`isol-c-footer-*.png`。

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 15. 新建页请求资格 + 部分失败册名（2026-10-07）

在 `ios/life-album-layout-preview` 上收紧 `/albums/new`：提交捕获独立 requestId／intent／momentId／输入；失焦、卸载、`beforeRemove`、来源参数变化作废旧请求；各 await 与成功框「好」前回资格。创建已落库不撤回、不自动删册；失效后不再启动收入／弹框／导航。收入失败保留真实 `albumId`＋`album.name`，册名只读，文案「册子已创建，这条还没有加入」，重试「再试加入」只收入同一本。未改排版、播放器、本机保护、LeaveFab、导出／付费。

**语义：**
| 路径 | 行为 |
| --- | --- |
| 列表新建 | 只 `createAlbum` → 管理页；无收入 |
| 详情／选册新建 | 可信 intent → 创建并收入；成功 Alert 后可信返回 |
| 离开时尚未创建 | 不创建、不导航副作用 |
| 离开时创建已完成 | 不继续收入；册子保留在库 |
| 部分失败 | 只读真实册名；重试同一 `albumId` |

**自动化：** `npx tsc --noEmit` PASS；Jest（new-screen 交错／intent／collect-sheet／request helper）PASS；eslint 改动 TS PASS；`git diff --check` PASS。

**isol：**

| 项 | 结果 |
| --- | --- |
| 详情→新建→创建并加入→返回；原记录在新册、册名正确 | **真机 PASS**（用户报告；见 §16；运行 SHA 未确认） |
| 失败／迟到／换来源不污染新页；提交锁按 requestId 持有 | **自动化 PASS**；设备 **NOT VERIFIED** |
| 底栏／磨砂 | **真机 PASS**（用户报告；运行 SHA 未确认） |

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 16. 新建提交锁归属 + 创建并收入实页（2026-10-07）

提交锁由所属 `requestId` 持有，只有持有者能释放 `savingRef`／`saving`；旧请求结束不得清除新请求的提交中状态。来源切换后 A 等待结束、B 仍保持提交中，再点不会重复创建（Jest）。

**自动化：** `npx tsc --noEmit` PASS；Jest new-screen（含 A→换源→B 锁仍提交中、不重复创建）／request helper PASS；eslint 改动 TS PASS；`git diff --check` PASS。

**isol：**

| 项 | 结果 |
| --- | --- |
| 详情「…」→ 新建一册 → 创建并加入 → 返回原详情；记录已收入 | **真机 PASS**（用户报告 2026-10-07；运行 SHA 未确认） |
| 底栏／磨砂 | 不重测；沿用用户报告真机 PASS（运行 SHA 未确认） |

PR [#65](https://github.com/chipmuck228/lampy/pull/65) 保持 OPEN。不开始 D/E。

### 提交 SHA（推送后）

各次走查对应版本（相对 `origin/main`）：

| 走查 / 改动 | SHA |
| --- | --- |
| 测量预览初稿 | `761e038` |
| 原生模块纳入仓库 | `369d30f` |
| 无 Core Text 失败关闭 | `4d9129c` |
| 请求绑定 + 基线绘制 | `a6ede66` |
| 字体回退事实 + PDF 探针收紧 | `d48753c` / WALK 回填 `ad68fac` |
| 放大恢复与收进 | `9c93c1a` / WALK 回填 `97fd7a8` |
| 详情页收紧 | `bdc1672` / WALK 回填 `ab33914` |
| 真机封面路径 + 新建顶栏 | `6e5595c` |
| 册名 focus 不被顶栏挡住 | `56b8e82` |
| 短册名 CJK 不被 lineHeight 裁切 | `bcb6ccd` |
| 探针移出普通预览 | `ce66e62` / WALK 回填 `c3ca4fe` |
| 本机保护实页验收 | `741bdc1` / WALK 回填 `4b9ef3a` |
| 三项根导航 + 封面墙 | `25467d817e980120d32da9db4e5e04735eae8644` |
| 选册封面墙 + 宽度／滚动／引导 | `db2f1a8f681e15f588dd15e4854ff5f8d5564424` |
| 选册弹层暖纸磨砂外观 | `b815c3ebd3ff9659f4e0bea4b4a8cd15d82cd59f` |
| 选册底栏 + 新建并收入契约 | `b10cfeef92e5e101a7b2c00bc5fc8a0ddf725bdf` |
| 预览媒体 resolveUri 重映射 | `c9e66b697a1acffed31ef276d2a674a95b9d6ec6` |
| 新建页请求资格 + 部分失败册名 | `40c5d91e247170eebe16907824122395bf6b4646` |
| 新建提交锁归属（requestId） | `11bbab1a78433613d15b6558f4d4305489652b00` |
| 创建并收入真机 PASS 记入 WALK | `531488301b5b87516acbfa87a9fba31bd2fc49f3` |

| 项 | 值 |
| --- | --- |
| 本地 / 远端 / PR head | 推送后三者应一致 |
