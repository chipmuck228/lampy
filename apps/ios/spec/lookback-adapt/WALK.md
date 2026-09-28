# 回看适配走查

实现分支 `ios/lookback-adapt`，基线 `origin/main` `96b03f1`（#38）。#36 已关闭，不续写。家庭入口和个人 Moment 语义未改。没有改 `getLookbackBook` / `getHistoryDay`。

Jest 与本目录截图 **≠** 原生页面 PASS，除非下面写了运行中。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：99 suites / 517 tests
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`
- `git diff --check`：通过

## 库

`scripts/seed-lookback-adapt-library.py` 写入 149 条走查记录，不删 2026-09 个人记录：

- 稀疏：2025 年 4 月只有 8 日
- 远处换日：2023 年 8 月 1–28 日
- 多年密集：2018–2022，每年 1–6 月，每月 4 天

设备：iPhone 16 Simulator / iOS 18.6 / Dev Client。iPad Air 11-inch 已装同一 Client，本轮未进到书页。

## 运行中页面

| 路径 | 结果 |
| --- | --- |
| 多年密集库首次打开书页 | **PASS**（`shots/walk-dense-open.png`）：2026…2018 章节都在，底带仍在 |
| 稀疏月 `lampy:///lookback/2025/04` | **PASS**：只展开 4 月 8 日一行，无安静格（`walk-sparse-month.png`） |
| 稀疏月点 8 日 | **PASS**：摘录「稀疏月一条」+「看这条」（`walk-sparse-excerpt.png`） |
| 远处换日 2023-08 点 1 日 | **PASS**：摘录进视口（`walk-far-day1.png`） |
| 远处换日滚到 28 日 | **PASS**：28 日行在屏上（`walk-far-scrolled.png`） |
| 远处冷日 28 返回书页 | **PASS**：8 月 28 日摘录在视口顶（`walk-far-day28.png`、`walk-far-day28-page.png`） |
| 横屏 iPhone | **PASS**：短高下底带仍在，28 日摘录与 2022 章节可读（`walk-landscape.png`）。按窗口宽高，没有另做一页 |
| iPad 实页 | **NOT VERIFIED**：Client 已装，卡在开发服务器/「在 Lampy 中打开」对话框。1024×1366 Jest 书页通过 |
| VoiceOver 手势 | **NOT VERIFIED**：本 Simulator Features 菜单无 VoiceOver。月/日/看这条的 `accessibilityLabel` 有 Jest |

## 耗时（多年密集库，Metro `[lookback-timing]`）

| 标记 | 实测 |
| --- | --- |
| `book-first-ready` | 401–487 ms |
| `day-excerpts-ready` | 47–54 ms |

没有空等。现有读取接口够用，**不**为此改限量摘录 API。

## 本轮没动

家庭入口、`identityLoopAccepted`、个人 Moment / `occurredAtPrecision` / 最近按 `recordedAt` 分组。留下页仍只能写 `day` / `unknown`。
