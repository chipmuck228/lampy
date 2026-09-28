# 阶段 B 走查

分支 `ios/lookback-memoir-probe`。基线 `origin/main` `e0c7a99`（#40 merge）。Jest / 模拟器 / generic 编译 **≠** 真机 PASS。PR 保持 OPEN。未开始阶段 C。`app.lampy.ios` 的 Sign in with Apple entitlement **未删除**。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- `npx jest --no-coverage`：102 suites / 526 tests
- `git diff --check`：通过

## 1. 付费会员 Team ID（Apple Developer 账户）

**NOT VERIFIED。** 不以 Xcode 显示名 “Zhen Liu” 判断团队类型。

打开 `https://developer.apple.com/account` 被重定向到 Apple ID 登录页：

- 标题：`登录 - Apple`
- 界面：`登录 Apple Developer`、Apple Account 输入框、`继续`
- 截图：`shots/apple-developer-account-signin.png`

本环境没有可用的 Developer 门户会话，因此**不能**从 Membership 页确认已生效的付费 Team ID 是否为 `B283NY984J`。

Xcode 账户同步记录（仍不是门户 Membership 页）里，当前 Apple ID 只挂了一个 team：`B283NY984J`，字段 `isFreeProvisioningTeam = true`、`teamType = Personal Team`。这只能说明 Xcode 此刻拿到的是免费个人开发团队记录，不能代替门户上的付费会员确认。

## 2. App ID 与开发 Profile

**App ID Sign in with Apple（门户）：NOT VERIFIED** — 同一登录页挡住 Identifiers。

**刷新/新签发开发 Profile：FAIL。** `xcodebuild -allowProvisioningUpdates` 对 Liuz17：

```
Cannot create a iOS App Development provisioning profile for "app.lampy.ios".
Personal development teams, including "Zhen Liu", do not support the Sign In with Apple capability.
```

现有 Team Profile（不打印内容）：名称 `iOS Team Provisioning Profile: app.lampy.ios`；Team `B283NY984J`；**含** Liuz17 UDID；entitlement **键不含** `com.apple.developer.applesignin`。应用 entitlements 仍要求该键。

未删正式 App capability。未把 generic 编译当作真机成功。

## 3. Liuz17 安装

| 检查 | 结果 |
| --- | --- |
| 用含 UDID + applesignin 的开发 Profile 签名安装 | **FAIL** — 没有这样一份 Profile；个人团队签发被拒。Liuz17 已配对（iPhone 17 Pro / iOS 26.2） |

## 4. 真机探针（合成数据）

未装上本轮 Dev Client，下列均 **NOT VERIFIED**，不是 PASS。

| 检查 | 结果 |
| --- | --- |
| `inspect`（availability、supportsLocale、supportedLanguages、contextSize） | **NOT VERIFIED** |
| 中文 A/B 摘录出现在开发页 | **NOT VERIFIED** |
| 人读：模型是否比确定性选取更值得读 | **NOT VERIFIED** |
| 取消（按 requestId，不串线） | **NOT VERIFIED** |
| 耗时 | **NOT VERIFIED** |

即使以后模型 `available`，仍要单独判断阅读收益；本轮没有真机摘录可评。

## 门户阻碍与 Apple Developer Support

界面阻碍就是上一节的 **Apple Developer 登录页**，不是 Identifiers 里某条 capability 开关的截图。因此也无法在门户提交 Support 工单。

登录后应核：Membership 是否为已生效的 Apple Developer Program、Team ID 是否为 `B283NY984J`、`app.lampy.ios` 是否已启用并配置 Sign in with Apple，然后重新生成含 Liuz17 UDID 与 `applesignin` 的 Development Profile。

查询入口（登录后）：[developer.apple.com/contact](https://developer.apple.com/contact/)。能力对照：[Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios) — Sign in with Apple 仅列在付费 ADP / ADEP，不含免费 Apple Developer。

## 其它（非真机）

| 检查 | 环境 | 结果 |
| --- | --- | --- |
| TypeScript / Jest | 本机 | **PASS** 102 / 526 |
| 模块编译 | generic iOS，无签名 | **PASS（仅编译）**，不是真机 |
| 模拟器 iOS 18.6 | iPhone 16 | 上一轮 `osBelow26`。见 `shots/sim-iphone16-osbelow26.png` |
| 阶段 C | — | 未开始；证据仍不够 |

开发页：`lampy:///dev/foundation-probe`（仅 `__DEV__`）。
