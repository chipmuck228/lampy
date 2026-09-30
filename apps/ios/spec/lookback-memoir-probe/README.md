# 生活回眸 · 阶段 B 端侧探针

独立 PR，基线与实测见 [`WALK.md`](./WALK.md)。**不接回眸产品页，不读个人库，不实现阶段 C。PR 保持 OPEN。**

## 要回答的问题

当前 Expo SDK 57 Development Build，能否在真实 iPhone 上可靠调用 Apple Foundation Models，处理**合成**中文原文摘录？

“能吐出文字”不等于阶段 C 值得做。对照必须同时看：引用是否原文、遗漏、耗时、人读是否有用。

## 调查结论（实现前）

| 项 | 仓库 / 平台事实 |
| --- | --- |
| Expo | SDK `~57.0.24`，RN 0.86.3。ADR 0001：不为此升 SDK 58 |
| 现有原生接入 | `expo-modules-core.requireOptionalNativeModule`（如 `ExpoAudio`）。仓库原先无自定义 Swift 模块 |
| 本探针 | 独立本地模块 `modules/lampy-foundation-probe`，不改录音模块 |
| Apple | `FoundationModels`：`SystemLanguageModel.default.availability`、`LanguageModelSession.respond`。需 iOS 26 + Apple Intelligence 设备。Xcode 26 SDK 才能链上框架 |
| 部署目标 | 现有 Expo iOS pod 基线 16.4；模块用 `#if canImport` + `@available(iOS 26.0, *)`，低版本只回报不可用 |
| 密钥 / 云 | 不使用。不可用只回报状态 |

## 做什么

- `inspect`：availability、系统 locale，以及编译 SDK 实际可调用的 `supportsLocale` / `supportedLanguages` / `contextSize`。`tokenCount(for:)` 仅 iOS 26.4+；低版本记录 SDK 与编译限制，不把“API 不暴露”写成缺探测
- `selectQuotes`：只收白名单 `{ id, note }` 合成行；测摘录、取消、超时/失败
- 日志：耗时与计数，**不含**正文、令牌、路径、照片、声音
- 开发页：显示合成夹具原文与 A/B 摘录，供人判断模型选出的内容是否更值得读；正文仍不进日志
- A：确定性原文选取。B：端侧模型选取。同一夹具 `memoir-probe-fixture.ts`
- `selectQuotes` / `cancel`：单次 in-flight，取消按 `requestId`，避免超时取消串到后一次请求

## 不做什么

不读 `lampy.db`、不扫相册、不转写录音、不写 Moment/Asset/家庭、不接云端或公用 API、不升级 Expo SDK、不实现阶段 C。
