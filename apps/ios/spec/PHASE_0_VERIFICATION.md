# Phase 0 验证报告

机器：macOS 26.6，Xcode 26.6，Node v24.7.0。日期：2026-09-25。

本轮是媒体失败与权限拒绝恢复（分支 `ios/media-failure-recovery`）。基线 `origin/main` = `92272ff`。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。18 suites / 89 tests |
| `npx expo run:ios --device "iPhone 17"` | `apps/ios` | **通过**。Build Succeeded，已装上模拟器 |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testCameraDeniedKeepsDraft test` | `apps/ios/ios`（本地，不入库） | **通过**。iPhone 17 Simulator |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testCameraRetryAfterSettingsGrant test` | `apps/ios/ios`（本地，不入库） | **通过**。先 `simctl privacy grant camera`，再打开相机 |
| `git diff --check` | 仓库根 | **通过** |

## 自动化覆盖

- 相册 / 相机 / 麦克风拒绝后草稿保留；从设置恢复权限后可重试，不丢草稿
- 磁盘不足、复制失败与 SQLite 写入失败分别分类；失败后旧 Moment 不变
- 文件已复制但 Asset / 草稿写入失败时回滚未提交 Asset，重试不重复创建
- 部分照片缺失与解码失败分开说明；声音缺失与无法播放分开说明
- 媒体错误不把 Moment 标成不存在；损坏行进隔离表且不覆盖原文
- 无法确认引用时保留应用自有文件；不删除系统相册原片
- 选图 / 录音 / 保存保持串行；保存失败后重试幂等
- 重启后仍能读回失败前已写入的草稿文字与已留下的照片

## 模拟器失败→重试（合并前已点通）

在 iPhone 17 Simulator 上由 XCUITest 驱动真实页面，不是只读库：

1. `simctl privacy revoke camera` 后点「留下」，写入「相机拒绝后还在可以再试」；
2. 点「拍摄」，界面说明没有打开相机，草稿文字仍在，相册和留下仍可用；
3. `simctl privacy grant camera` 模拟从系统设置恢复权限；
4. 重新进入留下页，同一句草稿还在；再点「拍摄」打开相机，不再出现拒绝说明。

`TEST SUCCEEDED`（拒绝 55.0s；恢复后重试 58.2s）。

系统相册 PHPicker 在原生路径上仍可打开，不依赖完整相册权限。相册拒绝与设置恢复由可注入 `ImageSource` 覆盖。

## 未验证

| 项 | 说明 |
| --- | --- |
| 真机相机 / 相册 / 麦克风权限弹窗、拒绝后仍写字、从设置恢复后再试 | **未验证** |
| 真机磁盘空间不足、复制失败、SQLite 写入失败 | **未验证** |
| 真机杀进程后草稿与正式记录仍在 | **未验证** |
| 真机来电打断录制或播放 | **未验证** |
| App Store / 签名发布 | **未验证** |

以上真机项不能用编译或模拟器结果代替。

## 根目录领域回归（只读，未改代码）

本轮未改微信领域文件，未重跑根目录 `npm test`。
