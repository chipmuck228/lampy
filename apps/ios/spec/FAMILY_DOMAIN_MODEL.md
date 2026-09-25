# 家庭领域模型（Phase 3A 定义）

日期：2026-09-25。本文件定义「家庭需要什么」。除已引用的现有 Moment / Asset / Transmission 外，下列 Family / Membership / Invitation 均为**待实现定义**，不是当前代码。

Lampy **不验证真实亲属关系**。「家庭」是由用户邀请组成、带明确边界的私人空间（产品指南 §7 说明文案、§16.2）。不得用「我们叫家庭」替代权限或 UGC 合规。

---

## 1. 身份

```text
AccountIdentity     可登录、可跨设备恢复的人（当前不存在；现有 local-user 不能充当）
DeviceIdentity      某次安装所在的设备（当前不存在）
Family              受邀请的私人空间
Membership          某账号在某家庭的资格
Invitation          进入家庭的一次性或可过期请求
Transmission        已有独立实体：某次分享/接收意图与状态
Received Moment     已有 origin 类型：接收者自己的 Moment 副本
```

| 身份 | 当前仓库 | 家庭需要 |
| --- | --- | --- |
| 账号 | `local-user` 过渡字符串 | 稳定、可撤销、可删除的账号。未登录不得加入家庭。 |
| 设备 | App 容器内的 SQLite | 可选绑定；授权证明必须来自账号+成员资格，不能只靠本机文件还在。 |
| 家庭 | 无 | 独立 `familyId`，不是 Moment 上的布尔或 `visibility`。 |
| 成员 | 无 | `accountId + familyId + role + status + joinedAt`。 |
| 分享 | Transmission 无 `familyId` | 目标必须是家庭或明确收件人，不能只改 `accessSummary`。 |

`accessSummary.visibility` 仍只是**展示摘要**（`spec/moment-domain-model.md`）。允许在成功分享后把摘要写成 `shared_space`，但**权限以 Membership + Transmission / 快照为准**。

---

## 2. 关系

```text
Account 1 ──* Membership *── 1 Family
Family   1 ──* Invitation
Account  1 ──* Invitation（作为邀请人或被邀请人）
Account  1 ──* Moment（ownerId = 该账号；默认 private）
Moment   1 ──* Transmission（sourceMomentId；独立聚合）
Transmission 0..1 ── 1 Received Moment（origin.transmissionId）
Received Moment.ownerId = 接收者账号
Received Moment.origin.originalMomentId = 发送者那份 Moment
Asset 仍独立；Moment / 快照只持有 assetIds
```

约束：

- 家庭管理员**不得**替成员创建私人 Moment（§16.2）。
- 新 Moment 默认个人；进入家庭必须经过明确分享命令。
- 一人同时能加入几个家庭：**待决定**（见 ADR 0006）。未决定前，实现不得假设「全局只有一个家庭」。
- Transmission 现有字段是 `recipientId`（可选个人），没有家庭目标。把「分享到家庭」做成点对点伪造成员列表，或把 `visibility` 当权限，都不允许。需要的领域扩展列为共享领域提案，不在本 PR 改代码。

---

## 3. 所有权、可见性、快照、传输

必须分开，禁止用一个布尔代替：

| 概念 | 含义 | 不是 |
| --- | --- | --- |
| 记录所有权 | `Moment.ownerId`：谁拥有**这份副本** | 谁曾看过、谁在家庭里 |
| 家庭可见性 | 当前有效 Membership 是否允许在家庭时间页看见某次已授权分享 | `accessSummary.visibility` 单独取值 |
| 接收者快照 | 接收者名下、钉在 `snapshotRevision` 的 Received Moment + 其 Asset 引用 | 对发送者原 Moment 的实时查询 |
| 传输状态 | Transmission.status 及带证据的时间戳 | UI 文案、本地缓存文件还在 |

现有领域已经把「收下别人的 Moment」定义为**接收者自己的新 Moment**（`origin.type = received`，指向 `transmissionId` / `originalMomentId` / `snapshotRevision`）。家庭接收应沿用该方向，而不是在原 Moment 上加 `isShared`。

---

## 4. 成员资格变化时，历史内容与媒体

产品与领域**没有**写死后的读权。下表区分：已由现有设计推出的部分，以及必须单列的待决定。

| 事件 | 发送者自己的原 Moment | 家庭时间页（仍是成员的人） | 当事人已落盘的 Received Moment / 媒体 | 未决 |
| --- | --- | --- | --- | --- |
| 成员加入 | 不变、仍默认个人 | 只能看到**加入后**按规则授权的内容；加入前历史是否回溯 | 无 | **待决定**：加入前已分享内容是否对新人可见 |
| 主动退出 | 本人所有权不变 | 该人不再出现在家庭时间页 | 已落盘快照是否仍可在「个人收到」里读 | **待决定**：退出后快照保留 / 只读 / 删除 |
| 被移除 | 本人所有权不变 | 该人不再出现在家庭时间页 | 同上 | **待决定**：被移除后快照策略是否与主动退出相同 |
| 分享撤回 | 原 Moment 仍在个人 | 家庭时间页不再把该 Transmission 当作有效分享 | 已落盘快照是否删除或保留为「已撤回」 | **待决定** |
| 家庭解散 | 各人自己的原 Moment 仍私有 | 家庭时间页不再存在 | 各人已落盘快照 | **待决定**：解散是否等价于对所有人撤回；谁有权解散 |

在未决定前：

- 实现不得默认「一旦收到永远可看」，也不得默认「退出即粉碎已接收文件」。
- 实现不得让退出/移除改变**他人**私人 Moment 的 `ownerId`。
- 本机还存在一份 JSON / 文件，**不能**单独证明当前仍有家庭读取权（见 `FAMILY_ACCESS_AND_SNAPSHOT.md`）。

---

## 5. 角色（最小集合，超出部分待决定）

可从产品推出的最小角色：

| 角色 | 可做 | 不可做 |
| --- | --- | --- |
| 成员 | 查看当前授权的家庭内容；把自己的个人 Moment 明确分享到该家庭；主动退出 | 替别人创建私人记录；未确认就分享 |
| 邀请人 | 在规则允许时发出邀请 | 未决定前不得假设任何成员都能邀请 |

**待决定**：是否存在管理员；谁可移除他人；谁可解散家庭；邀请是否需管理员。

没有角色实现前，UI 不得画出管理员开关或成员列表假数据。

---

## 6. 与现有生命周期的衔接

- 只有 `active` Moment 可被分享：微信 `passMoment` 已如此（`spec/moment-lifecycle.md`）。家庭分享应保持这条，除非另开 ADR。
- 草稿不得自动分享（产品指南 §9.2 / ADR 0004）。
- `archived` / `trashed` 不可新建分享（现有 `passMoment` 已拒绝）。已分享后归档/回收对家庭页的影响：**待决定**。
- 永久删除影响 Transmission 引用（`spec/moment-lifecycle.md`）。家庭实现必须先定义引用还在时的读失败，而不是静默换成别人的记录。

---

## 7. 隐私默认值（本轮锁定）

- 新内容默认个人。
- 不把个人内容默认同步到家庭。
- 不把 `local-user` 升级解释成已有账号系统。
- 不在未实现邀请时诱导「邀请陌生人」。
- 展示词「家庭」不改存储 Key、不改 Moment 字段名。
