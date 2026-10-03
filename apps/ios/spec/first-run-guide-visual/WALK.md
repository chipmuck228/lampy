# 首次使用三屏引导 · 走查

Base：合并 #60 后的 `origin/main`。分支 `ios/first-run-guide-visual`。只改本轮 `apps/ios`。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

本轮在 `a2acdc7` 的测量／安全区／翻页／前台动画规则之上，落实字体层次、右侧留白、照片与文案块淡入，以及「一杯咖啡，一段午后。」

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| 相关 Jest（overlay / first-run / Gate / Guide / brand / Scene / store） | **PASS** 15 suites / 54 tests |
| 本轮 ESLint（overlay + first-run + guide） | **PASS** 0 errors |
| `git diff --check`（本轮改动文件） | **PASS** |
| 全量 `tsc --noEmit` | 在**同一提交的干净 checkout**跑，结果写在环境记录 D。工作树里未跟踪的 `apps/ios/app/` 未删；**不得**把 `src/` 无报错写成全量 PASS |

## 字体来源

随包子集，运行时不下载。只给首次引导 `Font.loadAsync`。许可 SIL OFL 1.1，见 `apps/ios/assets/fonts/first-run/`。

| 用途 | 家族 | 文件 | 运行字号 |
| --- | --- | --- | --- |
| 标题、照片短句 | Noto Serif SC Medium | `NotoSerifSC-Medium.ttf` | 标题 31 / 45，短屏 28 / 40；短句 12 / 18 |
| 解释、操作 | Noto Sans SC Regular | `NotoSansSC-Regular.ttf` | 解释 16 / 27 |
| 顶栏 Lampy | DM Sans SemiBold | `DMSans-SemiBold.ttf` | 20 / 600 |

加载失败时标题回退 Songti SC，其余用系统无衬线。不替换 App 其余界面。

## 自动化（Jest）

| 项 | 结果 |
| --- | --- |
| 空库未完成才展示；已有记录 / 读库失败 / 已完成跳过 | **PASS** |
| 前两屏继续不写完成；最后「留下瞬间」才 finish | **PASS** |
| 返回上一屏 | **PASS**（Jest） |
| 长正文按屏幕 ID 记住高度 | **PASS** |
| 写真列窄于照片；竖屏约 82% | **PASS** |
| 照片 pending 不开淡入；loaded / failed 才进入 | **PASS** |
| 只在 AppState=active 且未开 Reduce Motion 时启动页动画 | **PASS** |
| 中断动画恢复 opacity=1、位移=0 | **PASS** |
| 文案「一杯咖啡，一段午后。」；无「一段咖啡」 | **PASS** |
| 无「不必翻找」「进入 Lampy」「自己的生活记录」 | **PASS** |

## 隔离走查

`Lampy-pr61-type`（`C2EAF995-665F-446B-8291-F074FDDD5D89`，iPhone 16 / iOS 18.6）。Metro `127.0.0.1:8086`，不广播真机。未卸 Liuz17。

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 三屏最终画面 | **PASS** `type-s1.png` / `type-s2.png` / `type-s3.png`。标题墨色 + sage 整短语，解释 16pt，右侧留白，短线段进度，顶栏图标+Lampy，第一屏短句「一杯咖啡，一段午后。」 |
| 2 | 翻页淡入（视频） | **待复核** `type-fade.mp4`。这是环境记录 A，不能用来关闭「三屏瞬间完整、没有可感知淡入」。中间帧见 `type-fade-mid.png`。该次走查夹了 Expo Refreshing，且未按屏核对到位后的连续帧 |
| 3 | 上一屏 | Jest **PASS**。模拟器点按多次打到滚动区或连点完成，**未拍到返回后的第一屏**，记 **NOT VERIFIED** |
| 4 | 最后完成且不重播 | **PASS**。`type-after-finish.png` 落到留下页；再开 `type-relaunch.png` 是「刚刚留下的生活」，没有重播三屏 |
| 5 | 短屏长正文滚动 | SE 第一屏 `se-type-s1.png` 标题、解释、继续都在屏内，**未见内滚**。定稿文案在 SE 竖屏装得下 |
| 6 | 真机 / VoiceOver | **NOT VERIFIED** |

## 环境记录 B · 入场资格修复后的冷启动

未改系统 Reduce Motion。未以 Metro Refresh 代替冷启动。未卸 Liuz17，未点「留下瞬间」。

| 项 | 值 |
| --- | --- |
| 设备 | `Lampy-pr61-fade-gate` `60DCCC9B-3592-45CF-A376-B92E15C66B68`，iPhone 16 / iOS 18.6 |
| Metro | pid 60159，cwd `/Users/zhen/WeChatProjects/lampy-first-run-guide/apps/ios`，`127.0.0.1:8086`，`EXPO_ROUTER_APP_ROOT` 指向该工作树 `src/app` |
| Reduce Motion | 模拟器 `com.apple.Accessibility ReduceMotionEnabled` **0**（读取，未为验收改偏好） |
| 视频 | 冷启动 1→2：`fade-gate-clean.mp4`。点继续 2→3：`fade-gate-s3-enter.mp4` |

| 屏 | 结论 | 连续帧 |
| --- | --- | --- |
| 第一屏 | **待复核**。品牌层下一帧已是完整咖啡照和文案（`fade-gate-c086.png` → `fade-gate-c087.png` / `fade-gate-clean-s1.png`）。12fps 没有入场中间帧。入场很可能在品牌层下面已经播完，用户看见的仍是瞬间完整 | 冷启动 `fade-gate-clean.mp4` |
| 第二屏 | **可感知淡入**。分页到位后先只有顶栏、进度和「继续 / 上一屏」（`fade-gate-c151.png`），照片再起来（`c157`），文案更晚（`c159` → `c161` / `fade-gate-clean-s2.png`） | 同上 |
| 第三屏 | **可感知淡入**。到位后先空内容、按钮可用（`fade-gate-e014.png`），照片先淡（`e018`），文案晚一截（`e021` → `fade-gate-s3-now.png`） | `fade-gate-s3-enter.mp4` |

Jest 本轮补了：偏好延迟返回时第一屏不先完整再归零；目标图已加载但分页未到位不消耗入场；快速翻页旧回调不影响新屏。Reduce Motion 开启 / 查询失败 / 字体超时走 `show`，由 `firstRunShouldPlayEnter` 单测覆盖。

## 环境记录 C · 启动交接（本轮）

审阅基线 `6026372f95979c26ae7f3a1f4a0707167fab7f9d`。未卸 Liuz17，未点「留下瞬间」，未以 Metro Refresh 代替冷启动。

### 启动遮挡顺序

首次引导 Gate=`show` 时只挂 `FirstRunGuide`，不挂 Stack，因此 JS `StartupBrandLayer` **不会出现**。挡住第一屏的是原生 `SplashScreen`（Dev Client 冷启动还会叠 Expo Downloading 条）。`AppState=active` 和 `onLayout` 不能当作「用户已经看见页面」。

准备好后（布局 + 图片/字体就绪或失败兜底）普通模式仍保持 opacity=0，再走同一条 `requestStartupOverlayExit`：`hideAsync` → 下一次绘制 → `exited`/`failed`。`_layout` 的 4s 兜底和品牌层退场共用这条路径，不另开猜测等待。Reduce Motion 开启或查询失败直接完整显示并正常请求退场。

### 隔离走查

| 项 | 值 |
| --- | --- |
| 设备 | `Lampy-pr61-fade-gate` `60DCCC9B-3592-45CF-A376-B92E15C66B68`，iPhone 16 / iOS 18.6 |
| Metro | pid 60159，工作树 `apps/ios`，`127.0.0.1:8086`，`EXPO_ROUTER_APP_ROOT` 指向该树 `src/app` |
| Reduce Motion | 模拟器读取为 **0**，未改偏好 |
| 冷启动视频 | `handoff-cold.mp4`。`ffprobe` 平均约 **7.02 fps**（487 帧 / 69.4s）。按 10fps 抽帧**不会增加实际帧**，只是重复已有画面，**不是**高帧率录制 |
| 第一屏连续帧 | `handoff-c1-overlay.png` → `c2-overlay-left.png` → `c3-photo-start.png` → `c4-photo-copy.png` → `c5-copy-rising.png` → `c6-solid.png` |

| 屏 | 结论 | 证据 |
| --- | --- | --- |
| 第一屏 | **可感知淡入**。遮挡（原生 splash / Downloading 标）退场后，先只剩顶栏、进度和「继续」（`c2`），照片先起（`c3`），文案更晚、更淡（`c4`→`c5`），再到完整（`c6`） | `handoff-cold.mp4` |
| 第二屏 | **抽查无回归**。花朵页、上一屏、继续都在 | `handoff-s2-spot.png` / `handoff-after-continue2.png` |
| 第三屏 | **抽查无回归**。植物灯页，「留下瞬间」未点 | `handoff-s3-spot.png` |
| 上一屏 | **PASS**。第二屏实际点按后回到咖啡第一屏，无「上一屏」按钮 | `handoff-after-back.png` |

Jest 当时补了：遮挡未退场第一屏不入场；退场只 hide 一次；Reduce Motion 直接 `show`；卸载后迟到退场回调不启动动画。第二、第三屏仍走目标分页到位后入场。

**C 的「失败/超时按已离开」已废。** `failed` 只表示 hide 调用失败或超时，**不表示**原生遮挡已经消失。收口见环境记录 D。

### 结论分层（C）

| 来源 | 结论 |
| --- | --- |
| 模拟器观察 | 第一屏在原生 splash / Downloading 退场后可感知淡入；上一屏点按回到第一屏 |
| 自动化 | 交接资格与单次 hide 的 Jest **PASS**。当时把 `failed` 当成已离开，D 已改 |
| 真机 | **NOT VERIFIED** |

## 环境记录 D · 失败重试与闭环（本轮）

审阅基线 `a484adee71b7ec0da446957a4a5e4bb35f8803f3`。未卸 Liuz17，未改字体／文案／配色／动画时长，未上传 TestFlight，PR 保持 OPEN。

### 退场失败

`failed` = hide 调用失败或超时，不是「遮挡已经没了」。内容兜底完整显示（`firstRunShouldPlayEnter` → `show`）。同一条 `inFlight` 里立刻再试一次（`STARTUP_OVERLAY_MAX_ATTEMPTS = 2`），并发请求仍合并；两次都失败后不再请求。迟到的 hide 结果不得覆盖较新 generation。正常成功路径仍只 hide 一次，不增加等待。本机保护规则未改。

Jest：**首次 hide 失败后重试成功**、**连续失败停在 failed**、**两次超时**、**挂起后迟到的第一次完成不打断重试**、**两次失败后迟到完成保持 failed**。

### 隔离闭环

| 项 | 值 |
| --- | --- |
| 设备 | `Lampy-pr61-fade-gate` `60DCCC9B-3592-45CF-A376-B92E15C66B68`，iPhone 16 / iOS 18.6 |
| Metro | pid 60159，工作树 `apps/ios`，`127.0.0.1:8086` |
| 闭环视频 | `shots/closeout-d/loop.mp4`。`ffprobe` 平均约 **25.3 fps**（415 帧 / 16.4s）。按 10fps 抽 `s1-frames` 是**抽稀**，不是补帧，也不是高帧率宣称 |

| # | 项 | 模拟器观察 | 自动化 | 真机 |
| --- | --- | --- | --- | --- |
| 1 | Reduce Motion 开启 | **PASS**。冷启动约 3s / 4.5s 都是完整第一屏，无空内容等待淡入。`closeout-d/rm-on-t3.png` | Jest：`pref: on` → `show` | **NOT VERIFIED** |
| 2 | 冷启动第一屏淡入 | **PASS**。splash → Downloading → 先顶栏/进度/继续（`d-c3`）→ 照片文案一起淡入（`d-c4`→`d-c5`）→ 完整（`d-c6` / `s1.png`） | overlay / enter 单测 | **NOT VERIFIED** |
| 3 | 第二屏 → 第三屏 | **PASS** `s2.png` / `s3.png` | Jest 翻页 | **NOT VERIFIED** |
| 4 | 上一屏 → 再回第三屏 | **PASS**。`after-back.png` 花朵第二屏；`s3-again.png` 再回植物灯第三屏 | Jest 上一屏 | **NOT VERIFIED** |
| 5 | 留下瞬间 → 重开不重播 | **PASS**。`after-finish.png` 落到留下页（`leaveHref('recent')`）；再开 `relaunch.png` 是「刚刚留下的生活」，无三屏 | Jest 完成标记 | **NOT VERIFIED** |

闭环后把 Reduce Motion 写回 **0**。未改本机保护开关。

### 旧路径抽查（共享 overlay）

| 项 | 结果 |
| --- | --- |
| 已完成引导、空库再启动 | **PASS**。fade-gate 重开与 `Lampy-pr61-back` 都进 Recent，不是三屏；原生 splash 有离开。back 上叠了 Expo Dev Menu，不是我们的遮挡 |
| 已有记录用户启动 | **NOT VERIFIED**。`Lampy-recent-b-isol` 库里有 6 条，但该机 Dev Client 停在旧包 `192.168.31.139:8083` 启动器，未改它的打包地址，也未往库里写记录。决策分支仍由 Jest `has-records` 覆盖 |
| 本机保护开启时的遮挡 | **NOT VERIFIED**。隔离机未开保护，本轮不改保护规则。锁遮挡仍是 JS `DeviceLockProvider`，不是原生 splash |

### 干净 checkout 的 `tsc`

提交后在干净 worktree 跑 `npx tsc --noEmit`，结果填下面。当前工作树未跟踪的 `apps/ios/app/` 未删除，那 177 条找不到 `../screens/*` **不算**这次全量结果。

| 项 | 结果 |
| --- | --- |
| 干净 checkout `tsc --noEmit` | **PASS**（exit 0，无输出）。预检树 = `a484ade` + 本轮源文件，无未跟踪 `apps/ios/app/`。工作树里的 `app/` 未删 |

## 仍需验证

- 短屏在正文真正溢出时的内滚（当前文案未溢出）。**NOT VERIFIED**
- 原生 VoiceOver。**NOT VERIFIED**
- 真机三屏、真机 Reduce Motion、真机 hide 失败（Liuz17 已有记录，不应为验收清库）。**NOT VERIFIED**
- 已有记录用户加载本 PR 包后的启动遮挡。**NOT VERIFIED**
- 本机保护开启时的 JS 遮挡（隔离机未开）。**NOT VERIFIED**
- 查询一直不返回的真机超时（Jest 有资格分支，隔离机查询立刻返回）。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `98e0fb6247ec672f916e7450bff0872847366a04` |
| 测量／安全区基线 | `a2acdc7f640052baaa42822b85e4f98ed1424365` |
| 审阅 SHA | `a484adee71b7ec0da446957a4a5e4bb35f8803f3` |
| 实现 SHA | 推送后以 GitHub 为准 |
| PR | https://github.com/chipmuck228/lampy/pull/61 （保持 OPEN） |
