# 最近照片显现 · 实现走查（#56）

Base：`origin/main` `b9a01440fbe790062d921753a5a8416cd3382705`（#54 merge）。  
分支 `ios/recent-photo-reveal-impl`。只改 `apps/ios`。家庭入口关闭。未卸 Liuz17，未清个人库。未重传 TestFlight。

对照设计稿：[PR #55](https://github.com/chipmuck228/lampy/pull/55) `apps/ios/spec/recent-photo-reveal/`。本文件是实现走查，不改 #55 spec。

## 收束决定（2026-10-02）

真机上用户**没有观察到**预期显现（首屏三张一起满显，看不到略淡、略低落到正常）。本轮**停止感知优化**，不继续调 opacity / 位移 / 时长，不开动画优化 PR。

未观察到效果 ≠ Photo Reveal PASS。下列真机项全部 **NOT VERIFIED**。

为保证可见照片不会停在半透明或错位，实现改为**静态退路**：`not-seen` 已是完整显示（opacity 1、translateY 0）。动画未触发、取消、失焦、切后台或测量失败时，落到 `revealed`（1 / 0）。Reduce Motion 仍直接完整显示。

## 与 #55 spec 的差异（如实）

| #55 | 本实现 |
| --- | --- |
| 初态约 0.85 / 下移 8pt | 常数仍记录 0.85 / 8 / 720ms；**显示上不使用**该初态 |
| 进入视口后再显现 | 仍按 `onScrollBeginDrag` 后探测；页面打开不自动开播 |
| 禁止首帧定时器自动开播 | 遵守。未做首屏定时显现 |
| 600–800ms ease-out | 进入 `revealing` 时仍是 720ms；因初态已是 1/0，肉眼很难看见 |
| 每张独立、revealed 不重播 | 遵守（进程内 Map） |
| Reduce Motion 直接 revealed | 遵守 |
| 缺失 / 失败不进入状态机 | 遵守 |

未提交的感知调参（0.5 / 20pt / 800ms、首屏最多一张、纸色罩）**未合入**。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（reveal / recent-moment / images / FAB） | **PASS** 30 |
| 改动文件 `expo lint` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## 自动化

状态机、视口一次进入、Reduce Motion、返回保持、静态退路、settle 见 `recent-photo-reveal.test.ts`。

## 真机（Liuz17）

用户已在 8081 上杀进程复测，未看到预期显现。本轮不再复测感知。

| 项 | 结果 |
| --- | --- |
| 单照片下滑进入后显现一次 | **NOT VERIFIED**（用户未观察到效果） |
| 多照片各自显现，不一次播完 | **NOT VERIFIED**（首屏三张一起满显） |
| 第一张略淡、略低落到正常 | **NOT VERIFIED**（用户未观察到） |
| 缺失 / 加载失败无显现 | **NOT VERIFIED** |
| 快速滚动最多一次；滚回不重播 | **NOT VERIFIED** |
| 详情返回已显现的保持 | **NOT VERIFIED** |
| 阅读位置不跳 | **NOT VERIFIED** |
| Reduce Motion 无动画、完整显示 | **NOT VERIFIED**（系统项已关；未单独验收） |
| 声音 / FAB / 本机保护不受影响 | **NOT VERIFIED** |
| 未触发 / 取消 / 失焦 / 后台后照片完整 | Jest 覆盖 settle；真机 **NOT VERIFIED** |

模拟器、VoiceOver、横屏、iPad：**NOT VERIFIED**。静态截图不算通过。
