# 本机设置改版 · 走查

Base：`origin/main` `277361ab61ecd7b3c0049c99c1f4e4015d0b744c`（#56 merge）。  
分支 `ios/account-settings-reading`。只改 `apps/ios`。未卸 Liuz17，未清个人库，未重传 TestFlight。

附件 `App(1).tsx` / `index(1).css` **缺失**，见 `attachments/MISSING.md`。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（account / device-lock / settings / icons / visibility） | **PASS** 52 |
| 改动文件 `expo lint` | **PASS** |
| `git diff --check -- apps/ios` | **PASS** |

## 运行中

| 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- |
| 最近齿轮 → 设置 → 两子页 → 返回 | Jest 路由/文案 | **NOT VERIFIED** | **NOT VERIFIED** |
| 长说明可滚动，末项可操作 | Jest 结构 | **NOT VERIFIED** | **NOT VERIFIED** |
| 开启/关闭保护、取消认证、后台 | 沿用 device-lock Jest | **NOT VERIFIED** | **NOT VERIFIED** |
| Release 无开发诊断 / 家庭登录 | Jest 门控 | **NOT VERIFIED** | **NOT VERIFIED** |
| 短屏 / 横屏 / iPad / VoiceOver | — | **NOT VERIFIED** | **NOT VERIFIED** |

静态截图不算通过。
