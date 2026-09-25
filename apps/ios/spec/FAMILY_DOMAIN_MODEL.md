# 家庭领域模型

日期：2026-09-25。决策已锁定（ADR 0006）。Family / Membership / Invitation / Account 在本文件中是**规定**；未交付前不得写成仓库已实现。

Lampy **不验证真实亲属关系**。「家庭」是受邀请的私人空间（产品指南 §16.2）。

---

## 1. 实体

```text
Account        Lampy userId（稳定内部身份）
AppleLink      appleSubject → userId；邮箱可选且不得作主键
Session        服务端签发；证明登录，不证明成员资格
Family         familyId + createdAt
Membership     familyId + userId + role + status + joinedAt
Invitation     invitationId + familyId + code + expiresAt + status
Share/Transmission   后续切片；目标为家庭 + moment + revision
ReceivedSnapshot     家庭授权缓存，不是个人 moments 行
```

| 字段要点 | 规定 |
| --- | --- |
| `userId` | 服务端分配。与 `local-user` 分离。 |
| `Membership.role` | `creator` \| `member`。创建者 = 邀请/移除/解散。成员 = 退出、且日后只能分享自己的记录。 |
| `Membership.status` | `active` \| `left` \| `removed`。数据结构允许同一 user 多条家庭成员行，**第一版业务**拒绝加入第二个家庭。 |
| `Invitation.status` | `pending` \| `accepted` \| `revoked` \| `expired`。一次性：accepted/revoked 后同一 code 不能再接受。 |
| Share | 指向 `familyId` + `sourceMomentId` + `sourceRevision`。本轮不实现。 |

`accessSummary.visibility` 仍只是展示摘要，不是授权账本。

---

## 2. 关系

```text
Account 1 ──* Membership *── 1 Family     （v1 业务：一个 Account 最多一条 active Membership）
Family   1 ──* Invitation
Account  1 ──* 个人 Moment（iOS SQLite，owner 语义仍为这份副本的主人；未登录为 local-user）
Share    后续：Family 1 ──* Share
ReceivedSnapshot 由 Share + 有效 Membership 授权；写入本机后仍受家庭权限约束
```

约束：

- 未登录不得执行家庭命令。
- 创建者不得读取其他成员未分享的个人记录。
- 创建者退出前必须移交 `creator` 或解散家庭（移交命令本轮不实现，故创建者 `LeaveFamily` 应失败）。
- 新成员看不到加入前的分享。
- 不把个人内容默认同步到家庭。

---

## 3. 所有权 / 家庭可见性 / 快照 / 传输

| 概念 | 含义 | 不是 |
| --- | --- | --- |
| 个人所有权 | iOS 个人库里的 Moment；未登录也可用 | 家庭成员资格 |
| 登录身份 | `userId` + 有效 Session | 家庭成员 |
| 家庭可见性 | 服务端：active Membership + 该分享对加入时刻可见 | 本机文件还在 |
| 接收快照 | 钉在 `sourceRevision` 的家庭缓存 | 个人 `moments` 表里的普通记录 |
| 传输阶段 | 等待上传 / 服务端已保存 / 接收设备已写入 | `Transmission.sent` |

编辑个人原件 **不** 改变已分享 revision。媒体分享不得带 `localUri`。首版分享不含 `context.people`；确认 UI 必须列出将发送的字段。

---

## 4. 资格变化（已决定）

| 事件 | 个人原 Moment | 现成员看家庭内容 | 当事人在 App 内看接收快照 | 设备外已导出副本 |
| --- | --- | --- | --- | --- |
| 加入 | 不变 | 仅加入**之后**的分享 | 尚无（本轮不接收） | — |
| 主动退出（成员） | 不删 | 否 | **否**；清理家庭缓存 | 不承诺收回 |
| 被移除 | 不删 | 否 | **否**；清理家庭缓存 | 不承诺收回 |
| 分享撤回 | 不删原件 | 该分享否 | **否**（该分享）；清理该缓存 | 不承诺收回 |
| 解散 | 不删各人原件 | 否 | **否**；清理家庭缓存 | 不承诺收回 |
| 无法确认权限 / 离线家庭 | 个人库可用 | **不展示** | **不展示** | — |
| 个人归档 | 仍在个人库 | 不自动撤回已分享 | 仍按分享与成员资格 | — |
| 删除个人原件 | 原件按删除命令 | 已分享快照是否仍对现成员可见：分享切片定义；**不**等于撤回 | — | — |
| 删除账号 | 另定义 | 成员资格与分享随账号删除策略走 | 清理该账号家庭缓存 | 不承诺收回他人导出 |

个人归档 ≠ 撤回分享 ≠ 删除原件 ≠ 删除账号。

---

## 5. 状态

### Membership

`active` → `left`（成员 Leave）

`active` → `removed`（创建者 Remove）

解散：家庭 `dissolved`，所有 active 成员不再有效。

创建者不能 `left`，除非已移交或改为解散。

### Invitation

`pending` → `accepted` \| `revoked` \| `expired`（到期或接受时服务端判定）

终态不可再接受。

### 传输（后续切片用语，不写入现有 Transmission.status）

`upload-pending` → `server-stored` → `receiver-written`

本地 `sent` 只表示历史微信意图或未确认出站，不得显示「家人已收到」。
