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

Phase 3B 不做（仍禁止宣称）：Moment 分享、家庭时间线、接收快照、假成员。媒体对象见 F2。

## F2 媒体对象（已合入 main）

服务端媒体对象：会话鉴权的 `POST /v1/media`、`GET /v1/media/:id`、`GET /v1/media/:id/content`。对象 ID 不含本机路径；元数据在家庭 SQLite；文件在 `LAMPY_FAMILY_MEDIA_PATH` 或库目录下 `media/`。仅上传者可读。决策见 `FAMILY_F2_MEDIA_OBJECTS.md`。

**不做：** Moment 分享、Transmission 改写、家庭时间线、接收快照、跨设备同步、媒体自动上传、打开家庭入口、宣称身份闭环通过。

## F3 分享快照（已合入 main）

确认将发送的 `note` / 感受 / 时间与精度 / 已选 F2 媒体；服务端按调用方提供的 `sourceRevision` 保存不可变快照并记录当时 audience。后来加入者默认不可见。决策见 `FAMILY_F3_SHARE_SNAPSHOTS.md`。

服务端不验证个人原件，也不知道原件媒体数量。App 组合根注入个人库；个人详情（家庭 API 已配置时）进入确认页；确认必须重新读取并逐项核对。

**不做：** 接收下载、家庭缓存、时间线、撤回、Transmission 改写、打开未配置的家庭入口、宣称家人已收到或身份闭环通过。

## F4 接收与家庭缓存（已合入 main）

当前有效成员读取其有权接收的 F3 快照及关联媒体，写入按账号+家庭隔离的缓存。F2 上传者 GET 不能当接收口。资格无法确认或失去时立即隐藏。决策见 `FAMILY_F4_RECEIVE_CACHE.md`。已合入 `origin/main` `980b4ae`。

**不做：** 撤回、退出后保证清掉导出、家庭时间线、Transmission 改写、打开未配置的家庭入口、宣称家人已收到或身份闭环通过。

## F5 撤回 / 退出后清理（本切片）

作者撤回自己的分享；服务端持久 `revoked` 并停供列表/快照/媒体。退出、被移除、解散后服务端拒绝读取，iOS 隐藏并清理该账号该家接收缓存。不删个人库，不删可能被其他分享引用的 F2 对象，不承诺收回导出。决策见 `FAMILY_F5_REVOKE_CLEANUP.md`。

**不做：** 账号删除、创建者移交、F2 垃圾回收、家庭时间线、Transmission 改写、打开未配置的家庭入口、宣称已收回导出或身份闭环通过。

## F6 账号与创建者移交（之后）

删除账号、移交、归档与撤回分离。
