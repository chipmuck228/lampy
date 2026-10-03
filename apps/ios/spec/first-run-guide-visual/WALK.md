# 首次使用三屏引导 · 走查

Base：合并 #60 后的 `origin/main`。分支 `ios/first-run-guide-visual`。只改本轮 `apps/ios`。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

本轮在 `a2acdc7` 的测量／安全区／翻页／前台动画规则之上，落实字体层次、右侧留白、照片与文案块淡入，以及「一杯咖啡，一段午后。」

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| 相关 Jest（first-run 决策、Gate、Guide、Scene、motion、enter、layout、scroll） | **PASS** 29 |
| 本轮 ESLint | **PASS** 0 errors |
| `git diff --check`（本轮改动文件） | **PASS** |
| 全量 `tsc --noEmit` | 工作树未跟踪的 `apps/ios/app/` 仍会报找不到 `../screens/*`，不是本轮改动 |

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

## 仍需验证

- 第一屏在品牌层揭开之后的用户可见淡入（本轮冷启动未见）。
- 模拟器「上一屏」点按（Jest 已覆盖）。
- 短屏在正文真正溢出时的内滚（当前文案未溢出）。
- 原生 VoiceOver。
- 真机三屏与 Reduce Motion（Liuz17 已有记录，不应为验收清库）。
- 查询一直不返回的真机超时（Jest 有资格分支，隔离机本次查询立刻返回 0）。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `98e0fb6247ec672f916e7450bff0872847366a04` |
| 测量／安全区基线 | `a2acdc7f640052baaa42822b85e4f98ed1424365` |
| 实现 SHA | 推送后以 GitHub 为准 |
| PR | https://github.com/chipmuck228/lampy/pull/61 （保持 OPEN） |
