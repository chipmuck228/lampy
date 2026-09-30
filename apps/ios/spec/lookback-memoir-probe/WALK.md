# 阶段 B 走查

分支 `ios/lookback-memoir-probe`。基线 **`origin/main` `e0c7a99`**。Jest / 模拟器 / generic 编译 **≠** 真机 PASS。PR 保持 OPEN。未开始阶段 C。未读 `lampy.db`、相册或声音。未改 Bundle ID、证书或 Sign in with Apple capability。

## SHA 与安装

| 端 | SHA / 版本 |
| --- | --- |
| `origin/main` / #41 base | `e0c7a99` |
| #41 head（本记录） | 本提交（接 `8f56740`） |
| 真机 JS | Metro `8081`，`apps/ios` 本分支（Dev Client） |
| 真机原生 | Xcode **26.6 (17F113)** Debug `iphoneos`，`Signed Time=2026-09-29 09:26:39`，`DTXcode=2660`。模块自报 `compileXcodeVersion=26.6 (17F113)`、`compileSdkVersion=26.5` |
| 设备 | Liuz17 · iPhone 17 Pro (`iPhone18,1`) · iOS **26.2** (23C55) |
| 工作区 WeChat 根目录脏文件 | 未纳入 |

`e0c7a99` 与 #41 的 `apps/ios/package-lock.json` **相同**：`expo@57.0.24`、`expo-modules-core@57.0.18`、`expo-modules-jsi@57.1.0`。

## 签名（与编译分开；更新过期结论）

先前 CLI `xcodebuild` 带签名曾 **FAIL**（Team Profile 缺 Sign in with Apple）。**用户已在 Xcode 26.6 GUI 完成真机安装**：设备上有 `app.lampy.ios` 0.1.0，原生模块已链接，`inspect()` 回报上述 compile stamp。capability 仍保留。CLI 自动签名是否仍缺 applesignin **不再当作“未安装”**。编译成功 **≠** 模型可用。

## ExpoModulesJSI（仍有效）

Xcode 26.3 / Swift 6.2.4 会在 `JavaScriptRuntime.swift:193` 起 7 条 `sending` 失败；官方路径是 Xcode 26.4+。`check-env.sh` 在低于 26.4 时失败。详见 `logs/xcode-26.3-javascriptruntime-errors.txt`。

## 真机 `inspect()`（合成探针页）

命令：`lampy:///dev/foundation-probe?walk=inspect`（Metro 已连接时不要 `terminate`，以免掉线）。证据：`logs/device-inspect.json`。

| 项 | 值 | 结果 |
| --- | --- | --- |
| native `linked` | true | **PASS** |
| `availability` | `unavailable` | **PASS**（如实；不是 available） |
| `unavailableReason` | `deviceNotEligible` | **PASS**（系统枚举，未改写成“未探测”） |
| 中文 locale | `zh_CN`；`supportsLocale` zh-Hans / zh-CN / zh-Hant = true；`supportedLanguagesIncludesChinese` = true | **PASS** |
| `contextSize` | 4096 | **PASS** |
| `tokenCount(for:)` | 本机 iOS 26.2 < 26.4，为 null，附编译限制说明 | **PASS** |
| 编译成功 ⇒ 模型可用 | 否 | **PASS**（未误报） |

## 合成中文 A/B

夹具 `memoir-probe-fixture.ts` 六条。正文只在真机页上显示，**不进本走查 JSON / 日志 / PR**。证据：`logs/device-ab.json`、`logs/device-ab-2.json`。

| 侧 | status | 耗时 | quotes / accurate / omitted | 逐条 flag |
| --- | --- | --- | --- | --- |
| A 确定性 | `ok` | 0ms | 6 / 6 / 0 | 六条均为 `exact` |
| B 本机模型 | `unavailable` | 0ms | 0 / 0 / 6 | 六条均为 `omitted` |

连续第二次 A/B：**相同**（A `ok` 6/6，B `unavailable` 0）。未串线。

人读：B 没有摘录，谈不上比 A 更值得读。A 仍可用（整段原文）。**不要把安装成功写成 B 可用。**

## 取消 / 超时 / 忙 / 重试 / 迟到

本机 `selectQuotes` 在 `deviceNotEligible` 下 **0ms 返回 unavailable**，没有进入 `LanguageModelSession.respond`。因此：

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 并行第二请求 `busy`，不串结果 | **PASS** | `logs/device-busy.json`：B1 `unavailable`，B2 `busy` |
| 取消后立即再请求 | **PASS**（两次均独立 `unavailable`，无残留 lock） | `logs/device-retry.json` |
| 短超时后立刻再请求 | **PASS**（同上，无串线） | `logs/device-stale.json` |
| 连续 A/B | **PASS** | `device-ab.json` + `device-ab-2.json` |
| 生成中取消 / 20s 超时打断正在跑的 session | **NOT VERIFIED** | 未开始生成；`cancel`/`timeout` 走查得到的是 `unavailable` 而不是 `cancelled` |
| 转云 / 读 `lampy.db` | **PASS**（未调用） | 探针只收夹具 `{id,note}`；未打开 Documents/SQLite |

## 其它

| 检查 | 结果 |
| --- | --- |
| TypeScript / 相关 Jest | **PASS** `tsc --noEmit`；Jest 10 / 10（probe 四套件） |
| 阶段 C | 未开始。本机 B 无阅读价值，**不建议进入阶段 C** |

开发页：`lampy:///dev/foundation-probe`（仅 `__DEV__`）。走查参数：`walk=inspect|ab|cancel|timeout|busy|retry|stale`。计数证据写在 App 缓存 `foundation-probe-walk.json`（无正文）。
