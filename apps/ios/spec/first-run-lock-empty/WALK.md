# 首次引导、本机保护与空库走查

独立 PR #46，base `origin/main`。只改 `apps/ios`。未打开家庭入口。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 关闭。`identityLoopAccepted` 为 false。

本机保护默认关闭、需用户打开。打开后，真正离开 App（`background`）立即失效解锁资格；系统 Face ID / 密码面板引起的 `inactive` 不视为离开。

## 本轮核对

| 项 | SHA / 说明 | 结果 |
| --- | --- | --- |
| 远端 `origin/ios/first-run-lock-empty`（改前） | `64f175adab2c388ecd45def0ccafdd03d0b43c41` | 已对齐 fetch |
| 本轮 JS / 将推送 head | 见提交后 `git rev-parse HEAD` | 本轮代码 |
| 真机 Liuz17 已装原生包 | Xcode 工程在 `/Users/zhen/WeChatProjects/lampy`，当时分支 `ios/account-email-auth` `cd92863`，另含本机补进的 `ExpoLocalAuthentication` / `ExpoScreenCapture` | **不是** #46 专属 prebuild。本轮 AppState 修复为 JS，可用 Metro 热更新。与 #46 同源原生重装：**NOT VERIFIED** |
| Metro 8081 | 启动目录 `lampy-guide/apps/ios` | 需 Reload 后才是本轮 JS |
| `npx tsc --noEmit` | apps/ios | **PASS** |
| 相关 Jest | device-lock / expo-device-auth / first-run | **PASS** 5 suites / 32 tests |
| 本轮 eslint | 改动的 lock / auth 文件 | **PASS**（0 errors；`require()` 为按需加载原生模块） |
| `git diff --check`（本轮文件） | | **PASS** |

开发诊断只打 `[device-lock]`：`appState`、`generation`、`auth-start` / `auth-end`、`locked`。不记录正文、凭据、人脸。

## 真机 Liuz17 / iPhone 17 Pro / iOS 26.2

不卸载、不清空现有记录。首次三屏引导必须用**可丢弃的独立安装**，历史库跳过引导 **不能**写成首次引导 PASS。

| 项 | 结果 |
| --- | --- |
| 本机与账户能拉起 Face ID 或设备密码 | 用户前回 **PASS**；本轮改完后复测 **NOT VERIFIED** |
| 已解锁 → 真正后台 → 返回：完成新认证前遮挡 | 前回 **FAIL**（无遮挡）。本轮已改生命周期。复测 **NOT VERIFIED** |
| 认证过程中 → 后台 → 返回：迟到成功不能揭开 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 系统认证 `inactive` 不锁死、不连弹 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| App 切换器无私人内容 | **NOT VERIFIED** |
| 失败后保持遮挡，可见「再试一次」，不连弹 | 自动化 **PASS**。真机 **NOT VERIFIED** |
| 系统 Face ID 面板取消入口 | 由系统决定。人工取消 **NOT VERIFIED**（前回未能取消） |
| 设备密码退路 | 用户前回 **PASS**；本轮复测 **NOT VERIFIED** |
| 首次三屏引导 | 真机有历史记录，**未验收**。不记 PASS |

## 契约（实现）

- 仅 `AppState === 'background'` 调用 `lockForBackground()` 并立刻 `preventScreenCapture`。
- `inactive`（含系统认证面板）不抬世代、不失效当前解锁。
- `finishUnlock` 在 `background` 中丢弃；世代被后台抬高后的迟到成功为 stale。
- 从后台回到 `active` 且仍锁定、且上次不是需手动重试时，发起**一次**新认证；`inactive → active` 不自动再弹。
- 取消 / 失败 / 抛错：保持锁定、文案、「再试一次」，不自动连弹。
