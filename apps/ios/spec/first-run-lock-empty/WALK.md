# 首次引导、本机保护与空库走查

独立 PR #46，base `origin/main`。只改 `apps/ios`。未打开家庭入口。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 关闭。`identityLoopAccepted` 为 false。

本机保护默认关闭。认证与后台规则：真正 `background` 失效解锁；系统认证 `inactive` 不视为离开；设置提交与会话解锁资格分开。

账户设置标题「本机保护」，系统 Switch，「已开启 / 未开启」。未在正式 App 增加「重置首次使用」按钮。未卸载 Liuz17。

## 合并前核对（2026-09-30）

| 项 | SHA / 说明 | 结果 |
| --- | --- | --- |
| 将合并 head | `807628eeb9cc5dc7222d08dedfa273acdfe9da51` | 无新阻塞 |
| 媒体路径恢复 | 旧容器 UUID → 当前 `Documents/lampy-assets/<文件名>`；拒绝 `..` | 代码 + Jest **PASS**。真机文件若已不在盘上无法恢复，**不阻塞合并** |
| 缺原生模块 | 先 `requireOptionalNativeModule`，再加载 Face ID / ScreenCapture JS | Jest **PASS** |
| `npx tsc --noEmit` | | **PASS** |
| 相关 Jest | media / device-auth / screen-privacy / device-lock / first-run-gate / image / audio | **PASS** 8 suites / 89 tests |
| 本轮 eslint | 上述改动文件 | **PASS**（0 errors） |
| 首次引导主路径 | iPhone 17 Pro 模拟器，Xcode 重装 | **PASS**（用户）。不复测 |
| 真机保护开关 / 后台 / 冷启动 | `344a5c6` 及之后用户走查 | **PASS**。不复测 |

## 真机 Liuz17 / iPhone 17 Pro / iOS 26.2

不卸载、不清空记录。

| 项 | 结果 |
| --- | --- |
| 开启 / 关闭保护，开启后后台遮挡 | **PASS** |
| 关闭后后台返回、关闭后冷启动 | **PASS** |
| 本机保护新文案 | Reload 本 head 后 **NOT VERIFIED**，不阻塞 |
| 历史照片/声音「暂时找不到」 | 记录保留。路径恢复已测自动化。盘上无文件则无法找回。真机是否恢复 **NOT VERIFIED**，不阻塞 |
| 首次三屏 / 空库 | 真机有历史，**不记 PASS** |

## 模拟器 iPhone 17 Pro

模拟器 PASS ≠ 真机 PASS。不复测已通过的首次引导。

| 项 | 结果 |
| --- | --- |
| 三屏后「留下瞬间」，留下第一条 | **PASS**（用户 2026-09-30） |
| 中途退出、空状态原文、杀进程、短屏 | 自动化覆盖；本次 UI 未逐项走，**不阻塞** |

## 契约

- `background` 才 `lockForBackground()`；`inactive` 不失效解锁。
- 设置提交与 `sessionUnlocked` 分开。
- 引导只在最后一步 `markCompleted`。
- 原生模块缺失时不加载对应 JS。
- 个人媒体只认 `lampy-assets` 下的文件名，不跟随 `..`。
