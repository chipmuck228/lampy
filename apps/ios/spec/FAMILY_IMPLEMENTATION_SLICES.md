# 家庭实现切片

日期：2026-09-25。未完成切片不得用 mock 宣称完成。共享 `domain/` 变更必须单独 PR。

## 仓库事实（相对 `c6b8d4b`）

- 无独立 `apps/server`、无家庭数据库、无生产 Apple / API 密钥。
- iOS SQLite 有个人表和 `family_pending_operations`。无家庭路由。
- 因此 F1 **不能** 假装已有公网家庭后端。可交付：可测试的服务端模块 + iOS 适配 + 配置清单。未部署 / 未真机 Apple 标 **NOT VERIFIED**。

## F0 共享领域（本轮不做）

Transmission 家庭目标、ReceivedSnapshot 存储、owner 与 `userId` 对齐。需要时单独 PR，说明对微信小程序的影响。

## F1 身份与成员（已合入 main）

已在仓库：`src/family-api` 命令 / HTTP / Apple 校验接口；`family-use-cases` + `family-http-client`。失败不改个人 Moment。

## 可部署身份与成员（Phase 3B，不是 F2）

服务端 SQLite 家庭库、迁移、事务约束、production 与 test 隔离、iOS 系统 Sign in with Apple、Keychain 会话、最小家庭入口。规格 **F2 是媒体对象**，本切片不实现媒体或 Moment 分享。

未完成 / 未验证：公网部署、真机 Apple 登录、生产 Apple 密钥。测试 token 与内存库 **不是** 生产闭环。Phase 3B 生产就绪审计见 `FAMILY_PHASE_3B_PRODUCTION_AUDIT.md`：本机单实例可启动，真实用户家庭功能仍不可用。

真实环境身份验收见 `FAMILY_IDENTITY_REAL_ACCEPT.md`。从 `origin/main` `d198a7c` 独立进行。本机单实例与个人库隔离已跑过；本机 `127.0.0.1` 流程与部署服务流程分开记。没有授权测试服务、托管卷探测和真实双账号时 `identityLoopAccepted` 为 false（不要只看退出码）。家庭入口仍关闭。

不做（仍禁止宣称）：Moment 分享、媒体上传、家庭时间线、接收快照、假成员。

## F2 媒体对象（之后）

服务端媒体引用。禁止设备路径当分享载荷。

## F3 分享快照（之后）

确认 UI 字段列表；固定 revision；排除 `context.people`。

## F4 接收与家庭缓存（之后）

写入家庭缓存；退出即不可读；不进个人库。

## F5 撤回 / 退出后清理（之后）

服务端停供；App 清缓存；不承诺收回导出。

## F6 账号与创建者移交（之后）

删除账号、移交、归档与撤回分离。
