# 回看适配走查

实现分支 `ios/lookback-adapt`，基线 `origin/main` `96b03f1`（#38）。#36 已关闭，不续写。家庭入口和个人 Moment 语义未改。没有改 `getLookbackBook` / `getHistoryDay`。

Jest 与本目录截图 **≠** 原生页面 PASS，除非下面写了运行中。iPad 实页和 VoiceOver 手势继续标 **NOT VERIFIED**，不得把 Jest 写成 PASS。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：99 suites / 517 tests
- `python3 scripts/seed-lookback-adapt-library.py --self-test`：`self-test ok`
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`
- `git diff --check`：通过

## 夹具隔离

`scripts/seed-lookback-adapt-library.py` **只** 创建或写入文件名必须为 `lookback-adapt.db` 的可丢弃夹具：

- 新文件写入 `lookback_adapt_fixture.token = lookback-adapt-v1`，再 INSERT 149 条走查 Moment
- 已有文件必须已带该身份，且 `moments` 为空，才允许再 INSERT
- 非空库、缺少或身份不符的库、以及任何 `lampy.db`：**先拒绝**
- **禁止 UPDATE** 已有 Moment；固定 ID 冲突即失败，原行不变

隔离靠独立文件 / 可丢弃测试安装，不靠「不删除原记录」。`ownerId` 仍是应用本地身份 `local-user`，否则拷进测试安装后书页读不到这些行。

拷到模拟器时：仅当目标 `Documents/SQLite/lampy.db` **尚不存在** 才把夹具文件复制过去。已有个人安装一律不要跑种子、不要覆盖。

下列实页截图来自本轮早先误写入个人 iPhone 16 安装的库。该安装 **不是** 合法隔离；脚本现在会拒绝再写它。数值只代表当时那台模拟器与那份数据。

夹具内容（仅用于可丢弃库）：

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
| iPad 实页 | **NOT VERIFIED**：Client 已装，卡在开发服务器/「在 Lampy 中打开」对话框。1024×1366 Jest 只覆盖标签/宽度，**不是** 实页 PASS |
| VoiceOver 手势 | **NOT VERIFIED**：本 Simulator Features 菜单无 VoiceOver。月/日/看这条的 `accessibilityLabel` 有 Jest，**不是** 手势 PASS |

## 数据读取完成耗时

正式代码路径里没有耗时标记。下列数字是走查时用外部门表，从开始读到 `getLookbackBook` / `getHistoryDay` **resolve** 的间隔，**不是** 页面已绘制可见。只能代表当时那台 iPhone 16 模拟器及该夹具数据，不能外推。

| 起点 → 终点 | 实测 |
| --- | --- |
| 打开书页 → `getLookbackBook` 返回 | 401–487 ms |
| 点选一日 → `getHistoryDay` 返回 | 47–54 ms |

没有空等。现有读取接口够用，**不**为此改限量摘录 API。

## 本轮没动

家庭入口、`identityLoopAccepted`、个人 Moment / `occurredAtPrecision` / 最近按 `recordedAt` 分组。留下页仍只能写 `day` / `unknown`。
