# 阶段 B 走查

分支 `ios/lookback-memoir-probe`。基线 `origin/main` `e0c7a99`（#40 merge）。Jest / 模拟器 / generic 编译 **≠** 真机 PASS。PR 保持 OPEN。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：102 suites / 526 tests
- `git diff --check`：通过
- `npx expo-modules-autolinking search --platform apple`：列出 `lampy-foundation-probe`

原生模块变更必须重新 `expo run:ios`。Metro 热更新不能当原生接入结论。

## 编译 SDK 实际 API（Xcode 26.6 / iPhoneOS 26.5）

`FoundationModels.swiftinterface` 确认：

| API | 可用性 | 本探针 |
| --- | --- | --- |
| `SystemLanguageModel.supportsLocale(_:)` | iOS 26.0 | `inspect` 探测 current / zh-Hans / zh-CN / zh-Hant |
| `SystemLanguageModel.supportedLanguages` | iOS 26.0 | 返回 `Locale.Language.maximalIdentifier` 列表，并标是否含 `zh` |
| `SystemLanguageModel.contextSize` | iOS 26.0；`@backDeployed(before: iOS 26.4)` 在 26.0–26.3 为 4096 | 写入 `contextCapacityTokens`，不再写“API 不暴露” |
| `SystemLanguageModel.tokenCount(for:)` | **iOS 26.4+**；compile SDK 26.5 有此符号 | OS < 26.4 记 `null` + 编译限制，不假装测过 |

Liuz17 是 **iOS 26.2**，因此即使装上，`tokenCount` 仍应报 26.4 限制；`supportsLocale` / `supportedLanguages` / `contextSize` 应能测。

## 检查表

| 检查 | 环境 | 结果 |
| --- | --- | --- |
| TypeScript / Jest | 本机 | **PASS** 102 / 526。含 locale/context 源探测、单次 in-flight、开发页摘录行；`probeLogLine` 仍不含正文 |
| 模块编进 Dev Client | `xcodebuild` generic iOS，`CODE_SIGNING_ALLOWED=NO` | **PASS（仅编译）**：`LampyFoundationProbeModule.swift` 在 iPhoneOS26.5 链上。**不是**真机运行 |
| 模拟器 availability / 对照 | iPhone 16 Sim / **iOS 18.6** | 上一轮：**PASS（仅此环境）** `unavailable · osBelow26 · zh_CN`。A 6/6。B 不可用。见 `shots/sim-iphone16-osbelow26.png`。本轮 JS 会多显示合成原文与 A/B 摘录；OS 18 上 locale/context 字段为 n/a 并写明 compile SDK |
| 模拟器 iOS 26 Foundation Models | 未装本轮探针到 iOS 26 模拟器 | **NOT VERIFIED** |
| Liuz17 签名安装 | iPhone 17 Pro / iOS 26.2，已配对 `4392B733-…`，UDID `00008150-0016696E1EBA401C` | **BLOCKED（单独记录，未删 capability）** |
| 同上，availability / 中文 A/B 可读结果 / 取消 / 耗时 | 真机未装上本轮 Dev Client | **NOT VERIFIED** |
| 阶段 C 是否有足够证据 | 判断 | **没有。** 探针已能回答“SDK 有哪些 API、页面能否做人读对照、取消会不会串线”；仍没有 iOS 26 真机上的模型结果 |

## 真机签名（与探针逻辑分开）

`app.lampy.ios` 正式 entitlements 含 `com.apple.developer.applesignin`（`usesAppleSignIn` / `expo-apple-authentication`）。**未删除。**

本机核对：

- Team `B283NY984J`（Xcode 显示 **Personal development team “Zhen Liu”**）
- 开发证书：`Apple Development: chipmuck228@gmail.com (H36468MSTC)`
- 缓存 Profile：`iOS Team Provisioning Profile: app.lampy.ios`（`92c4d577-…`），App ID 名 `XC app lampy ios`，含 Liuz17 UDID，**不含** `com.apple.developer.applesignin`，到期 2026-10-03
- `xcodebuild … -allowProvisioningUpdates -allowProvisioningDeviceRegistration` 对 Liuz17：

```
Cannot create a iOS App Development provisioning profile for "app.lampy.ios".
Personal development teams, including "Zhen Liu", do not support the Sign In with Apple capability.
Provisioning profile "iOS Team Provisioning Profile: app.lampy.ios" doesn't include the Sign In with Apple capability.
```

developer.apple.com Identifiers 页需要交互登录，本环境未改 App ID。个人开发团队本身不能为 Sign in with Apple 签发开发 Profile；要在 Liuz17 上装带该 capability 的包，需要 **付费 Apple Developer Program** 团队启用 App ID 的 Sign in with Apple，再下载/刷新含 `applesignin` 的 Development Profile，然后重装。

generic iOS 无签名编译成功 **≠** 真机运行成功。

## 开发页

`lampy:///dev/foundation-probe`（仅 `__DEV__`）。`?run=1` 自动对照；`?cancel=1` 启动后按当前 `requestId` 取消。

页面显示：availability、`supportsLocale`、`supportedLanguages`、`contextSize`、compile SDK，以及合成夹具原文与 A/B 摘录。日志仍只有计数。
