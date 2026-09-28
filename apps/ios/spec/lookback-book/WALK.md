# 回看书页 C′ 实现走查

实现 PR #38，基于 `origin/main`（#37 merge `a556a87`）。**没有**从 #36 年页展开分支开发。#36 仍 OPEN。

Jest 与本目录截图 **≠** 原生页面 PASS。下列 PASS 均来自运行中的 Dev Client，或明确写了隔离测试库。

## 本机命令（本轮）

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：90 suites / 500 tests
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`
- `git diff --check`：通过

## 运行中页面

设备：iPhone 16 Simulator / iOS 18.6 / Dev Client `app.lampy.ios`，Metro `127.0.0.1:8081`。此库主要是 **2026 年 9 月**（27 日 11 条、28 日 3 条）。

| 路径 | 结果 |
| --- | --- |
| 冷月深链 `lampy:///lookback/2026/09`：书页、9 月展开、不选日 | **PASS**（`shots/walk-cold-month-3.png`） |
| 冷日深链 `lampy:///lookback/2026/09/27`：现日页，有「返回原来的位置」 | **PASS**（`shots/walk-cold-day.png`） |
| 冷日返回：展开 9 月、选中 27 日、摘录进视口 | **PASS**（`shots/walk-day-back.png`） |
| 冷日 28 返回：选中 28 日、声音摘录进视口且不自动播 | **PASS**（`shots/walk-day28-back.png`） |
| 定位结束后自由操作：收起再展开 9 月，不再拉回 28 日 | **PASS**（`shots/walk-after-locate-reexpand.png`） |
| 密集月换日：展开后点 27 日，见 27 摘录、28 仍在下面 | **PASS**（`shots/walk-switch-27.png`） |
| 详情：书页上的 9 月 27 日记录 → 详情 → 返回书页原日 | **PASS**（`shots/walk-detail.png`、`shots/walk-detail-back.png`） |
| 多年章节滚到目标年 | **隔离测试库 PASS**（`history-use-cases` 写入 2022/2024/2026；`lookback-book-locate` 三年章节滚到 2024）。此设备库只有 2026，**不能**把一年截图记作原生多年 PASS |
| 摘录失败重试 | Jest 已覆盖；运行中未注入 `getHistoryDay` 失败 |
| 最近 → 回看 → 详情 → 返回 | 本轮验了书页 → 详情 → 返回书页。热 `o=` / 底带「最近」仍属 #34 |
| 稀疏月选日见摘录 | **NOT VERIFIED**（此库 9 月是密月） |
| 同日多条：2 条摘录 + N | **PASS**（27 日 2 条 + 「还有 9 条」；28 日 2 条 + 「还有 1 条」） |
| 长文 6 行、三图 1 张 | **NOT VERIFIED**（日页能看到长文，书页摘录未单独量行） |
| 仅声音听音 | **NOT VERIFIED** |
| 换日 / 返回的声音状态 | **PASS（运行中）**：28 日「Same day voice」显示「这段声音暂时找不到了」，不自动播、不误成别条；回到 27 日摘录无播放态；详情往返无自动播。听音本身仍 NOT VERIFIED |
| 三种未确认 | **NOT VERIFIED** |
| 最大字号 | **NOT VERIFIED** |
| 横屏 | **NOT VERIFIED**（#34） |
| iPad | **NOT VERIFIED**（#34） |
| VoiceOver | **NOT VERIFIED**（#34） |

## 首次读取耗时

冷月打开后约 3 秒内已看到年章节、9 月和两天日期，**没有**明显空等。此库约 14 条 / 1 年，**不够**据此改 application 做限量摘录读取。更密的库若选日明显等待，再加与日页同序、总数仍准的限量摘录接口。

月/年精度：留下页仍只能写 `day` / `unknown`。

定位：`locateKey` 在一次 `scrollTo` 后清除。之后的 `onLayout` / 换日 / 收起展开不再拉回旧目标。Jest 覆盖重新布局和手动滚动，不只断言调用过 `scrollTo`。
