# 设置首页与子页 · 走查

Base：开分支时本地 `origin/main` 为 `d210b8c606de9c1e6ec16b73c39cb5f1f9a4e0ad`（#58 merge）。合并前再 `git fetch`，不以该 SHA 为永恒基线。  
分支 `ios/settings-pages-reading`。#53 已关闭，未合并、未复制。  
只改 `apps/ios`。未卸 Liuz17，未清个人库，未重传 TestFlight。

条款与隐私仍是 **MVP 候选稿**。合并本 PR **不等于**正式文本审核完成，也不等于可以上传 TestFlight。发布前待确认清单见 [`README.md`](./README.md) §3。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（worktree 用已有 `apps/ios/node_modules`，未提交） | **PASS** |
| 相关 Jest（account-screen / account-settings-pages / settings-nav / settings-copy / personal-settings-visibility / release-public-env） | **PASS** 38；隐私文案收紧后再跑 copy + settings-pages **PASS** 11 |
| 改动文件 `npx eslint` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## 实际检查

用户报告真机实页四项通过。未能从安装包或设备日志核对该次运行的 JS SHA，故记为：**用户报告通过，测试 SHA 未确认**。模拟器本轮未走。

| 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- |
| 设置各入口与子页返回 | Jest 路由 / 分组 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 断网后条款、隐私仍可读；长文滚到末尾 | Jest 离线文案 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 订阅页无购买操作；关于页版本正确 | Jest | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 本机保护开关与后台遮挡无回归 | 沿用 device-lock Jest；本切片未改认证逻辑 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| Release 诊断门控 | 沿用 account / visibility Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| 短屏 / 横屏 / iPad / VoiceOver | Jest 边距 | **NOT VERIFIED** | **NOT VERIFIED** |
| 条款、隐私无强制勾选、无首次启动拦截 | 未改 `FirstRunGate` | — | — |

静态稿和 Jest 不等于真机 PASS。未实际操作的项标 **NOT VERIFIED**。

## 隐私文案收紧（合并前）

- Face ID：用户页改为「本机保护开启后，进入 Lampy 或从后台返回时，由系统使用 Face ID 或设备密码进行认证。」不再写「只在你打开本机保护时」。
- 内部审计句「这不等于已经核查过安装包里每一个系统组件的全部网络行为。」移出用户页，只留在 README 待确认清单。依赖网络行为正式分发前仍待确认。

## 实现 SHA 与 PR

- 基线 `origin/main`：合并前再核远端
- 实现 SHA：`10add6d9abfd156a70bd443482fb92087d8e9a5e`
- 隐私文案与走查：`56c2174849f07a81ebc958d45eb52a3a9a9f1b95`
- PR：https://github.com/chipmuck228/lampy/pull/59

## 尚需人工（合并后仍有效）

1. 正式分发 / TestFlight 前确认条款、隐私候选稿：运营主体、联系渠道、适用地区、系统备份边界、依赖网络行为。
2. 若出现已验证的正式反馈渠道，再决定是否加「意见与反馈」入口。
3. 隔离安装、短屏、横屏、iPad、VoiceOver 仍未在本轮实走。
