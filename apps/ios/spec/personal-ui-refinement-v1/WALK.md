# 个人 MVP 体验精修 v1 · 走查

Base：`origin/main` `6e25227203fc0e9a270cda4f08d81f70ea5d04e4`（#46）。  
Head：本 PR。只改 `apps/ios`。家庭入口关闭。`identityLoopAccepted` 保持 false。未卸 Liuz17，未清个人库。

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（lookback-book / leave-* / account / recent-reading / scaffold / moment-audio-marks / personal-settings-visibility） | **PASS** |
| 本轮 ESLint（新改 UI 文件 + 门控/测试） | **PASS** |
| `src/app/leave.tsx` 全文件 ESLint | 预存 `react-hooks/set-state-in-effect`（`setPreviewBoundId`，main 已有）。本轮未改该 effect |
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
| 最大字号 | **NOT VERIFIED** |
| 至少一种短视口 | **NOT VERIFIED** |
| 真机 Liuz17 | **NOT VERIFIED**（未卸、未清库） |
| 横屏 / iPad | **NOT VERIFIED** |
| VoiceOver 听音 | **NOT VERIFIED**。Jest 与截图不替代听音 |

Jest 和改前截图不替代改后真机听音。回复审请在 Dev Client 连上本分支 Metro 后走最近 / 回看 / 留下 / 本机设置。
