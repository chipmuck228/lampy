# F5：撤回分享与资格变化后的缓存清理

日期：2026-09-25。基线 `origin/main` `980b4ae`（PR #14 merge，含 F4 `73a389c`）。本切片只做：**作者撤回自己的分享**、服务端停供、以及资格变化后本机家庭缓存清理。

`identityLoopAccepted` 仍为 false。家庭入口仍只在 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 配置时出现；本切片不打开该入口。不实现账号删除、创建者移交或新家庭 UI。不宣称真实家庭功能已验收。

## 未决项与本切片决策

| 项 | 决策 | 理由 |
| --- | --- | --- |
| 谁能撤回 | 仅该分享 `authorUserId`。须为当前 active 成员。他人 `FORBIDDEN` | 不能撤回别人的分享。 |
| 服务端状态 | `family_shares.status`：`active` \| `revoked`，外加 `revoked_at`。已有行迁移为 `active` | 撤回必须持久。重启后仍停供。 |
| 停供 | 撤回确认后，列表不含该条；`GET` 快照与分享媒体对**任何成员**（含作者）均为 `SHARE_NOT_FOUND` | 缓存存在不是授权。旧 URL 不再提供内容。 |
| 重复撤回 | 作者再次请求同一 `shareId` 仍 `200 { revoked: true }` | 幂等。不建第二条。 |
| 同 revision 再分享 | 撤回后仍占用 `(family, author, sourceMomentId, sourceRevision)`。再提交同一 revision → `CONFLICT` | 不把已撤回行当成功复用。要再分享须新 revision。 |
| 客户端撤回状态 | `idle` / `revoking` / `revoked` / `failed`。只有服务端 200 才是 `revoked` | 请求失败不得显示「已撤回」。`failed` 可重试。 |
| 本机清理该分享 | 服务端撤回成功后删除该 `(userId, familyId, shareId)` 的接收行、媒体行、文件与 `.part` | 作者设备立刻不再展示该条。 |
| 其他设备 | 无推送。下一次成功授权列表核验走 F4 `replaceVisible`，隔离未返回的缓存 | 尚未刷新的设备可能短暂仍有本地文件，但不得用旧缓存当现授权展示。 |
| 退出 / 被移除 / 解散 | 服务端立即 `NOT_IN_FAMILY`。iOS 确认资格已失去后：先隐藏，再清理该账号该家接收快照、媒体与临时文件 | 清理失败仍保持隐藏，不得显示「仍可访问」。 |
| 离线 / 权限无法确认 | 只隐藏，**不**当退出清理 | 避免把暂时不可达当成失去资格并删掉仍可能有权的缓存。 |
| 个人库 | 撤回、退出、被移除、解散、清理失败都不删个人 Moment / 照片 / 录音 | 个人原件独立。 |
| F2 对象 | **不**因撤回或资格变化删除。同一 `objectId` 可能仍被其他 active 分享引用 | F5 不做引用计数垃圾回收。孤儿对象可留到以后切片。 |
| 导出 | 无法收回用户已拷到相册、文件 App 或其他 App 的副本 | 只停供与清本机家庭缓存。 |

## 状态迁移

```text
family_shares
  + status TEXT NOT NULL DEFAULT 'active'   -- active | revoked
  + revoked_at TEXT                         -- ISO，仅 revoked

客户端 shareRevoke
  idle → revoking → revoked | failed
  failed → revoking（重试）
  进程重启：内存状态回到 idle；若服务端已 revoked，下次列表核验清缓存，不显示「已撤回」除非这次请求成功
```

已有 `family_shares` 行在迁移后为 `active`。`revoked` 行保留快照与 audience，只是不再提供。

## 清理顺序

1. **界面先隐藏**家庭内容（资格不是 `ready`，或该分享不在本次授权列表）。
2. 确认失去资格（退出成功、解散成功、`getMembership` 为 `none`、列表/读取返回 `NOT_IN_FAMILY`）后：删除该账号该家的 `family_received_shares` / `family_received_media` 行。
3. 再删 `family-cache/{userId}/{familyId}/` 下文件与 `.part`。单条撤回只删 `{shareId}/`。
4. 文件删除失败：行已删或展示已被授权列表拦住；**不**把残留文件当成可访问。isolate 抛错被吞掉。
5. 不碰个人 `moments` / `assets` / `lampy-assets/`。不删服务端 F2 文件。

## API

```text
POST /v1/families/:familyId/shares/:shareId/revoke
Authorization: Bearer
200 { shareId, revoked: true, revokedAt }

GET /v1/families/:familyId/shares
200 仅 active 且当前成员可见的分享（F4 规则 + status=active）

GET .../shares/:shareId
GET .../shares/:shareId/media/:objectId
GET .../shares/:shareId/media/:objectId/content
撤回后：404 SHARE_NOT_FOUND（对任何成员）
非成员：404 NOT_IN_FAMILY
非作者撤回：403 FORBIDDEN
```

## 授权矩阵（撤回与停供）

| 调用方 | 撤回 | 撤回后列表 | 撤回后 GET 快照/媒体 |
| --- | --- | --- | --- |
| 未登录 | 401 | 401 | 401 |
| 作者（当前成员） | 200，重复亦 200 | 不含该条 | 404 |
| 其他现成员 | 403 | 不含该条 | 404 |
| 退出 / 被移除 / 解散后 | 404 | 404 | 404 |
| 后来加入者 / 重新加入 | 403（存在）或 404 | 不含该条 | 404 |

## 失败恢复

| 情况 | 服务端 | iOS |
| --- | --- | --- |
| 撤回与接收并发 | 撤回提交后读取立即停供 | 接收中途 `SHARE_NOT_FOUND` 则隔离该条，不得标 `received` |
| 重复撤回 | 200 | `revoked`，缓存已无则保持无 |
| 作者以外 | 403 | `failed`，不写「已撤回」 |
| 旧 URL | 404 | 不展示 |
| 断网撤回 | 不改 status | `failed`，「撤回还没完成，可以再试」 |
| 进程重启（服务端已撤回） | 仍为 revoked | 新实例列表核验后清缓存；不凭旧内存状态显示已撤回 |
| 进程重启（请求未到达） | 仍为 active | 新实例 `idle`，分享仍可见，可再试 |
| 账号切换 | 按当前会话 | 只展示当前 `userId` 缓存；登出/401 清该账号家庭缓存 |
| 移除后重新加入 | 旧分享仍因 `joinedAt` 或 revoked 不可见 | 列表空；旧缓存被 `replaceVisible` 隔离 |
| 文件删除失败 | 停供不变 | 隐藏；不显示仍可访问 |

## 客户端

`revokeShare(shareId)`：先 `revoking`，成功再清该分享缓存。失败保持 `failed`。

`refreshFamilyInbox()`：仍先取授权列表。成功则只展示该列表并隔离其余。`NOT_IN_FAMILY` 或成员为 `none`：隐藏并清理该账号家庭缓存。离线/`unconfirmed`：只隐藏。

现有家庭页：作者自己的 inbox 行可「撤回这条分享」。不是新家庭时间线。

## 不做

账号删除、创建者移交、F2 垃圾回收、家庭时间线、Transmission 改写、打开未配置的家庭入口、宣称已收回导出或身份闭环通过。

## 剩余风险

- 其他设备在下次成功刷新前，磁盘上可能仍有已撤回分享的文件；界面不得用它当现授权。
- F2 对象在全部引用撤回后仍占磁盘。
- 已导出到 App 外的副本无法收回。
- 真实 Apple 双账号与公网部署未验收。
