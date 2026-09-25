# 家庭实现切片

日期：2026-09-25。未完成切片不得用 mock 宣称完成。共享 `domain/` 变更必须单独 PR。

## 仓库事实（相对 `c6b8d4b`）

- 无独立 `apps/server`、无家庭数据库、无生产 Apple / API 密钥。
- iOS SQLite 仅个人表。无家庭路由。
- 因此 F1 **不能** 假装已有公网家庭后端。可交付：可测试的服务端模块 + iOS 适配 + 配置清单。未部署 / 未真机 Apple 标 **NOT VERIFIED**。

## F0 共享领域（本轮不做）

Transmission 家庭目标、ReceivedSnapshot 存储、owner 与 `userId` 对齐。需要时单独 PR，说明对微信小程序的影响。

## F1 身份与成员（本轮代码）

已在仓库：`src/family-api` 命令 / HTTP / Apple 校验接口；`family-use-cases` + `family-http-client`。测试覆盖未登录、无效 token、邀请过期/撤销/重复接受、已有家庭、非创建者、退出、重试、不可达。失败不改个人 Moment。

未完成 / 未验证：公网部署、持久库、真机 Sign in with Apple、家庭 UI。配置见 `src/family-api/README.md`。

不做（仍禁止宣称）：Moment 分享、媒体上传、家庭时间线、接收快照、假家庭页。

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
