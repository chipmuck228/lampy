# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6 (17F113)，Node v24.7.0。日期：2026-09-24。

本轮是个人 Moment 图片闭环（GitHub PR 待开，分支 `ios/image-moment`）。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。10 suites / 33 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **通过**。Build Succeeded，已装上模拟器 |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testPickPhotoSaveRecentExactIdDetail test` | `apps/ios/ios`（本地，不入库） | **通过**。iPhone 17 Simulator，35.8s |

## 自动化覆盖

- 1 / 2 / 3 张照片写入草稿
- 第四张明确拒绝，不写入草稿，也不生成 Asset
- 仅照片、文字加照片
- 未点入口不请求权限；拒绝相册 / 相机后草稿和文字仍在
- 草稿恢复带图片；保存重试不重复 Moment / Asset
- 文件缺失或无法解码时 Moment 与文字仍在，原位不可用
- SQLite 文件关闭再打开后图片仍在；删掉文件后记录仍在

## 模拟器闭环（合并前已点通）

在 iPhone 17 Simulator 上由 XCUITest 驱动真实页面，不是只读库：

1. 点「最近」上的 **留下**（`home-leave`）；
2. 点 **照片**（`composer-library`），系统 PHPicker 打开；
3. 选一张模拟器相册照片并确认；
4. 留下页出现真实图片（不是附件卡片）；
5. 写入唯一句子 **模拟器照片闭环179022181800**；
6. 点 **留下**；
7. 「最近」出现同一句，并显示刚选的花田照片；
8. 点该行，详情出现同一句和 **照片 1/1**；
9. 详情没有「这条记录现在无法找到」。

`TEST SUCCEEDED`。

同屏仍能看到更早一次失败留下的记录：文字还在，原位是「这张照片暂时找不到了，但这条记录还在。」没有把读取失败当成记录不存在。

## 未验证

| 项 | 说明 |
| --- | --- |
| 真机相机权限弹窗、允许后拍摄、拒绝后仍写字 | **未验证** |
| 真机照片权限：完全访问 / 有限访问 / 拒绝 | **未验证** |
| 真机从系统相册选原片、HEIC、竖图、超大图 | **未验证** |
| 真机杀进程后草稿图片与正式图片仍在 | **未验证** |
| 模拟器相机（无摄像头） | **未验证** / 不适用 |
| App Store / 签名发布 | **未验证** |

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。
