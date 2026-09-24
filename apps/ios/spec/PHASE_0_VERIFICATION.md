# Phase 0 验证报告

机器：macOS 26.7，Xcode 26.6 (17F113)，Node v24.7.0。日期：2026-09-24。

| 命令 | 工作目录 | 结果 |
| --- | --- | --- |
| `bash ./scripts/check-env.sh` | `apps/ios` | **通过**。Node、npm、Xcode 26.6、simctl、CocoaPods 1.16.2 |
| `npx tsc --noEmit` | `apps/ios` | **通过**（exit 0） |
| `npx expo lint` | `apps/ios` | **通过**（exit 0） |
| `npm test` | `apps/ios` | **通过**。1 suite / 1 test（空壳不发明 Moment） |
| `xcodebuild -list -workspace ios/Lampy.xcworkspace` | `apps/ios` | **通过**。存在 scheme `Lampy` |
| `xcodebuild -workspace ios/Lampy.xcworkspace -scheme Lampy -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' -quiet build CODE_SIGNING_ALLOWED=NO` | `apps/ios` | **通过**（exit 0，增量编译约 25s） |
| `git diff --check origin/main...HEAD` | 仓库根 | **通过**（exit 0）。已去掉四份 ADR「状态」行行尾空格 |

## 未验证

| 项 | 说明 |
| --- | --- |
| 真机 Development Build | **未验证** |
| 本轮重新打开 Simulator 看空壳画面 | **未验证**。同日更早曾在 iPhone 17 Simulator 看到「Lampy / iOS 脚手架已就绪」，不记入本轮通过 |
| 相机、麦克风、相册权限 | **未验证**（未实现） |
| 录音中断、后台、磁盘不足 | **未验证**（未实现） |
| 媒体生命周期 | **未验证**。编译通过 ≠ 媒体已验证 |
| App Store / 签名发布 | **未验证** |

## 根目录领域回归（只读，未改代码）

本轮未重跑根目录 `npm test`。最近已知基线是 129 pass / 0 fail（含未提交小程序测试时）。微信领域文件本轮未修改。
