# 个人 MVP 体验精修 v1 · 走查

Base：`origin/main` `6e25227203fc0e9a270cda4f08d81f70ea5d04e4`（#46）。  
只改 `apps/ios`。家庭入口关闭。`identityLoopAccepted` 保持 false。未卸 Liuz17，未清个人库。

## 真机验收时实际 JS

Liuz17 / iPhone 17 Pro / iOS 26.2 三项关闭项通过时，Metro 应对齐下面这一份 JS。走查记录提交不改 `apps/ios/src`。

| 项 | SHA |
| --- | --- |
| git（含本轮 JS 的提交） | `25e4b6a6430bc9fd99cb798299b1be385a904f4e` |
| `apps/ios/src` SHA256（`.ts` / `.tsx` / `.js` / `.jsx` 路径+内容） | `833594f758ac1f00538e5823b61bfb081e9b7bbead3b47e3108c43258fc5926f` |
| 文件数 | 238 |
| 当时 PR head（走查记录之前） | `a6a56e4b8fbc7db2b7a622183c1e574c62b03824` |

原生仍是已装的 Dev Client（`app.lampy.ios` / Expo 0.1.0）。本轮只热更新 JS，不卸、不重装、不清记录。不以 Jest 代替真机。

## 合并前核对（2026-09-30）

| 项 | 说明 | 结果 |
| --- | --- | --- |
| 范围 | `origin/main...HEAD` 仅 `apps/ios`（58 files） | **PASS** |
| 家庭入口 | `EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 未开；`isFamilyProductEntryOpen` 默认 false | **PASS** |
| `identityLoopAccepted` | 仍为 false，未对真实用户开放 `/family` | **PASS** |
| 诊断页门控 | `/account-diagnostics` 走 `isPersonalSettingsDiagnosticsOpen` | **PASS** |
| GitHub PR #47 | OPEN，`MERGEABLE` / `CLEAN`，base `main` | **PASS** |
| 将合并 JS | `25e4b6a` + src SHA `833594f7…fc5926f` | 无新阻塞 |
| `npx tsc --noEmit` | | **PASS** |
| 相关 Jest | device-lock* / screen-privacy / composer-notice / use-page-metrics / leave-font-scale / leave-screen / leave-image / personal-settings-visibility | **PASS** 10 suites / 59 tests |
| 本轮 ESLint | 关闭项相关文件 0 errors；`leave.tsx` 预存 hooks warnings | **PASS** |
| `git diff --check` | | **PASS** |
| 真机三项关闭项 | Liuz17，见下表 | **PASS**（用户 2026-09-30） |
| 横屏 / iPad / VoiceOver 听音 | 本轮未走 | **不阻塞** 本 PR 关闭项 |
| Bugbot 残留 | 感受/日期折叠与 chevron、阅读页字号 remount 丢滚动、锁定遮罩短屏安全区、新挂载页首次字号若窗口仍旧 | **不阻塞** 已验收的三项；诊断门控与字号回跳已在后续提交里处理 |

未在本轮执行合并。需要合并时再发。

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（lookback-book / leave-* / account / recent-reading / scaffold / moment-audio-marks / personal-settings-visibility / device-lock* / screen-privacy 队列 / use-page-metrics 连续读取 / composer-notice） | **PASS** |
| 本轮 ESLint（新改 UI 文件 + 门控/测试） | **PASS**（0 errors） |
| `src/app/leave.tsx` 全文件 ESLint | 预存 `react-hooks/exhaustive-deps` warnings；另有 `setNoteBoxHeight`：字号变化时丢掉旧测量高度，不重建整页 |
| `git diff --check` | **PASS** |

## 模拟器 / 真机

本轮在已启动的 iPhone 17 Pro 模拟器拍到 **改前**「最近」：仍是文字入口「本机与账户」（`shots/before-recent.png`，当时 Metro 尚未载入本分支 JS）。随后 terminate + 重开落到 Expo Dev Client，系统「在 Lampy 中打开？」挡了自动点按，**没有拿到改后四页的干净实拍**。

改前对照另用已验收帧：`before-lookback.png`（C′ 书页）、`before-leave.png`（留下 + 键盘）。

| 项 | 结果 |
| --- | --- |
| 最近：文字 / 照片+声音+感受 / 同日多条 / 最后一条 | Jest 阅读顺序 + 播放/打开分离 **PASS**。改后画面 **NOT VERIFIED** |
| 回看：展开、换日、详情返回、未确认时间 | Jest C′ / locate / race **PASS**。改后画面 **NOT VERIFIED** |
| 留下：键盘、照片、录音、恢复草稿、移除、保存与失败 | Jest **PASS**。改后画面 / 短屏键盘 **NOT VERIFIED** |
| 设置：保护开关、用户页无调试 | Jest 门控 **PASS**（`isPersonalSettingsDiagnosticsOpen=false` 时无 family/Apple/测试登录）。改后画面 **NOT VERIFIED** |
| 常规字号模拟器走查（改后） | **NOT VERIFIED** |
| 最大字号 | **NOT VERIFIED**（模拟器全页）。真机关闭项见下 |
| 至少一种短视口 | **NOT VERIFIED** |
| 真机 Liuz17 | 关闭项 **PASS**。未卸、未清库 |
| 真机：最近同日省略重复日期，异日保留发生日期 | **PASS**（用户已复测） |
| 真机：最大字号下留下操作按钮本身完整可见可点 | **PASS**（用户已复测） |
| 真机：启动后 Face ID 验证完应回到纸色页面，不能黑屏 | **PASS**（用户，随隐私遮挡一并验收） |
| 真机：隐私遮挡 — 开启保护，切后台再返回；Face ID 全程不露记录，App 切换器也不露内容 | **PASS**（用户 2026-09-30，Liuz17） |
| 真机：权限提示 — 最大字号、相机权限关闭，点拍摄；短提示和完整说明均可操作，仍能写字、返回、保存 | **PASS**（用户 2026-09-30，Liuz17） |
| 真机：字号切换 — 留下页草稿，最大→小→常规，不杀进程；布局稳定，草稿与媒体保留，键盘开合正常 | **PASS**（用户 2026-09-30，Liuz17） |
| 横屏 / iPad | **NOT VERIFIED**，不阻塞关闭项 |
| VoiceOver 听音 | **NOT VERIFIED**。Jest 与截图不替代听音，不阻塞关闭项 |

Jest 和改前截图不替代改后真机听音。四页改后实拍仍缺，不阻塞已验收的三项关闭项。
