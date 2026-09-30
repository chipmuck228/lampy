# 首次引导、本机保护与空库走查

独立 PR #46，base `origin/main`。只改 `apps/ios`。未打开家庭入口。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 关闭。`identityLoopAccepted` 为 false。

本机保护默认关闭、需用户打开。打开后，真正离开 App（`background`）立即失效解锁资格；系统 Face ID / 密码面板引起的 `inactive` 不视为离开。开关认证与解锁认证使用不同世代：系统认证把 App 打成 `background` 时，只失效解锁，不让已成功的开关提交变 stale。

## 本轮核对

| 项 | SHA / 说明 | 结果 |
| --- | --- | --- |
| 远端 `origin/ios/first-run-lock-empty`（改前） | `15efeb4ab16f8a1093958ad83a450032e891dacd` | 已对齐 fetch |
| 本轮 JS / 将推送 head | `c62d54aa335261e893f4c684697e96d396df47e4` | 开关世代与系统认证生命周期 |
| 真机 Liuz17 已装原生包 | Xcode 工程在 `/Users/zhen/WeChatProjects/lampy`，分支 `ios/account-email-auth` `cd92863`，另含本机补进的 `ExpoLocalAuthentication` / `ExpoScreenCapture` | **不是** #46 专属 prebuild。本轮开关修复为 JS，可用 Metro 热更新。与 #46 同源原生重装：**NOT VERIFIED** |
| Metro 8081 | 启动目录 `lampy-guide/apps/ios`，进程 cwd 已核对此树 | Reload 后才是本轮 JS。改前 Metro 仍服务 `15efeb4` |
| `npx tsc --noEmit` | apps/ios | **PASS** |
| 相关 Jest | device-lock / expo-device-auth / first-run | **PASS** 7 suites / 46 tests |
| 本轮 eslint | 改动的 lock 文件 | **PASS**（0 errors） |
| `git diff --check`（本轮文件） | | **PASS** |

开发诊断只打 `[device-lock]`：`appState`、`generation`、`settingsGeneration`、`settings-start` / `settings-end`、`auth-start` / `auth-end`、`locked`、`setting`、`inFlight`。不记录正文、凭据、人脸。

## 开关 FAIL 根因（15efeb4 上的真机）

Liuz17 / iPhone 17 Pro / iOS 26.2，上一轮 JS `15efeb4`：

| 项 | 结果 |
| --- | --- |
| Face ID 和设备密码可拉起 | **PASS** |
| 切后台再回前台，需要重新认证 | **PASS** |
| 「使用 Face ID 保护 Lampy」开启或关闭 | **FAIL** |
| 首次引导、最近/回看空状态 | **NOT VERIFIED**（真机有历史记录，未卸载） |

对照代码复现关闭→开启、开启→关闭：

1. 按钮可点，`toggle()` 会发起系统认证（与「可拉起」一致）。
2. 认证成功后 `confirmEnable` / `confirmDisable` 与解锁共用 `authGeneration`。
3. iOS 系统认证常把 App 打成 `inactive`，部分机型/系统还会短暂 `background`。`lockForBackground()` 抬高解锁世代后，开关请求变成 `stale`，`persist: false`，且旧代码对 stale **不提示**。
4. 不是 Keychain 写入失败：`setEnabled` 根本没被调用。失败/取消保持原设置；看起来像开关坏了。

本轮：`beginSettingsAuth` / `settingsGeneration` 与解锁世代分开。`lockForBackground` 只抬解锁世代。开关须认证成功且 `setEnabled` 成功才改内存；写入失败回滚并提示「这次没有保存本机保护设置…」，可再点。后台迟到解锁成功仍丢弃。

## 真机 Liuz17 / iPhone 17 Pro / iOS 26.2

不卸载、不清空现有记录。首次三屏引导必须用**可丢弃的独立安装**或模拟器全新安装。历史库跳过引导 **不能**写成首次引导 PASS。模拟器通过只记模拟器 PASS，不改成真机 PASS。

| 项 | 结果 |
| --- | --- |
| 本机与账户能拉起 Face ID 或设备密码 | 用户前回 **PASS**；本轮开关修复后复测 **NOT VERIFIED** |
| 已解锁 → 真正后台 → 返回：完成新认证前遮挡 | 用户前回 **PASS**。本轮未放宽迟到成功。复测 **NOT VERIFIED** |
| 「使用 Face ID 保护 Lampy」开启 / 关闭 | 前回 **FAIL**。本轮已拆开关世代。复测 **NOT VERIFIED** |
| 认证过程中 → 后台 → 返回：迟到成功不能揭开 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 系统认证 `inactive` / 短暂 `background` 不让开关 stale | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 开关写入失败有提示且可再试 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 成功关闭后，后台与冷启动不再认证 | 自动化（后台）**PASS**。冷启动真机 **NOT VERIFIED** |
| 成功开启后，后台与冷启动仍须认证 | 自动化（后台 + 迟到成功仍锁）**PASS**。冷启动真机 **NOT VERIFIED** |
| App 切换器无私人内容 | **NOT VERIFIED** |
| 失败后保持遮挡，可见「再试一次」，不连弹 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 系统 Face ID 面板取消入口 | 由系统决定。人工取消 **NOT VERIFIED** |
| 设备密码退路 | 用户前回 **PASS**；本轮复测 **NOT VERIFIED** |
| 首次三屏引导 | 真机有历史记录，**未验收**。不记 PASS |
| 最近 / 回看空状态 | 真机有历史记录，**未验收**。不记 PASS |

## 真机复测步骤（开启 → 后台 → 认证 → 关闭 → 后台 → 冷启动）

不要卸载 Liuz17，不要清空记录。先让 Metro Reload 到本轮 JS。

1. 打开 Lampy。若保护已开，先认证进入。
2. 本机与账户 → 点「使用 Face ID 保护 Lampy」。应拉起 Face ID 或设备密码。
3. 认证成功后，文案变成「已使用 Face ID 保护 Lampy」。取消或失败应仍是关闭，可再点。
4. 回系统 Home，真正进后台，再打开 Lampy：应先遮挡，完成新认证才能进。
5. 再进本机与账户 → 点「已使用 Face ID 保护 Lampy」关闭。应再拉起认证。
6. 认证成功后，文案回到「使用 Face ID 保护 Lampy」。若出现「这次没有保存本机保护设置…」，保持原设置，再点一次。
7. 再回 Home 进后台，再打开：不应再遮挡、不应再认证。
8. 从多任务划掉 Lampy，冷启动：仍不应要求认证。

若第 3 步成功开启后，第 7–8 步仍要认证，说明关闭没有持久化。若第 4 步不遮挡，说明开启没有持久化，或后台保护回退。

## 首次引导与空状态

只用可丢弃安装或模拟器全新安装。不得卸载或清空 Liuz17 的历史记录。模拟器通过只记模拟器 PASS。

本轮未做模拟器全新安装，首次引导与空状态保持 **NOT VERIFIED**。

## 契约（实现）

- 仅 `AppState === 'background'` 调用 `lockForBackground()` 并立刻 `preventScreenCapture`。
- `inactive`（含系统认证面板）不抬解锁世代、不失效当前解锁。
- `lockForBackground` 只抬 `authGeneration`，不抬 `settingsGeneration`。
- `finishUnlock` 在 `background` 中丢弃；解锁世代被后台抬高后的迟到成功为 stale。不因修开关而接受后台迟到解锁。
- 开关：`beginSettingsAuth` → 认证 → `confirmEnable` / `confirmDisable` → `setEnabled` 成功后才保留新设置；失败或取消保持原设置；写入失败回滚并提示，可再操作。
- 从后台回到 `active` 且仍锁定、且上次不是需手动重试时，发起**一次**新认证；`inactive → active` 不自动再弹。开关进行中 `inFlight` 时不另开解锁。
- 取消 / 失败 / 抛错：保持锁定、文案、「再试一次」，不自动连弹。
