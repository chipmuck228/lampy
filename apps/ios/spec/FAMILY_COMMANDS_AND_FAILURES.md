# 家庭命令、错误与失败（Phase 3A）

日期：2026-09-25。下列命令**尚未实现**。错误码名称是提案；写入共享 `ERROR_CODES` 必须另开领域 PR。没有网络确认时，UI 不得显示「家人已收到」。

---

## 1. 传输状态与证据

现有领域状态（`domain/transmission/transmission.types.d.ts`）：

`created` | `sent` | `received` | `declined` | `expired` | `revoked`

**没有** `queued`、`delivered`。

| 产品想说的话 | 允许的证据 | 当前仓库能证明什么 | UI 在证据不足时 |
| --- | --- | --- | --- |
| 已记下分享意图 | 本地已写入合法 Transmission | `createLocalPassTransmission` 的 `sent` + `sentAt`（微信）；iOS 无 | 「已记下要分享，还没送到家庭」 |
| 已进入出站队列 | 本机队列行 + 幂等键；**领域尚无 queued** | 无 | 不得用 `sent` 冒充排队 |
| 服务端已接受 | 服务端 id / 签名时间；**不是**本地 `sent` | 无 | 不得写「已送达」 |
| 对端已收到 | 接收端回执或服务端 `received` + `receivedAt` | 仅有枚举和微信 nearby mock | **禁止**「家人已收到」 |
| 已撤回 | 带证据的 `revoked` 迁移 | 枚举有、命令无 | 保持原状态并说明未确认 |

`queued` / `delivered` 若要成为领域状态，必须先改共享 Transmission 契约（提案，见 ADR 0006）。在此之前，application 可以用**本地出站作业**表达排队，但不得把它写进 Transmission.status。

---

## 2. 命令

未标明的字段不得从 `visibility` 或本机文件存在性推断。

### 2.1 InviteMember

| | |
| --- | --- |
| 前置 | 邀请人账号已认证；目标家庭存在；邀请人角色允许邀请（角色规则 **待决定**）；被邀请人可识别且尚未是有效成员 |
| 结果 | 一条 Invitation：`id`、`familyId`、`inviterId`、`inviteeRef`、`expiresAt?`、`status=pending` |
| 幂等键 | `invite:{familyId}:{inviteeRef}:{round}`。同一 pending 不重复建 |
| 错误 | `FAMILY_NOT_FOUND` / `FAMILY_FORBIDDEN` / `FAMILY_ALREADY_MEMBER` / `FAMILY_INVITE_INVALID` / `ACCOUNT_UNAUTHENTICATED` |

重复点击：返回同一 Invitation。超时但服务端已成功：用幂等键拉取，禁止第二条 pending。

### 2.2 AcceptInvitation

| | |
| --- | --- |
| 前置 | 当前账号是被邀请人；邀请 `pending` 且未过期；家庭仍存在 |
| 结果 | Membership `status=active`；邀请 `accepted` |
| 幂等键 | `accept:{invitationId}` |
| 错误 | `FAMILY_INVITE_EXPIRED` / `FAMILY_INVITE_NOT_FOUND` / `FAMILY_ALREADY_MEMBER` / `FAMILY_DISSOLVED` |

已是成员再接受：返回现有 Membership，不建第二条。

### 2.3 DeclineInvitation

前置：被邀请人 + pending。结果：邀请 `declined`。幂等键：`decline:{invitationId}`。已 declined 再点：原样返回。

### 2.4 LeaveFamily

| | |
| --- | --- |
| 前置 | 当前账号对该家庭有 `active` Membership |
| 结果 | Membership `left` + `leftAt`。**不**改变本人 Moment.ownerId |
| 幂等键 | `leave:{familyId}:{accountId}:{membershipRevision}` |
| 错误 | `FAMILY_NOT_MEMBER` / `ACCOUNT_UNAUTHENTICATED` |

退出后家庭页内容与已落盘快照：**待决定**（见领域模型 §4）。命令本身不得删除他人记录。

最后一位成员离开是否解散家庭：**待决定**。

### 2.5 RemoveMember

| | |
| --- | --- |
| 前置 | 操作者角色允许移除（**待决定**）；目标是该家庭 active 成员；不得用此命令删私人 Moment |
| 结果 | 目标 Membership `removed` |
| 幂等键 | `remove:{familyId}:{targetAccountId}:{membershipRevision}` |
| 错误 | `FAMILY_FORBIDDEN` / `FAMILY_NOT_MEMBER` |

### 2.6 ShareMomentToFamily

| | |
| --- | --- |
| 前置 | 发送者账号已认证；是 Moment.ownerId；Moment `lifecycle.status = active`（对齐现有 `passMoment`）；目标家庭存在；发送者对该家庭 Membership 有效；用户已明确确认「分享到家庭」 |
| 结果 | Transmission：`sourceMomentId`、`sourceRevision`、`senderId`、家庭目标（**现有模型无 familyId，需领域提案**）。本地意图可先落盘。`status` 在未有网络确认前**不得**被 UI 解释为已送达 |
| 幂等键 | 沿用并扩展现有 `tx:local:pass:{momentId}:{revision}`，家庭实现必须纳入 `familyId`，避免同一 revision 对两个家庭撞键 |
| 错误 | `MOMENT_NOT_FOUND` / `MOMENT_FORBIDDEN` / `MOMENT_INVALID_TRANSITION` / `FAMILY_NOT_MEMBER` / `FAMILY_NOT_FOUND` / `TRANSMISSION_INVALID` |

精确 id，禁止回退列表第一条（`test/pass-moment.test.js` 已锁定微信侧）。失败时 Moment 留在个人范围（产品指南 §9.5）。

草稿、空内容、非 owner：拒绝且不写 Transmission。

### 2.7 ReceiveShare

| | |
| --- | --- |
| 前置 | 接收者账号已认证；对该家庭 Membership 有效（若目标是家庭）；Transmission 对接收者可见且未 `revoked` / `expired`；尚未物化同一幂等键的 Received Moment |
| 结果 | 接收者名下新 Moment，`origin.type=received`，三件套完整；按快照规则挂 Asset |
| 幂等键 | `receive:{transmissionId}:{recipientId}` |
| 错误 | `FAMILY_FORBIDDEN` / `TRANSMISSION_REVOKED` / `TRANSMISSION_NOT_FOUND` / `MOMENT_INVALID_ORIGIN` |

微信 `receiveNearbyLight` **不是**本命令。禁止把 nearby-mock 接进 iOS。

部分媒体失败：正文仍可按最小内容激活（领域允许 received origin 作为非空条件）；失败 Asset 标 missing/failed，不删 Moment。

### 2.8 RevokeShare

| | |
| --- | --- |
| 前置 | 操作者是 Transmission.senderId（或另开 ADR 的家庭角色）；Transmission 尚未 `revoked` |
| 结果 | `status=revoked`。家庭时间页不再把该分享当作有效授权 |
| 幂等键 | `revoke:{transmissionId}` |
| 错误 | `TRANSMISSION_NOT_FOUND` / `FAMILY_FORBIDDEN` |

已物化快照是否删除：**待决定**。命令必须可在「仅改状态、快照仍在」下幂等。

---

## 3. 失败场景

| 场景 | 要求 |
| --- | --- |
| 重复点击分享 / 邀请 / 接受 | 同一幂等键，一条结果 |
| 请求超时但服务端已成功 | 用幂等键对账；禁止第二条 Transmission / Membership |
| 离线重试 | 只重放未确认作业；已 `revoked` 的不再送出 |
| 乱序送达 | 过期邀请不能压过已接受/已拒绝；旧快照不能覆盖更新的已确认接收（除非协议写明） |
| 成员资格在飞行中变化 | 落地时重新检查 Membership；不合格则不物化 Received Moment，Transmission 留可重试或标记拒绝，不假装成功 |
| 部分媒体失败 | 保全已写下的文字与成功 Asset；家庭页与详情原位降级 |
| 进程重启 | 从 SQLite / 作业表恢复；保存状态机对齐 ADR 0003 的可恢复失败，不自动分享草稿 |
| 找不到 Moment | `MOMENT_NOT_FOUND` / 独立错误，不回退相邻记录 |
| 仓库损坏 | 进 quarantine，不覆盖原文（iOS `record_quarantine` 已用于个人行） |

---

## 4. 与现有微信 `passMoment` 的关系

可复用的规则：精确 id、仅 owner、仅 active、同 revision 幂等、`sent` ≠ 送达。

不可直接当家庭分享：

- 无 `familyId` / 无确认 UI 绑定。
- 无网络。
- iOS 未建 Transmission 仓库。
- message 已写明 local intent only。

iOS 接入时经 application use case 调领域命令，不把 `pages/record/record.js` 的递灯按钮搬到 RN。
