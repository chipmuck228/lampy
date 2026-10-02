# 本机设置改版 · 走查

Base：`origin/main` `277361ab61ecd7b3c0049c99c1f4e4015d0b744c`（#56 merge）。  
分支 `ios/account-settings-reading`。Head：`673d71b15770affd5a398bc840869486eb6bfaee`。  
只改 `apps/ios`。未卸 Liuz17，未清个人库，未重传 TestFlight。

附件已放入 `attachments/App.tsx`、`attachments/index.css`。实现只对照 `settings-modal` / `settings-body`，未复制云同步、认证、付费或手写 SVG。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（account / device-lock / settings / visibility） | **PASS** 53 |
| 改动文件 `expo lint` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## 运行中

用户报告真机三项通过。开发机当时 head 为 `673d71b`，Metro 从 `lampy-account-settings` 出包。未能从真机安装包或设备日志核对该次运行的 JS SHA，故记为：**用户报告通过，测试 SHA 未确认**。模拟器本轮未走。

| 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- |
| 最近齿轮 → 本机设置 → 记录与存储／关于 Lampy → 返回，显示与滚动 | Jest 路由/文案 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 本机保护开启、取消、关闭及后台返回，遮挡 | 沿用 device-lock Jest | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 横屏返回与正文；Release 深链关闭诊断页，说明和返回可用 | Jest 门控 + 边距 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 短屏 / iPad / VoiceOver | Jest 边距 | **NOT VERIFIED** | **NOT VERIFIED** |

静态截图不算通过。
