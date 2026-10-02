# 设置首页与子页 · 走查

Base：开分支时本地 `origin/main` 为 `d210b8c606de9c1e6ec16b73c39cb5f1f9a4e0ad`（#58 merge）。推 PR 前再 `git fetch`，不以该 SHA 为永恒基线。  
分支 `ios/settings-pages-reading`。#53 已关闭，未合并、未复制。  
只改 `apps/ios`。未卸 Liuz17，未清个人库，未重传 TestFlight。条款与隐私为候选稿，本 PR 不上传。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（worktree 用已有 `apps/ios/node_modules`，未提交） | **PASS** |
| 相关 Jest（account-screen / account-settings-pages / settings-nav / settings-copy / personal-settings-visibility / release-public-env） | **PASS** 38 |
| 改动文件 `npx eslint` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## 实际检查

| 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- |
| 设置分组：本机 / Lampy / 关于；关于 Lampy 不重复 | Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| 各入口进入子页，标题与短说明 | Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| 子页返回设置根；深链进入子页再返回落在 `/account` | Jest 调用 `dismissTo('/account')` | **NOT VERIFIED** | **NOT VERIFIED** |
| 设置根返回最近 | 沿用 `dismissTo('/')` | **NOT VERIFIED** | **NOT VERIFIED** |
| 条款、隐私离线可读，可滚到末尾 | Jest 文案 + 章节 | **NOT VERIFIED** | **NOT VERIFIED** |
| 无假购买 / 恢复购买 / 管理订阅 | Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| 版本只读 `nativeAppVersion` / `nativeBuildVersion` | 沿用 about Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| Release 诊断门控：关则关闭页、不发请求、首页无入口 | 沿用 account / visibility Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| 家庭入口关闭；`identityLoopAccepted` 未改 | 未改相关代码 | **NOT VERIFIED** | **NOT VERIFIED** |
| 短屏 / 横屏 / iPad / 安全区 | Jest 边距 | **NOT VERIFIED** | **NOT VERIFIED** |
| VoiceOver / Reduce Motion | 沿用标题语义与无新增动画 | **NOT VERIFIED** | **NOT VERIFIED** |
| 条款、隐私无强制勾选、无首次启动拦截 | 未改 `FirstRunGate` | — | — |

静态稿和 Jest 不等于真机 PASS。未实际操作的项标 **NOT VERIFIED**。

## 实现 SHA 与 PR

- 基线 `origin/main`：`d210b8c606de9c1e6ec16b73c39cb5f1f9a4e0ad`（#58 merge；fetch 于 2026-10-02 仍为此 SHA）
- 实现 SHA：`10add6d9abfd156a70bd443482fb92087d8e9a5e`
- PR head：`0e5cc65f8134531723c973f1a6df4173eb30f74d`（本走查记录提交）
- PR：https://github.com/chipmuck228/lampy/pull/59 ，保持 OPEN

## 尚需人工

1. 隔离安装拍设置首页及各子页；长文滚到末尾；短屏与横屏。
2. 真机确认本机保护开关仍走原认证，设置页只改分组。
3. 正式分发前确认条款、隐私候选稿：运营主体、联系渠道、适用地区、系统备份边界、依赖网络行为。
4. 若出现已验证的正式反馈渠道，再决定是否加「意见与反馈」入口。
