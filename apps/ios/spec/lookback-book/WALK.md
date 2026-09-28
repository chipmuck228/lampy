# 回看书页 C′ 实现走查

实现 PR #38，基于 `origin/main`（#37 merge `a556a87`）。**没有**从 #36 年页展开分支开发。#36 仍 OPEN。

Jest 与本目录截图 **≠** 原生页面 PASS。下列 PASS 均来自运行中的 Dev Client，或明确写了隔离测试库。

## 本机命令（本轮）

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：96 suites / 510 tests
- `npx expo lint`：3 errors，均在既有 `leave.tsx` / `share/[id].tsx`
- `git diff --check`：通过

## 运行中页面

设备：iPhone 16 Simulator / iOS 18.6 / Dev Client `app.lampy.ios`，Metro `127.0.0.1:8081`。此库主要是 **2026 年 9 月**（25 日走查 2 条、27 日 11 条、28 日 3 条），另有 repository 写入的三种未确认各 1 条。

| 路径 | 结果 |
| --- | --- |
| 冷月深链 `lampy:///lookback/2026/09`：书页、9 月展开、不选日 | **PASS**（`shots/walk-cold-month-3.png`） |
| 冷日深链 `lampy:///lookback/2026/09/27`：现日页，有「返回原来的位置」 | **PASS**（`shots/walk-cold-day.png`） |
| 冷日返回：展开 9 月、选中 27 日、摘录进视口 | **PASS**（`shots/walk-day-back.png`） |
| 冷日 28 返回：选中 28 日、声音摘录进视口且不自动播 | **PASS**（`shots/walk-day28-back.png`） |
| 定位结束后自由操作：收起再展开 9 月，不再拉回 28 日 | **PASS**（`shots/walk-after-locate-reexpand.png`） |
| 密集月换日：展开后点 27 日，见 27 摘录、28 仍在下面 | **PASS（近处）**（`shots/walk-switch-27.png`） |
| 手动换日把新日期和摘录滚进视口 | **隔离 28 日页面 PASS**（`lookback-book-locate-switch` / `rapid` / `drag` / `stale`）。运行中此库只有近处几天，点 28 未能与「看这条」分开，**远处换日原生 NOT VERIFIED** |
| 详情：书页上的 9 月 27 日记录 → 详情 → 返回书页原日 | **PASS**（`shots/walk-detail.png`、`shots/walk-detail-back.png`） |
| 多年 / 多日远离首屏的目标定位 | **隔离页面 PASS**：`lookback-book-locate` 九个年份滚到 2018；`lookback-book-locate-day` 28 个有记录日滚到 9 月 28 日；坐标来自异步窗口测量，不是嵌套 `onLayout.y`。此设备库只有 2026 年两天，**一年两天截图不能**证明远处日期定位准确 |
| 摘录失败重试 | Jest 已覆盖；运行中未注入 `getHistoryDay` 失败 |
| 最近 → 回看 → 详情 → 返回 | 本轮验了书页 → 详情 → 返回书页。热 `o=` / 底带「最近」仍属 #34 |
| 稀疏月选日见摘录 | **NOT VERIFIED**（此库 9 月是密月） |
| 同日多条：2 条摘录 + N | **PASS**（27 日 2 条 + 「还有 9 条」；28 日 2 条 + 「还有 1 条」） |
| 长文 6 行、三图 1 张 | **PASS（运行中）**：9 月 25 日书页「门口的风还在…」6 行；「三张照片走查页」只一张图 +「共3张」（`shots/walk-excerpt-clamp.png`、`walk-excerpt-photos.png`）。该日由走查写入，本库原 27 日长文/三图不在前两条摘录里 |
| 仅声音听音 | **PASS（运行中）**：28 日「Same day voice」一段声音 1:24，书页与详情都能播（`shots/walk-sound-book-play.png`、`walk-sound-detail-play.png`） |
| 换日 / 返回的声音状态 | **PASS（运行中）**：详情正在播放 → 返回书页仍是「播放」、不自动播（`walk-sound-return.png`）；书页正在播放 → 换日后回到 28 日为「已暂停」、不自动播（`walk-sound-after-switch.png`） |
| 三种未确认 | **PASS（运行中，repository 写入）**：书页顶「时间未确认 · 1条」；2026 章节内、月份列表外「这一年，月份未确认 · 1条」；展开 9 月后日期之上「这个月，日子未确认 · 1条」（`walk-unconfirmed-root.png`、`walk-unconfirmed-month.png`）。留下页仍不能写 month/year 精度 |
| 最大字号 | **PASS（运行中）**：`accessibility-extra-extra-extra-large` 下展开 9 月、滚到摘录、点「看这条」进 门口的风（`walk-xxxl-expand.png`、`walk-xxxl-day27.png`、`walk-xxxl-open.png`）。走查后已复位 `large` |
| 横屏 | **NOT VERIFIED**（#34） |
| iPad | **NOT VERIFIED**（#34） |
| VoiceOver | **NOT VERIFIED**（#34） |

## 首次读取耗时

冷月打开后约 3 秒内已看到年章节、9 月和两天日期，**没有**明显空等。此库约 14 条 / 1 年，**不够**据此改 application 做限量摘录读取。更密的库若选日明显等待，再加与日页同序、总数仍准的限量摘录接口。

月/年精度：留下页仍只能写 `day` / `unknown`。

定位：等锚点与滚动视口的窗口测量都回来后，才按容器坐标 `scrollTo` 并清掉 `locateKey`。用户点日期也会定位新的一天。每次定位有独立序号，回调同时核对序号和日期；10→28→10 时第一次 10 的迟到测量不会被第二次 10 收走。用户开始拖滚动会取消未完成的定位。测量失败时用相对滚动容器的同一坐标系，**不用**嵌套节点的 `onLayout.y`。远处换日原生仍 **NOT VERIFIED**。

横屏、iPad、VoiceOver 仍属 #34 **NOT VERIFIED**。#36 仍 OPEN。#38 可做最后一次合并审查，本轮不合并。
