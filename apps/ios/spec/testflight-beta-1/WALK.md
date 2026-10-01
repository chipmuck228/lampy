# TestFlight beta-1 · 验收清单

基线：`origin/main` `b79174b346b02cb072f526af7e3ca33dac30473d`（#48）。  
分支 `ios/testflight-beta-1`。家庭入口关闭。未卸 Liuz17，未清个人库，未重置首次引导。

`origin/main` 在切开时没有 `b79174b` 之后的提交。Archive 打的是本分支工作区（准备代码 + 基线），`main.jsbundle` 不含本 markdown。提交后的准备 SHA 见「Archive 记录」。

横屏 / iPad / VoiceOver：**NOT VERIFIED**。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 全量 `npx jest --ci` | 128 suites / 675 tests **PASS**。3 fail 均在 `leave-draft-screen.test.tsx`（找不到「当时的感受，平静，已选中」）。该文件相对 `origin/main` **无改动**，记 **既有**，非本分支新增 |
| 本轮 ESLint（`release-public-env*`） | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## Release 配置

| 项 | 期望 | 实际 |
| --- | --- | --- |
| Bundle ID | `app.lampy.ios` | Archive 内 `Info.plist` = `app.lampy.ios` |
| Team | `B283NY984J` | codesign `TeamIdentifier=B283NY984J` |
| Version / Build | `0.1.0` / `1` | Archive 内 `0.1.0` / `1`。本仓库无既有 TestFlight 上传记录 |
| 家庭入口 | 关 | `inspectReleasePublicEnv(..., false).familyEntryOpen === false` |
| 家庭 API | 关 | 无 `EXPO_PUBLIC_FAMILY_API_BASE_URL` |
| 开发诊断 | 关 | `EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=0`，Release `__DEV__` false |
| 测试登录 | 关 | 诊断页关闭后，「本机设置」无测试登录 |
| AI / 回眸 | 无入口 | `apps/ios/src` 无 memoir/AI 路由 |
| 独立运行 | 不依赖 Metro | Archive 含 `main.jsbundle`；包内无 “Searching for development servers” |
| 个人数据 / Keychain / 本机保护 / 引导 | 不改语义 | 本分支不改 store key 与完成条件 |

本机 `.env` **不是** Release 依据。`release-archive.sh` 会 stash 本地 dotenv，并打印实际 `EXPO_PUBLIC_*`。

## 分发配置

| 项 | 核对 |
| --- | --- |
| Icon | `app.json` → `ios.icon` `./assets/expo.icon`，`icon` `./assets/images/icon.png` |
| Launch Screen | `expo-splash-screen` 纸色 `#F3F0E9` + `splash-icon.png` |
| 相机 | 「Lampy 只在你拍照留下一条生活时使用相机。」 |
| 相册读 | 「Lampy 只在你从相册选择已有照片留下时读取相册。」 |
| 相册写 | 「Lampy 不会把生活写回系统相册；此说明仅用于系统要求。」 |
| 麦克风 | 「Lampy 只在你录下当时的声音时使用麦克风。」 |
| Face ID | 「Lampy 只在你打开本机保护时，用 Face ID 或设备密码确认是这台设备的持有人。不会上传面部数据。」 |
| 隐私清单 | prebuild 后的 `ios/Lampy/PrivacyInfo.xcprivacy` 与用途对照，见 Archive 记录 |
| 出口合规 | **不**在 Info.plist 预写 `ITSAppUsesNonExemptEncryption`。按下方依据在 Connect 里回答 |
| 最低 iOS / iPad | 本次 prebuild `IPHONEOS_DEPLOYMENT_TARGET=16.4`，`TARGETED_DEVICE_FAMILY=1,2`。iPad 可装，**NOT VERIFIED** |

### 出口合规回答依据（不要为了跳过询问而写死声明）

个人 MVP 运行时：

- 记录明文存在本机 SQLite 与文件，没有应用层 AES 封装。
- `expo-secure-store` 把首次引导完成标记、本机保护开关、家庭会话（本包家庭关闭）交给系统 Keychain。
- 本包不连家庭 API，个人路径不发起业务 HTTPS。系统栈仍可能带 TLS。
- `@noble/hashes` 的 argon2 / SHA-256 用在 `family-api` 服务端与测试，不在个人留下/最近/回看路径。

上传时按 App Store Connect **当时**问卷作答。不要为了少点一下就在工程里设置「不含非豁免加密」。若问卷问到「是否使用加密」，应据实包含系统 Keychain / 可能的 TLS，再按苹果当前豁免项往下选。

## Archive 记录

| 项 | 值 |
| --- | --- |
| git SHA（基线 / 切开时 HEAD） | `b79174b346b02cb072f526af7e3ca33dac30473d` |
| 准备分支提交 | （本提交；Archive 工作区已含这些文件） |
| version / build | `0.1.0` / `1` |
| Xcode | 26.6（17F113） |
| Bundle ID / Team | `app.lampy.ios` / `B283NY984J` |
| 实际 `EXPO_PUBLIC_*`（脚本打印，已 stash 本机 `.env`） | `ACCOUNT_DIAGNOSTICS=0`；家庭入口/API/test driver 空 |
| 功能开关 | 家庭关、诊断关、测试登录关、AI 无入口 |
| Archive 结果 | **SUCCEEDED** → `/tmp/lampy-testflight-beta-1/Lampy.xcarchive` |
| embedded JS | 有 `main.jsbundle`（约 3.2MB） |
| 签名 | 本地 Archive 为 `Apple Development: Zhen Liu (H36468MSTC)`。上传时须在 Organizer 再签 App Store Connect |
| 隐私清单 | UserDefaults `CA92.1`、FileTimestamp `C617.1`、SystemBootTime `35F9.1`；无收集类型；`NSPrivacyTracking=false`。与本机存储/文件时间/运行时计时相符，无分析 SDK |
| Dev Client 残留 | `expo-dev-client` 仍在 plugin 里；Info.plist 生成过 `exp+lampy-ios` / Bonjour。Release 有 Strip Local Network Keys 脚本。测试员若仍看到开发启动器，这一包不能当外测 |

构建成功 ≠ TestFlight 安装验收。第一次 `pod install` 因 GitHub 超时失败；带本机代理后成功。

## TestFlight 安装后（六项）

须用 **TestFlight 安装包**，不能用 Dev Client / Metro。Liuz17 可装，但不要卸、不要清库、不要重置引导。

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
