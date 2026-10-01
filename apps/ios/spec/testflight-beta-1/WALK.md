# TestFlight beta-1 · 验收清单

基线：`origin/main` `b79174b346b02cb072f526af7e3ca33dac30473d`（#48）。  
分支 `ios/testflight-beta-1`。家庭入口关闭。未卸 Liuz17，未清个人库，未重置首次引导。

`origin/main` 在切开后没有后续提交。Archive 打进包的 JS 来自 `9142760cb2632f0f9a7a24fb7608a902c6f8c8c9`。本轮补检查只改测试、脚本和文档，**未重新 Archive**。文档 / 脚本 head 见文末。

横屏 / iPad / VoiceOver：**NOT VERIFIED**。

顺序：上传（不要选 Internal Only）→ 本人 Internal Testing → 六项 MVP 回归 → 外部 Beta 审核 → 邀请测试用户。

## 命令

在 `apps/ios`，且 **未** `source` `release-public-env.sh`（该脚本会留下 `NODE_ENV=production`，Jest 会变成 `actImplementation is not a function`）：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --ci`（全量） | **129 suites / 678 tests passed，0 failed**。不要写成「全量 PASS 但有 3 个失败」。 |
| 本轮 ESLint（leave-draft 测试、release-public-env、inspect-release-archive） | **PASS** |
| `node --test scripts/inspect-release-archive.test.cjs` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |
| `bash scripts/release-archive.sh --inspect /tmp/lampy-testflight-beta-1/Lampy.xcarchive` | **PASS**（problems=none）。输出含 `flags_release_pages=NOT_VERIFIED`、`runtime_metro_independent=NOT_VERIFIED` |
| `bash scripts/release-archive.sh`（本地已有 `ios/`，未设 `LAMPY_ALLOW_PREBUILD_CLEAN`） | **exit 2**，未覆盖 `ios/`；dotenv 已恢复 |

## leave-draft 三项失败：隔离对照

同一依赖（`apps/ios/node_modules`）、同一命令：

```
unset NODE_ENV BABEL_ENV
npx jest --ci --runInBand src/screens/leave-draft-screen.test.tsx
```

隔离 worktree：

| 树 | SHA | 结果 |
| --- | --- | --- |
| `/tmp/lampy-jest-base` | `b79174b346b02cb072f526af7e3ca33dac30473d` | 3 failed / 11 passed / 14 |
| `/tmp/lampy-jest-pr49` | `ff09b61c4aeabe318cd0af323f201408189a3a87`（对照时的 #49 head） | 3 failed / 11 passed / 14 |

两边失败信息相同：

1. `lets a restored draft keep being edited` — 找不到「当时的感受，平静，已选中」
2. `removes one restored photo without abandoning the draft` — 同上
3. `persists edits on a restored draft` — 找不到 `composer-feeling-高兴`（芯片未展开）

`leave-draft-screen.test.tsx` 与 `moment-feeling.tsx` 在两棵树上 **内容相同**。这不是「文件没改所以既有」的推断，而是基线与 #49 用同一命令跑出的同一结果。

根因：恢复且已有感受时，`FeelingPicker` 的 `chipsVisible = !selected || open`，默认收起。真实可访问性是折叠按钮「当时的感受，平静」（`expanded=false`），芯片「…，已选中」不在树上。`leave-feeling-screen.test.tsx` 已按此写；draft 测试仍按展开态断言。

修正：按折叠语义断言；覆盖草稿文字 / 照片 / 放弃仍在。改感受前先展开。修正后该文件 **14 passed**。全量变为 **678 passed / 0 failed**。

## Release 配置

| 项 | 期望 | 实际 |
| --- | --- | --- |
| Bundle ID | `app.lampy.ios` | Archive `Info.plist` = `app.lampy.ios` |
| Team | `B283NY984J` | codesign `TeamIdentifier=B283NY984J` |
| Version / Build | `0.1.0` / `1` | Archive 内 `0.1.0` / `1`。本仓库无既有 TestFlight 上传记录 |
| 功能开关 · 构建环境 | 已核对 | stash 后报告 `EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=0`，家庭入口/API/test driver 空。`.env.production` 关闭。**不是**设备页验收 |
| 功能开关 · Release / TestFlight 页 | 待安装 | **NOT VERIFIED**。inspect **不能**写成「实际 bundle 功能开关关闭态已验证」 |
| 含 bundle | 有 `main.jsbundle` | 有（约 3.2MB）。inspect 只核元数据、bundle 存在、少量字符串（无 `family.example` / 无开发启动器文案） |
| 运行时不依赖 Metro | 须安装验证 | **`runtime_metro_independent=NOT_VERIFIED`**。有 bundle ≠ 运行时不依赖 Metro |
| 个人数据 / Keychain / 本机保护 / 引导 | 不改语义 | 本分支不改 store key 与完成条件 |

本机 `.env` **不是** Release 依据。`release-archive.sh` 会 stash 本地 dotenv；失败或中断后若构建期未生成同名文件则恢复，否则保留构建期文件、原件留在 stash。`--inspect` 的 version/build 期望值读 `app.json`，不写死 `0.1.0` / `1`。inspect 不能代替页面上的功能开关验收。

## 分发配置

| 项 | 核对 |
| --- | --- |
| Icon | `app.json` → `ios.icon` `./assets/expo.icon`，`icon` `./assets/images/icon.png` |
| Launch Screen | `expo-splash-screen` 纸色 `#F3F0E9` + `splash-icon.png` |
| 相机 / 相册 / 麦克风 / Face ID | 文案见 prebuild `Info.plist`，与 README 一致 |
| 隐私清单 | **不能**只看主工程三项。实际 Archive 里有 10 份 `PrivacyInfo.xcprivacy`，见下 |
| 出口合规 | **不**在 Info.plist 预写 `ITSAppUsesNonExemptEncryption` |
| 最低 iOS / iPad | prebuild `IPHONEOS_DEPLOYMENT_TARGET=16.4`，`TARGETED_DEVICE_FAMILY=1,2`。iPad 可装，**NOT VERIFIED** |

### 出口合规回答依据

个人 MVP 运行时：

- 记录明文存在本机 SQLite 与文件，没有应用层 AES 封装。
- `expo-secure-store` 把首次引导完成标记、本机保护开关、家庭会话（本包家庭关闭）交给系统 Keychain。
- 本包不连家庭 API，个人路径不发起业务 HTTPS。系统栈仍可能带 TLS。
- `@noble/hashes` 的 argon2 / SHA-256 用在 `family-api` 服务端与测试，不在个人留下/最近/回看路径。

上传时按 App Store Connect **当时**问卷作答。不要为了少点一下就在工程里设置「不含非豁免加密」。

### 隐私清单（实际 Archive，不是只看主工程）

`inspect` 列出 10 份。主工程 `PrivacyInfo.xcprivacy`：UserDefaults `CA92.1`、FileTimestamp `C617.1`、SystemBootTime `35F9.1`；无收集类型；`NSPrivacyTracking=false`。

依赖一并打进包的清单（类型与主工程重叠，**不是**「已证明所有依赖合规」的结论）：

- `ExpoConstants_privacy` UserDefaults CA92.1
- `ExpoDevice_privacy` SystemBootTime 35F9.1
- `ExpoSystemUI_privacy` UserDefaults CA92.1
- `React-Core_privacy` FileTimestamp C617.1 + UserDefaults CA92.1
- `React-cxxreact_privacy` FileTimestamp C617.1
- `React-timing_privacy` SystemBootTime 35F9.1
- `ReactNativeDependencies_{boost,folly,glog}` FileTimestamp / SystemBootTime

这是库存。Apple 是否接受、是否还有未声明 API，要等上传后的 Connect 检查，不能在这里写 PASS。

## Archive 记录

| 项 | 值 |
| --- | --- |
| 基线 SHA | `b79174b346b02cb072f526af7e3ca33dac30473d` |
| **构建 / 打包 SHA** | `9142760cb2632f0f9a7a24fb7608a902c6f8c8c9`（打进 `main.jsbundle` 的工作区）。本轮未改打包进 App 的源码，未重新 Archive |
| **文档 / 脚本 head** | 本收尾提交（inspect 结论分层、version/build 读 `app.json`）。**构建 SHA 仍为 `9142760cb2632f0f9a7a24fb7608a902c6f8c8c9`** |
| version / build | `0.1.0` / `1` |
| Xcode | 26.6（17F113） |
| Bundle ID / Team | `app.lampy.ios` / `B283NY984J` |
| 功能开关 · 构建环境 | 已核对（打包时的 `EXPO_PUBLIC_*`） |
| 功能开关 · 页面 | **NOT VERIFIED** |
| inspect 范围 | plist / Team / version·build（来自 `app.json`）/ `main.jsbundle` / 少量字符串。**不是**功能开关关闭态 |
| Archive 结果 | 仍为先前 **SUCCEEDED** → `/tmp/lampy-testflight-beta-1/Lampy.xcarchive`。运行代码仍为 `9142760`。本轮只改脚本和文档，保留该 Archive |
| embedded JS | 有 `main.jsbundle` |
| 运行时不依赖 Metro | **NOT VERIFIED**（须 TestFlight 安装） |
| 签名 | 本地 Archive 为 `Apple Development: Zhen Liu (H36468MSTC)`。上传时须在 Organizer 再签 App Store Connect |
| Dev Client 残留 | `expo-dev-client` 仍在 plugin 里。测试员若仍看到开发启动器，这一包不能当外测 |

构建成功 ≠ TestFlight 安装验收。有 `main.jsbundle` ≠ 运行时不依赖 Metro。

## TestFlight 安装后（六项）

须用 **TestFlight 安装包**，不能用 Dev Client / Metro。建议本人 Internal Testing 先走完。Liuz17 可装，但不要卸、不要清库、不要重置引导。

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 无需登录、无需网络，留下一条文字 | **NOT VERIFIED**（未装 TestFlight 包） |
| 2 | 最近：已选感受有色点，未选无点，详情无色点 | **NOT VERIFIED** |
| 3 | 回看：日期行、摘录 → 详情 → 返回 | **NOT VERIFIED** |
| 4 | 最大字号无裁切 | **NOT VERIFIED** |
| 5 | 播放走一次，无回归 | **NOT VERIFIED** |
| 6 | 本机保护走一次，无回归 | **NOT VERIFIED** |

## 仍 NOT VERIFIED

横屏、iPad、VoiceOver。
