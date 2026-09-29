# 阶段 B 走查

分支 `ios/lookback-memoir-probe`。**head `f69a306`**（本记录之后会再记一笔）。基线 **`origin/main` `e0c7a99`**。Jest / 模拟器 / generic 编译 **≠** 真机 PASS。PR 保持 OPEN。未开始阶段 C。未改 Bundle ID、证书或 Sign in with Apple capability。

## SHA

| 端 | SHA |
| --- | --- |
| `origin/main` / #41 base | `e0c7a99` |
| #41 head（写本段时） | `f69a306` |
| 工作区 WeChat 根目录脏文件 | 未纳入 |

`e0c7a99` 与 #41 的 `apps/ios/package-lock.json` **相同**：`expo@57.0.24`、`expo-modules-core@57.0.18`、`expo-modules-jsi@57.1.0`。基线 **没有** `lampy-foundation-probe`。失败文件是上游 `JavaScriptRuntime.swift`，不是本地探针。

## ExpoModulesJSI / JavaScriptRuntime（本轮）

完整 GUI 日志：`~/Library/Developer/Xcode/DerivedData/Lampy-…/Logs/Build/8C309994-….xcactivitylog`（7 errors）。隔离复现：`logs/xcode-26.3-javascriptruntime-errors.txt`。

**第一条错误（不要只看 Xcode 侧栏）：**

- 文件：`node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift`
- 行：`193:43`
- 文本：`error: sending 'resultPtr' risks causing data races`（`writeJSIValue(to: resultPtr)`）
- 其余 6 条：同文件 786 `thisPtr`、787 `argumentsPtr`、789 `resultPtr`、829 `argumentsPtr`、830 `thisPtr`、831 `resultPtr`
- Swift 编译器：`/Applications/Xcode-26.3.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift-frontend`
- Language mode：`-swift-version 6`（`Package.swift` `swiftLanguageModes: [.v6]`；podspec `swift_version` 6.0）
- Upcoming：`NonisolatedNonsendingByDefault`、`InferIsolatedConformances`
- 锁定版本：`expo 57.0.24` / `expo-modules-core 57.0.18` / `expo-modules-jsi 57.1.0`
- SDK：iPhoneOS **26.5**
- 本机另有：`/Applications/Xcode.app` **26.6 (17F113)**，Swift **6.3.3**；`xcode-select` 指向 26.6

`nonisolated(unsafe) let resultPtr` 已在 57.1.0 源码里；Swift 6.2.4 仍把指针送进 `@JavaScriptActor` 闭包判为 data race。官方结论（[expo#47539](https://github.com/expo/expo/issues/47539)）：SDK 57 需要 **Xcode 26.4+ / Swift 6.3**。`expo-modules-jsi@57.1.1` 只修 pod install SDK 不匹配，不修这 7 条。未给 `JavaScriptRuntime` 打绕过并发检查的补丁，也未升整个 Expo SDK。

隔离 worktree `/tmp/lampy-e0c7a99` @ `e0c7a99`：无探针模块；lockfile 与 head 相同。用 **同一份** 57.1.0 源、`DEVELOPER_DIR=Xcode-26.3.app`、iphoneos 编 `ExpoModulesJSI`：**同样 7 条**。因此这是 **既有依赖 × Xcode 26.3**，不是 #41 本地模块改了 `ExpoModulesJSI` 的编译参数。

| 工具链 | ExpoModulesJSI iphoneos | Lampy Liuz17（`CODE_SIGNING_ALLOWED=NO`） |
| --- | --- | --- |
| Xcode 26.3 / Swift 6.2.4 | **FAIL** 7× `sending` | GUI “Build Lampy” **FAIL**（同上） |
| Xcode 26.6 / Swift 6.3.3 | 脚本编进 xcframework | **PASS（仅编译）** 产出 `Debug-iphoneos/Lampy.app`。**不是**真机运行 PASS |

仓库守卫：`scripts/check-env.sh` 在 Xcode 低于 26.4 时失败，并写明打开 `Xcode.app`（26.6），不要用 26.3。真机/GUI 必须用 26.6，否则会再次打到 `JavaScriptRuntime`。

## 签名（与编译分开）

`DEVELOPER_DIR=/Applications/Xcode.app` 的**带签名** Liuz17 `xcodebuild`：**FAIL** — Team Profile 不含 Sign in with Apple。未删 capability。generic/无签名成功 **≠** 已安装到真机。

## 真机探针（合成数据）

未用 26.6 **签名安装**到 Liuz17，下列均 **NOT VERIFIED**。

| 检查 | 结果 |
| --- | --- |
| `inspect` availability / 中文 locale / context size | **NOT VERIFIED** |
| 中文 A/B 可读摘录 | **NOT VERIFIED** |
| 人读：相对确定性选取有无阅读收益 | **NOT VERIFIED** |
| 取消 / 耗时 | **NOT VERIFIED** |

## 其它

| 检查 | 结果 |
| --- | --- |
| TypeScript / Jest | **PASS** 102 / 526 |
| `check-env.sh` @ 26.6 | **PASS** |
| `check-env.sh` @ 26.3 | **FAIL**（预期） |
| 阶段 C | 未开始 |

开发页：`lampy:///dev/foundation-probe`（仅 `__DEV__`）。
