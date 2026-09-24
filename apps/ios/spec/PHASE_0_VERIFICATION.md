# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6 (17F113)，Node v24.7.0。日期：2026-09-24。

本轮是纯文字个人 Moment 闭环（GitHub PR #2）。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。7 suites / 18 tests |
| `xcodebuild ... -only-testing:LampyUITests/ClosedLoopTests/testLeaveRecentExactIdDetail test` | `apps/ios/ios`（本地，不入库） | **通过**。iPhone 17 Simulator，24.6s |

## 模拟器闭环（合并前已点通）

在 iPhone 17 Simulator 上由 XCUITest 驱动真实页面，不是只读库：

1. 点「最近」上的 **留下**（`home-leave`）；
2. 在输入框写入 **模拟器闭环一句**；
3. 点留下页的 **留下**（`composer-save`）；
4. 「最近」出现 `recent-item-moment_1790219338517_of1aivyp`；
5. 点这一行，详情出现同一句 **模拟器闭环一句** 和 **你留下的记录**；
6. 详情没有「这条记录现在无法找到」，也没有打开「的点点滴滴」。

`TEST SUCCEEDED`。真机仍未验证。

此前手动留下的「的点点滴滴」「我是真的会笑的」在另一次 `terminate` / `launch` 后仍留在「最近」。自动化里关闭再打开真实 SQLite 文件也通过。

## 未验证

| 项 | 说明 |
| --- | --- |
| 真机 | **未验证**。留到后续媒体与发布阶段 |
| 相机、麦克风、相册 | **未验证**（未实现） |
| App Store / 签名发布 | **未验证** |

## 根目录领域回归（只读，未改代码）

本轮未重跑根目录 `npm test`。微信领域文件本轮未修改。
