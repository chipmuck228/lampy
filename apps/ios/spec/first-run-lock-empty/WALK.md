# 首次引导、本机保护与空库走查

独立 PR #46，base `origin/main`。只改 `apps/ios`。未打开家庭入口。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 关闭。`identityLoopAccepted` 为 false。

本机保护默认关闭、需用户打开。打开后，真正离开 App（`background`）立即失效解锁资格；系统 Face ID / 密码面板引起的 `inactive` 不视为离开。

开关与解锁拆成两个结果：`settingsGeneration` 决定设置能否提交；前台解锁资格由 `sessionUnlocked` / `unlockEpoch` 决定。设置认证可以保存开启或关闭，但不能在真正 background 之后无条件重新授予解锁资格。

## 本轮核对

| 项 | SHA / 说明 | 结果 |
| --- | --- | --- |
| 远端 `origin/ios/first-run-lock-empty`（改前） | `c768b6951a2240505895b29b0a2333bfdc0f22fc` | 已对齐 fetch |
| 本轮 JS / 将推送 head | `964575f1fbd726e67a2e482bacf09d25e97cb5bf` | 设置持久化与会话解锁资格分开 |
| 真机 Liuz17 已装原生包 | Xcode 工程在 `/Users/zhen/WeChatProjects/lampy`，分支 `ios/account-email-auth` `cd92863`，另含本机补进的 `ExpoLocalAuthentication` / `ExpoScreenCapture` | **不是** #46 专属 prebuild。本轮为 JS，Metro Reload。同源原生重装：**NOT VERIFIED** |
| Metro 8081 | 启动目录 `lampy-guide/apps/ios` | Reload 后才是本轮 JS。改前为 `c768b69` |
| `npx tsc --noEmit` | apps/ios | **PASS** |
| 相关 Jest | device-lock / expo-device-auth / first-run | **PASS** 7 suites / 50 tests |
| 本轮 eslint | 改动的 lock 文件 | **PASS**（0 errors） |
| `git diff --check`（本轮文件） | | **PASS** |

开发诊断只打 `[device-lock]`：`appState`、`generation`、`settingsGeneration`、`settings-start` / `settings-end`、`auth-start` / `auth-end`、`locked`、`setting`、`inFlight`。不记录正文、凭据、人脸。

## 开关 FAIL 根因（15efeb4）与本轮补强

Liuz17 / iPhone 17 Pro / iOS 26.2，`15efeb4`：Face ID 可拉起 **PASS**，后台返回重认证 **PASS**，账户开关 **FAIL**。根因是开关与解锁共用世代，系统认证引起的 `background` 把开关提交判成 stale。

`c768b69` 拆开 `settingsGeneration` 后，迟到的开关认证可以保存设置，但 `confirmEnable` / `revertDisable` 仍会把 `sessionUnlocked` 设回 true，等于用设置认证或回滚恢复已因后台失效的会话。

本轮：

- `confirmEnable` 仅在本次开关认证期间没有真正 background 时授予解锁资格。
- `confirmDisable` 只改设置；关闭持久化成功即解除保护。
- `revertEnable` / `revertDisable` 只恢复设置，不重新授予解锁。关闭写入失败恢复「开启」，并保留期间的后台锁定。
- `inactive` 不抬 `unlockEpoch`，前台开关仍成功。

## 真机 Liuz17 / iPhone 17 Pro / iOS 26.2

不卸载、不清空现有记录。首次三屏引导必须用**可丢弃的独立安装**或模拟器全新安装。模拟器通过只记模拟器 PASS，不改成真机 PASS。

| 项 | 结果 |
| --- | --- |
| 本机与账户能拉起 Face ID 或设备密码 | 用户前回 **PASS**；本轮复测 **NOT VERIFIED** |
| 前台开启 / 关闭（仅系统认证 `inactive`） | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 开启认证等待 → 真正后台 → 迟到成功：设置已开，内容仍遮挡，返回后需新认证 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 关闭认证成功 → 写入等待 → 后台 → 写入失败：仍开启且锁定 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 关闭持久化成功后，后台与冷启动不再认证 | 自动化（后台）**PASS**。冷启动真机 **NOT VERIFIED** |
| 已解锁 → 真正后台 → 返回：完成新认证前遮挡 | 用户前回 **PASS**。未放宽迟到解锁。复测 **NOT VERIFIED** |
| 认证过程中 → 后台 → 迟到解锁成功不能揭开 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| App 切换器无私人内容 | **NOT VERIFIED** |
| 失败后保持遮挡，「再试一次」，不连弹 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 首次三屏引导 / 空状态 | 真机有历史记录，**未验收**。不记 PASS |

## 真机复测步骤

不要卸载 Liuz17，不要清空记录。先 Metro Reload 到本轮 JS。

### A. 前台开关（inactive 不算失败）

1. 本机与账户 → 点「使用 Face ID 保护 Lampy」。系统认证面板出现时不要按 Home。
2. 认证成功：文案变为「已使用 Face ID 保护 Lampy」，私人内容仍可见，不必立刻再解一次。
3. 再点关闭并在前台完成认证：文案回到「使用 Face ID 保护 Lampy」。

### B. 开启过程中真正进后台

1. 保护关闭时点开启，Face ID 出现后按 Home，真正进后台。
2. 若认证仍成功：回来应看到设置已是「已使用…」，但私人内容被遮挡，需一次**新的**解锁认证。迟到成功不能直接揭开。

### C. 关闭写入失败且期间进过后台

1. 保护已开并已解锁。点关闭，认证成功后，若保存失败并出现「这次没有保存本机保护设置…」：设置仍是开启。
2. 若保存过程中真正进过后台：失败回滚后应保持开启，且会话仍锁定，须重新解锁。不能因为回滚而自动揭开。

### D. 开启 → 后台 → 认证 → 关闭 → 后台 → 冷启动

1. 前台成功开启。
2. 回 Home 进后台，再打开：应遮挡，完成新认证才能进。
3. 前台成功关闭。
4. 再进后台再打开：不应再认证。
5. 划掉 App 冷启动：仍不应要求认证。

## 首次引导与空状态

只用可丢弃安装或模拟器全新安装。不得卸载或清空 Liuz17 的历史记录。模拟器通过只记模拟器 PASS。

本轮未做模拟器全新安装，首次引导与空状态保持 **NOT VERIFIED**。

## 契约（实现）

- 仅 `AppState === 'background'` 调用 `lockForBackground()`：抬 `authGeneration` 与 `unlockEpoch`，并清掉 `sessionUnlocked`。立刻 `preventScreenCapture`。
- `inactive` 不抬世代、不失效当前解锁，也不让前台开关失败。
- 开关提交看 `settingsGeneration`；会话解锁资格看 `sessionUnlocked`。二者分开。
- `confirmEnable` 可 persist；仅当本次开关认证期间没有真正 background 时才授予解锁。
- `confirmDisable` 可 persist；关闭成功即解除保护。不靠设置认证恢复已失效的解锁资格。
- `revertEnable` / `revertDisable` 只恢复设置，不把已因后台失效的会话改回已解锁。
- `finishUnlock` 在 `background` 中丢弃；解锁世代被后台抬高后的迟到成功为 stale。
- 从后台回到 `active` 且仍锁定、且上次不是需手动重试时，发起**一次**新认证。
- 取消 / 失败 / 抛错：保持原设置或保持锁定；写入失败明确提示，可再操作。
