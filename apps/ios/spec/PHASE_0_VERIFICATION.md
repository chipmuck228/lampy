# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6，Node v24.7.0。日期：2026-09-24。

本轮是个人 Moment「回看」年/月/日（分支 `ios/lookback`），并接上录音闭环 `ios/audio-moment`（PR #4）作为基线。回看按仓库范围计数与分页；日期边界按目标日期所在时区计算。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。19 suites / 91 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **失败**（此前）。`pod install` 找不到 `ReactNativeDependencies`（`React-Core-prebuilt`） |
| `xcodebuild -workspace Lampy.xcworkspace -scheme Lampy -destination 'platform=iOS Simulator,name=iPhone 17' -configuration Debug build` | `apps/ios/ios` | **通过**（此前，exit 0，沿用本机已有 workspace） |
| `xcodebuild … -only-testing:LampyUITests/ClosedLoopTests/testLookbackUnconfirmedDetailBack test` | `apps/ios/ios` | **通过**（此前）。iPhone 17 (iOS 26.3.1) |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testRecordSoundSaveRecentExactIdDetail test` | `apps/ios/ios`（音频分支，本地，不入库） | **通过**（此前）。iPhone 17 Simulator |
| `git diff --check` | 仓库根 | **通过** |

## 模拟器走查（iPhone 17）

**通过（此前回看）：** 最近页有可访问的「回看」；打开后见「时间未确认」；进入该架，点刚留下的一句，精确 ID 详情出现「你留下的记录」与原文；返回仍在「时间未确认」，再返回仍在「回看」。

当前留下页仍写 `occurredAtPrecision: unknown`，因此真实保存的记录只出现在「时间未确认」，不会进入某年某月。

**通过（此前录音）：** 留下 → 声音 → 停止 → 一段声音与播放（不自动播）→ 写下句子并留下 → 最近与详情出现同一句和声音。

**未在模拟器点过：** 年 → 月 → 日（需要已确认的 `occurredAt`）。该路径由自动化覆盖。本轮回看页的声音与缺失媒体由自动化覆盖，模拟器未再走查。

## 自动化覆盖

回看：

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

录音：

- 仅声音、文字 + 声音、照片 + 声音
- 第二段声音被拒绝，不写入草稿，也不生成 Audio Asset
- 未点「声音」不请求麦克风；拒绝后文字和照片仍可编辑
- 草稿恢复带录音；保存失败保留草稿；重试不重复 Moment / Audio Asset
- 录音中断：有内容则保留，无内容则说明没有留下声音
- 无法播放或文件缺失时 Moment 与其余内容仍在，原位不可用
- 录音进行中重复开始被阻止；重启后正式记录仍能读到同一段声音
- 移除草稿录音只删除应用自有且已无引用的文件
- 重录启动失败仍保留旧声音，可继续试听
- 超过 200 条记录时，仍被引用的文件不会被删
- 音频 Asset 损坏或缺失显示为声音不可用，不显示成照片
- 真实 `asset_` 格式的音频 ID 在 Asset 行缺失时显示中性不可用占位，文字和其他媒体仍在
- 录音处理中不能保存或再选照片

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
| 模拟器回看页播放声音 / 缺失媒体 | **未验证**（自动化已覆盖呈现） |
| 真机超大字号、VoiceOver、横屏、iPad 分屏 | **未验证** |
| 真机麦克风权限弹窗、允许后录音、拒绝后仍写字/选照片 | **未验证** |
| 真机来电打断录制或播放，以及打断后保留了什么 | **未验证** |
| 真机切到后台时停止录制或播放 | **未验证** |
| 真机杀进程后草稿录音与正式录音仍在 | **未验证** |
| 模拟器来电 / 后台音频会话中断 | **未验证** |
| `npx expo run:ios` 完整重装 Pods | **失败**（见上）；改用已有 workspace 的 `xcodebuild` |
| App Store / 签名发布 | **未验证** |

以上真机项不能用编译或模拟器结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。
