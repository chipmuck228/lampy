# Phase 0 验证报告

机器：macOS 26.6，Xcode 26.6，Node v24.7.0。日期：2026-09-25。

本轮是「当时的感受」（分支 `ios/emotion-moment`，PR #7）。基线已更新到 `origin/main` = `3043b95`（回看 PR #5 已合并）。不覆盖回看浏览位置或媒体失败恢复语义。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。27 suites / 141 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **通过**。Build Succeeded，已装上模拟器 |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testFeelingSelectRestoreSaveRecentDetail test` | `apps/ios/ios`（本地，不入库） | **通过**。iPhone 17 Simulator，34.0s |
| `git diff --check` | 仓库根 | **通过** |

## 自动化覆盖

- 未选择感受时，纯文字、仅照片、仅声音和混合内容均可保存
- 选择、改选、清除感受；只选感受不能保存
- 选择感受不改 `recordedAt` / `occurredAt` / Asset / 个人范围
- 草稿重启后恢复同一 draft id 与已选感受
- 保存失败后感受仍在草稿，重试不重复创建 Moment
- 未知旧值（如微信词表「喜悦」）在最近、详情、回看日页和未确认页原样显示，不改写存储
- 回看日页与未确认页经同一 `projectFeeling` 展示次要感受；未选择时不出现
- 词表映射不做趋势、评分或诊断

见 `apps/ios/spec/adr/0005-lookback-browse-placement.md`。

## 模拟器选择→恢复→保存→回看（合并前已点通）

在 iPhone 17 Simulator 上由 XCUITest 驱动真实页面，不是只读库：

1. 点「留下」，词表出现且默认不选中；
2. 选「平静」，写下「感受闭环…」；
3. 返回「最近」，未保存的草稿不出现在列表；
4. 再进「留下」，恢复横幅出现，同一句和「平静，已选中」还在；
5. 保存后，「最近」与只读详情都显示次要感受；
6. 经「回看 → 时间未确认」找到同一条，标签含「当时的感受，平静」。

`TEST SUCCEEDED`（34.0s）。

回看日页感受由自动化覆盖（需要已确认 `occurredAt`）。「留下」页不能指定发生日，本轮模拟器未再走年→月→日。

## 未验证

| 项 | 说明 |
| --- | --- |
| 模拟器回看日页展示感受 | **未验证**（自动化已覆盖日页 ViewModel 与屏幕） |
| 真机选择、清除、草稿恢复与详情 / 回看展示 | **未验证** |
| 真机 VoiceOver 读出选中状态 | **未验证** |
| 真机超大字号换行 | **未验证** |
| 真机杀进程后草稿感受仍在 | **未验证** |
| App Store / 签名发布 | **未验证** |

以上真机项和未走的日页不能用编译结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。`content.emotion` 仍是可选自由字符串，词表只在 iOS 展示层映射。
