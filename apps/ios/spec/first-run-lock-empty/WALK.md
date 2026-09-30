# 首次引导、本机保护与空库走查

独立 PR #46，base `origin/main`。只改 `apps/ios`。未打开家庭入口。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 关闭。`identityLoopAccepted` 为 false。

本机保护默认关闭。认证与后台规则未改：真正 `background` 失效解锁；系统认证 `inactive` 不视为离开；设置提交与会话解锁资格分开。

账户设置固定标题「本机保护」，系统 Switch，状态为「已开启 / 未开启」。认证或保存期间禁用重复操作；仅成功保存后更新开关。

未在正式 App 增加「重置首次使用」按钮。不把强制显示引导当成完整首次安装验收。未卸载、清空或重置 Liuz17。

## 本轮核对

| 项 | SHA / 说明 | 结果 |
| --- | --- | --- |
| 远端 `origin/ios/first-run-lock-empty`（改前） | `344a5c6857ca6a08b700dd748bd113d56b1e9c06` | 已对齐 |
| 本轮 JS / 将推送 head | 提交后填入 | 设置文案 + 真机记录 + 首次引导测试 |
| 真机 Liuz17 原生包 | `/Users/zhen/WeChatProjects/lampy`，`ios/account-email-auth` `cd92863` + 本机 Face ID pods | 不是 #46 专属 prebuild。JS 走 Metro。同源原生重装：**NOT VERIFIED** |
| Metro 8081 | `lampy-guide/apps/ios` | 改前 JS `344a5c6`。Reload 后才是本轮 |
| 模拟器 Lampy.app | DerivedData 仅有 `Debug-iphoneos`，本轮未编出 simulator 包 | 完整全新安装 UI 走查 **NOT VERIFIED**（不记模拟器 PASS） |
| `npx tsc --noEmit` | | **PASS** |
| 相关 Jest | device-lock / account / expo-device-auth / first-run | **PASS** 8 suites / 69 tests |
| 本轮 eslint | 改动的 lock / account / first-run 测试 | **PASS** |
| `git diff --check` | 本轮文件 | **PASS** |

## 真机 Liuz17 / iPhone 17 Pro / iOS 26.2

走查 JS：`344a5c6`。不卸载、不清空记录。

| 项 | 结果 |
| --- | --- |
| 开启保护，Face ID / 设备密码成功，显示开启 | **PASS**（`344a5c6`） |
| 再次操作可关闭保护 | **PASS**（`344a5c6`） |
| 开启后后台返回遮挡 | **PASS**（`344a5c6`） |
| 关闭后后台返回不认证 | **NOT VERIFIED** |
| 关闭后冷启动不认证 | **NOT VERIFIED** |
| 本机保护标题 + 系统 Switch + 已开启/未开启 | 本轮新文案。真机 **NOT VERIFIED**（须 Reload 本轮 JS） |
| 首次三屏引导 / 最近与回看空状态 | 真机有历史，**不记 PASS** |

## 模拟器（与真机分列）

| 项 | 结果 |
| --- | --- |
| 构建 / JS | 本轮无 simulator `.app`。自动化对 #46 JS |
| 三屏上滑/继续，最后「留下瞬间」才完成 | 自动化 **PASS**。全新安装 UI **NOT VERIFIED** |
| 中途退出再开，不提前记完成 | 自动化 **PASS**。全新安装 UI **NOT VERIFIED** |
| 完成后最近空状态「这里，留下自己的生活。」 | 自动化 **PASS**。全新安装 UI **NOT VERIFIED** |
| 回看空状态「还没有可以按时间回看的记录。」 | 自动化有空书页文案。全新安装 UI **NOT VERIFIED** |
| 留下第一条后空状态说明消失 | 由 `isFirstUse`（库空）驱动。全新安装 UI **NOT VERIFIED** |
| 杀进程重开不重播已完成引导 | 自动化：`completed` 后不再显示。全新安装 UI **NOT VERIFIED** |
| 最大字号、短屏下正文与底部按钮可操作 | 引导底栏 `flexShrink: 0`，正文可滚。全新安装 UI **NOT VERIFIED** |

模拟器通过只记模拟器 PASS。上表 UI 项未做成全新安装，故不记模拟器 PASS。

## 真机复测（本轮文案，Reload 后）

不要卸载 Liuz17。

1. 本机与账户应看到标题「本机保护」、系统开关、「未开启」或「已开启」。
2. 说明为：「开启后，进入 Lampy 需要 Face ID 或设备密码。」
3. 拨动开关应拉起认证；认证或保存期间开关不可再拨。
4. 只有保存成功后，「已开启 / 未开启」才变。取消或失败保持原状态，可见现有重试文案。
5. 已记录：`344a5c6` 上开启、关闭、开启后后台遮挡均为 PASS。
6. 仍待：关闭后后台返回、关闭后冷启动。

## 首次引导（仅可丢弃安装或全新模拟器）

1. 三屏可上滑或点继续；前两屏不得记完成。
2. 最后一屏「留下瞬间」成功写入后才离开引导。
3. 应看到最近空状态，以及回看空说明。
4. 留下第一条后，最近空状态说明消失。
5. 杀进程再开，不重播引导。
6. 最大字号与短屏：正文可滚，底部按钮可点。

不得用正式 App 里的重置入口，也不得把强制显示引导当成完整首次安装。

## 契约（实现，本轮未改认证/后台）

- `background` 才 `lockForBackground()`；`inactive` 不失效解锁。
- 设置提交与 `sessionUnlocked` 分开；迟到设置认证不恢复已失效会话。
- 开关 UI 只在 hydrate 或 `toggle` 结束后按已提交设置更新；`settingsBusy` 时禁用 Switch。
- 引导只在最后一步 `markCompleted`；中途退出不写完成。
