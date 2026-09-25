# Phase 0 验证报告

机器：macOS 26.6，Xcode 26.6，Node v24.7.0。日期：2026-09-25。

本轮是「当时的感受」（分支 `ios/emotion-moment`）。基线 `origin/main` = `c5264c4`。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。22 suites / 110 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **通过**。Build Succeeded，已装上模拟器 |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testFeelingSelectRestoreSaveRecentDetail test` | `apps/ios/ios`（本地，不入库） | **通过**。iPhone 17 Simulator，26.4s |
| `git diff --check` | 仓库根 | **通过** |

## 自动化覆盖

- 未选择感受时，纯文字、仅照片、仅声音和混合内容均可保存
- 选择、改选、清除感受；只选感受不能保存
- 选择感受不改 `recordedAt` / `occurredAt` / Asset / 个人范围
- 草稿重启后恢复同一 draft id 与已选感受
- 保存失败后感受仍在草稿，重试不重复创建 Moment
- 未知旧值（如微信词表「喜悦」）在最近、详情和 SQLite 重开后原样显示，不改写存储
- 词表映射不做趋势、评分或诊断

## 模拟器选择→恢复→保存（合并前已点通）

在 iPhone 17 Simulator 上由 XCUITest 驱动真实页面，不是只读库：

1. 点「留下」，词表出现且默认不选中；
2. 选「平静」，写下「感受闭环…」；
3. 返回「最近」，未保存的草稿不出现在列表；
4. 再进「留下」，恢复横幅出现，同一句和「平静，已选中」还在；
5. 点「留下」保存后，「最近」与只读详情都显示「当时的感受 · 平静」，文字仍是主内容。

`TEST SUCCEEDED`（26.4s）。

本基线没有回看页（回看仍在独立 PR #5）。感受已进入 Recent / Detail ViewModel，回看合并后可复用同一 `projectFeeling`，本轮未走回看 UI。

## 未验证

| 项 | 说明 |
| --- | --- |
| 回看年/月/日页展示感受 | **未验证**。回看不在 `origin/main` / 本 PR |
| 真机选择、清除、草稿恢复与详情展示 | **未验证** |
| 真机 VoiceOver 读出选中状态 | **未验证**。自动化已写 `accessibilityState.selected` 与「已选中」标签 |
| 真机超大字号换行 | **未验证**。词表 `flexWrap` |
| 真机杀进程后草稿感受仍在 | **未验证**。自动化已覆盖新 Use Case 实例与 SQLite 关文件重开 |
| App Store / 签名发布 | **未验证** |

以上真机项与回看页不能用编译或本轮模拟器结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。`content.emotion` 仍是可选自由字符串，词表只在 iOS 展示层映射。
