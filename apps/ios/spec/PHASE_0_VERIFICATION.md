# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6，Node v24.7.0。日期：2026-09-24。

本轮是个人 Moment「回看」年/月/日（分支 `ios/lookback`，基于已合并图片闭环的 main `3bf37f5`）。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。14 suites / 54 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **失败**。`pod install` 找不到 `ReactNativeDependencies`（`React-Core-prebuilt`） |
| `xcodebuild -workspace Lampy.xcworkspace -scheme Lampy -destination 'platform=iOS Simulator,name=iPhone 17' -configuration Debug build` | `apps/ios/ios` | **通过**（exit 0，沿用本机已有 workspace） |
| `xcodebuild … -only-testing:LampyUITests/ClosedLoopTests/testLookbackUnconfirmedDetailBack test` | `apps/ios/ios` | **通过**。iPhone 17 (iOS 26.3.1) |
| `git diff --check` | 仓库根 | **通过** |

## 模拟器走查（iPhone 17）

**通过：** 最近页有可访问的「回看」；打开后见「时间未确认」；进入该架，点刚留下的一句，精确 ID 详情出现「你留下的记录」与原文；返回仍在「时间未确认」，再返回仍在「回看」。

当前留下页仍写 `occurredAtPrecision: unknown`，因此真实保存的记录只出现在「时间未确认」，不会进入某年某月。

**未在模拟器点过：** 年 → 月 → 日（需要已确认的 `occurredAt`）。该路径由自动化覆盖。

## 自动化覆盖

- exact / day / month / year / unknown 五种精度的浏览位置
- recordedAt 不进入年、月、日格子；unknown 即使带 occurredAt ISO 也不进年列表
- UTC+8 / UTC-5 时区边界；跨年、跨月；2024 闰日；非闰年 2 月 29 日无效
- 同日多条共享日期标题；整月空白日子保留为「安静」
- 一年以上记录时，读某年不带上另一年
- 年→月→日→精确 ID 详情→返回
- 详情缺失与读取失败不同状态；部分图片缺失时 Moment 与其余照片仍在
- SQLite 按 occurred_at 范围查询，不扫全部行

## 浏览位置规则

见 `apps/ios/spec/adr/0005-lookback-browse-placement.md`。

「时间未确认」按记录时间新到旧，避免刚留下的句子沉到屏幕外。日视图仍按发生钟点再按记录时间。

## 返回与重启

- 所选年 / 月 / 日在路由参数中；栈内返回保持原页。
- 滚动位置只存在于本次进程；内容出来后再恢复，避免空列表先撑满再把人甩到页底。
- 冷启动回到「最近」，不自动跳回上次回看位置。

## 未验证

| 项 | 说明 |
| --- | --- |
| 模拟器年→月→日（需 occurredAt 数据） | **未验证** |
| 真机超大字号、VoiceOver、横屏、iPad 分屏 | **未验证** |
| 现场录音回看 | 本分支基于图片闭环 main，无音频闭环 |
| `npx expo run:ios` 完整重装 Pods | **失败**（见上）；改用已有 workspace 的 `xcodebuild` |
| App Store / 签名发布 | **未验证** |

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。
