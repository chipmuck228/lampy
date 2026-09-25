# 家庭命令与失败

日期：2026-09-25。下列命令是规定。F1 实现身份与成员子集；分享类标「未交付」。不得用本地假成员或 mock 网络成功宣称完成。

服务端对每个写/读家庭请求：校验 Session → 解析 `userId` → 再查 Membership / Invitation。客户端仅在真实成功响应后展示家庭或成员。

---

## 1. F1 命令（本轮范围）

| 命令 | 前置 | 成功 | 失败 | 重试 |
| --- | --- | --- | --- | --- |
| `SignInWithApple` | 有效 identity token | 稳定 `userId` + Session。**不**创建 Membership | token 无效 / 校验不可达 → 不登录 | 不重复分配不同 userId（同一 Apple `sub`） |
| `CreateFamily` | 已登录；无 active Membership | 一个 Family；调用者为 `creator` | 未登录；已有家庭 | 幂等键：同一结果，不建第二家 |
| `InviteMember` | 调用者是该家 `creator` | `pending` 邀请 + 限时 code | 未登录；非创建者；家庭已解散 | 幂等键可返回同一 pending 邀请 |
| `RevokeInvitation` | 创建者；邀请仍 `pending` | `revoked` | 非创建者；已终态 | 已 revoked 再调 = 成功幂等 |
| `AcceptInvitation` | 已登录；code 有效 pending 未过期；无 active Membership | `accepted` + 一条 `member` Membership | 未登录；过期/撤销/已接受；已有家庭；家庭解散 | 同一 user + 同一已接受邀请 = 幂等返回该 Membership |
| `ListMembership` | 已登录 | 当前 Family + active 成员（无家庭则空） | 令牌无效 | 只读；失败不改本地个人库 |
| `LeaveFamily` | 已登录；active **member**（非 creator） | Membership `left`；清理该端家庭缓存 | 创建者未移交；未登录；无家庭 | 已 left 再调 = 幂等成功 |
| `RemoveMember` | 创建者；目标是其他 active 成员 | 目标 `removed` | 非创建者；目标是自己；目标已不在 | 已 removed 再调 = 幂等 |
| `DissolveFamily` | 创建者 | 家庭 `dissolved`；成员全部失效 | 非创建者 | 已解散再调 = 幂等 |

未登录、令牌无效、服务端不可达：一律不改变个人 Moment，不把失败画成已加入/已创建。

---

## 2. 未交付命令

| 命令 | 规定摘要 |
| --- | --- |
| `ShareMoment` | 确认 UI 列出字段；钉 revision；媒体走服务端对象。新成员看不到加入前分享。 |
| `RevokeShare` | 服务端停供该分享；原件不删；接收端清理该缓存。 |
| `ReceiveSnapshot` | 仅当 Membership 有效；写入家庭缓存，不进个人 `moments`。 |
| `TransferCreator` | 创建者离开的前置。 |
| `DeleteAccount` | 与删原件、撤回分享分开定义。 |
| `ArchivePersonal` | 不自动撤回分享。 |

---

## 3. 失败码（F1）

| 码 | 含义 |
| --- | --- |
| `UNAUTHENTICATED` | 无 Session 或令牌无效 |
| `APPLE_TOKEN_INVALID` | Apple identity token 校验失败 |
| `ALREADY_IN_FAMILY` | v1：已有 active Membership |
| `NOT_IN_FAMILY` | 无 active Membership |
| `FORBIDDEN` | 角色不足（非创建者邀请/移除/解散；创建者直接退出） |
| `INVITE_NOT_FOUND` | code 不存在 |
| `INVITE_EXPIRED` | 已过期（接受时判定） |
| `INVITE_REVOKED` | 已撤销 |
| `INVITE_ALREADY_USED` | 已被他人接受（同一人重复接受走幂等成功） |
| `FAMILY_DISSOLVED` | 家庭已解散 |
| `MEMBER_NOT_FOUND` | 移除目标不存在或已非 active |
| `NETWORK` / `SERVER_UNREACHABLE` | 客户端达不到服务端 |
| `CONFLICT` | 违背前置且不宜更细的码 |

个人库错误码（`DRAFT_NOT_FOUND` 等）与上表分离。家庭失败不得触发个人 Moment 写入。

---

## 4. 重试

- 写命令带客户端 `idempotencyKey`。服务端记住 key → 结果。
- 超时后用同一 key 重试，不得当新命令。
- `ListMembership` 失败：界面保持「未确认」，不沿用过期成员列表充当现授权。

---

## 5. 与个人 Moment 的隔离

任何上表失败或成功都 **不得** 修改 `moments` / `drafts` / `assets` 行，除非未来分享切片明确另写（本轮没有）。
