# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6 (17F113)，Node v24.7.0。日期：2026-09-24。

本轮是纯文字个人 Moment 闭环（GitHub 上一条功能 PR）。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `bash ./scripts/check-env.sh` | `apps/ios` | **通过**。Node、npm、Xcode 26.6、simctl、CocoaPods 1.16.2 |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。4 suites / 11 tests（空库不发明 Moment、草稿恢复、精确 id、重复保存、空保存不删旧记录、杀进程后同仓库仍可读） |
| `git diff --check origin/main...HEAD` | 仓库根 | **通过**（exit 0） |
| `pod install`（本地，`ios/` 不入库） | `apps/ios/ios` | **通过**。已装 `ExpoSQLite 57.0.3` |
| `xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone 17' ... build` | `apps/ios` | **通过**（exit 0）。编译通过 ≠ 已在模拟器里点过「留下」 |

## 未验证

| 项 | 说明 |
| --- | --- |
| Simulator / 真机点「留下」再回「最近」 | **未验证**。本轮没有打开 Simulator 或真机走完保存闭环 |
| 杀进程后 SQLite 文件仍在 | **未验证**。自动化只证明同一仓库实例在新 Use Case 中仍可读；不是真的关掉 App |
| 相机、麦克风、相册权限 | **未验证**（未实现） |
| 录音中断、后台、磁盘不足 | **未验证**（未实现） |
| App Store / 签名发布 | **未验证** |

## 根目录领域回归（只读，未改代码）

本轮未重跑根目录 `npm test`。微信领域文件本轮未修改。
