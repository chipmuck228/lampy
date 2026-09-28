# 阶段 B 走查

分支 `ios/lookback-memoir-probe`。基线 `origin/main` `e0c7a99`（#40 merge）。Jest / 模拟器 **≠** 真机 PASS。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：102 suites / 523 tests
- `git diff --check`：通过
- `npx expo-modules-autolinking search --platform apple`：列出 `lampy-foundation-probe`

原生模块变更已重新 `expo run:ios`（模拟器）。Metro 热更新不能当原生接入结论。

## 检查表

| 检查 | 环境 | 结果 |
| --- | --- | --- |
| TypeScript / Jest | 本机 | **PASS** 102 / 523 |
| 模块编进 Dev Client | `xcodebuild` generic iOS，无签名 | **PASS**（`LampyFoundationProbe` 已链上） |
| 模拟器 availability / 对照 | iPhone 16 Sim / **iOS 18.6** | **PASS（仅此环境）**：`unavailable · osBelow26 · zh_CN`。A 确定性 6/6 原文。B 明确不可用、0ms、未转云。见 `shots/sim-iphone16-osbelow26.png` |
| 模拟器 iOS 26 Foundation Models | 未装本轮探针到 iOS 26 模拟器 | **NOT VERIFIED** |
| Liuz17 / iPhone 17 Pro / iOS 26.2 availability | 真机已配对 `4392B733-…` | **NOT VERIFIED**：`expo run:ios --device Liuz17` 失败，Team Provisioning Profile 不含 Sign In with Apple |
| 同上，合成中文摘录 | 真机 | **NOT VERIFIED** |
| 同上，取消 | 真机 | **NOT VERIFIED** |
| 中文生成质量 | 真机人读 | **NOT VERIFIED** |
| 阶段 C 是否有足够证据 | 判断 | **没有。** 只证明模块能编、能在 iOS 18 上报 `osBelow26`。没有 iOS 26 真机上的 availability / 中文摘录 / 取消 |

开发页（仅 `__DEV__`）：`lampy:///dev/foundation-probe`；`?run=1` 自动对照；`?cancel=1` 启动后取消。
