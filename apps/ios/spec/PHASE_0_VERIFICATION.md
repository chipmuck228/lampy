# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6，Node v24.7.0。日期：2026-09-24。

本轮是个人 Moment「回看」年/月/日（分支 `ios/lookback`，PR #5）。录音闭环 PR #4 已合入 main（`92272ff`），本分支已把 `origin/main` 收进基线。相对 main 的 diff 为回看相关 35 个文件。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。20 suites / 92 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **通过**（本轮）。重新装上 CocoaPods，Build Succeeded，已装上 iPhone 17 模拟器并打开 `exp+lampy-ios://…8081` |
| `xcodebuild -workspace Lampy.xcworkspace -scheme Lampy -destination 'platform=iOS Simulator,id=95130BCF-6BBE-4252-BC04-23945550C20D' -only-testing:LampyUITests/ClosedLoopTests/testLookbackYearMonthDayExactIdBack test` | `apps/ios/ios`（本地 workspace，不入库） | **通过**。21.9s。iPhone 17 (iOS 26.3) |
| `git diff --check` | 仓库根 | **通过** |

## 构建路径

**此前失败：** `npx expo run:ios` 在 `pod install` 时找不到 `ReactNativeDependencies`（`React-Core-prebuilt`），完整重装 Pods 中断。当时改用本机已有 `Lampy.xcworkspace` 的 `xcodebuild` Debug build。

**本轮采用：** 先再跑一次 `npx expo run:ios --device "iPhone 17"`。这次 CocoaPods 装上了，原生包编过并装进模拟器（exit 0）。年 → 月 → 日走查用同一 workspace 的 `xcodebuild … test`，不另起一份工程。

## 模拟器走查（iPhone 17）

留下页仍写 `occurredAtPrecision: unknown`。本轮在模拟器 `lampy.db` 写入一条已确认发生时间的测试记录：

- id：`moment_lookback_confirmed`
- note：`回看已确认一句`
- `occurredAt`：`2026-05-04T04:15:00.000Z`
- `occurredAtPrecision`：`exact`

**通过：** 最近 → 回看 → **2026年** → **2026年5月** → **2026年5月4日** → 精确 ID `moment_lookback_confirmed` 详情出现「你留下的记录」与「回看已确认一句」→ 返回。

返回后：

- 日期仍是 **2026年5月4日**
- 路由 `/lookback/2026/05/04`
- 滚动位置按本次进程恢复；同一条 `lookback-moment-moment_lookback_confirmed` 仍在屏幕上

`TEST SUCCEEDED`。日志：`lookback return date=2026年5月4日 path=/lookback/2026/05/04 scroll=in-process-restore moment-visible=true`。

**此前已通过：** 时间未确认架 → 精确 ID 详情 → 返回仍在「时间未确认」。

## 自动化覆盖

- exact / day / month / year / unknown 五种精度的浏览位置
- recordedAt 不进入年、月、日格子；unknown 即使带 occurredAt ISO 也不进年列表
- UTC+8 / UTC-5 时区边界；跨年、跨月；2024 闰日；非闰年 2 月 29 日无效
- 同日多条共享日期标题；整月空白日子保留为「安静」
- 一年以上记录时，读某年不带上另一年
- 年→月→日→精确 ID 详情→返回
- 详情缺失与读取失败不同状态；部分图片缺失时 Moment 与其余照片仍在
- 年份索引用 MIN/MAX + 逐年 COUNT，不读取全部 occurredAt
- 年/月格子只用范围 COUNT；日与未确认架用 LIMIT/OFFSET，80 条年精度记录分页 50+30
- America/New_York 春切换 23 小时日、秋切换 25 小时日；固定偏移与 IANA 春切换日终点不同
- 回看日保留声音；文件缺失时声音不可用；无法识别的媒体原位占位，Moment 仍在
- 原生包没有 `ExpoAudio` 时不在启动时 `require('expo-audio')`，最近与回看仍能打开

## 浏览位置规则

见 `apps/ios/spec/adr/0005-lookback-browse-placement.md`。

「时间未确认」按记录时间新到旧。日视图按发生钟点再按记录时间。

## 返回与重启

- 所选年 / 月 / 日在路由参数中；栈内返回保持原页。
- 滚动位置只存在于本次进程；内容出来后再恢复。
- 冷启动回到「最近」，不自动跳回上次回看位置。

## 未验证

| 项 | 说明 |
| --- | --- |
| 模拟器回看页播放声音 / 缺失媒体 | **未验证**（自动化已覆盖呈现） |
| 真机超大字号、VoiceOver、横屏、iPad 分屏 | **未验证** |
| 真机麦克风权限弹窗、允许后录音、拒绝后仍写字/选照片 | **未验证** |
| 真机来电打断录制或播放，以及打断后保留了什么 | **未验证** |
| 真机切到后台时停止录制或播放 | **未验证** |
| 真机杀进程后草稿录音与正式录音仍在 | **未验证** |
| 模拟器来电 / 后台音频会话中断 | **未验证** |
| App Store / 签名发布 | **未验证** |

以上真机项不能用编译或模拟器结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。
