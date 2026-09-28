# 回看书页 C′ 实现走查

实现 PR #38，基于 `origin/main`（#37 merge `a556a87`）。**没有**从 #36 年页展开分支开发。#36 仍 OPEN。

Jest 与本目录 storyboard **≠** 原生页面 PASS。

## 本机命令（本轮修复后）

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：见实现提交
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`
- `git diff --check`：通过

## 运行中页面

设备：iPhone 16 Simulator / iOS 18.6 / Dev Client `app.lampy.ios`，Metro `127.0.0.1:8081`。库里主要是 **2026 年 9 月**（27 日 11 条、28 日 3 条）。

| 路径 | 结果 |
| --- | --- |
| 冷月深链 `lampy:///lookback/2026/09`：书页、9 月展开、不选日 | **PASS**（`shots/walk-cold-month-3.png`） |
| 冷日深链 `lampy:///lookback/2026/09/27`：现日页，有「返回原来的位置」 | **PASS**（`shots/walk-cold-day.png`） |
| 冷日返回：展开 9 月、选中 27 日、摘录进视口 | **NOT VERIFIED**（本机 `osascript` 无辅助访问，点不到返回） |
| 多年章节滚到目标年 | **NOT VERIFIED**（此库只有 2026，看不出滚动） |
| 密集月快速换日 | **NOT VERIFIED**（点不到日期行） |
| 摘录失败重试 | **NOT VERIFIED**（无法在运行中的 App 注入 `getHistoryDay` 失败；Jest 已覆盖） |
| 最近 → 回看 → 详情 → 返回 | **NOT VERIFIED** |
| 稀疏月选日见摘录 | **NOT VERIFIED** |
| 同日多条：2 条摘录 + N | **NOT VERIFIED**（27 日有 11 条，未点开） |
| 长文 6 行、三图 1 张 | **NOT VERIFIED** |
| 仅声音分点 | **NOT VERIFIED** |
| 三种未确认 | **NOT VERIFIED** |
| 最大字号 | **NOT VERIFIED** |
| 展开/换日/详情返回后的声音 | **NOT VERIFIED** |
| 横屏 | **NOT VERIFIED**（#34） |
| iPad | **NOT VERIFIED**（#34） |
| VoiceOver | **NOT VERIFIED**（#34） |

## 首次读取耗时

冷月打开后约 3 秒内已看到年章节、9 月和两天日期，**没有**明显空等。此库约 14 条 / 1 年，**不够**据此改 application 做限量摘录读取。更密的库若选日明显等待，再加与日页同序、总数仍准的限量摘录接口。

月/年精度：留下页仍只能写 `day` / `unknown`。

## 建议复审时补的点击

Dev Client 已在跑时用 `lampy:///lookback/2026/09`（三斜线）。不要用 `exp+…/--/lookback`。补：冷日返回、换 27/28 日、看这条往返、最大字号。
