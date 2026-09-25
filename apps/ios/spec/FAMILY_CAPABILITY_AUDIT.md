# 家庭能力现状审计（Phase 3A）

日期：2026-09-25。基线：`origin/main` = `c6b8d4b`（含 PR #5 回看、#6 媒体恢复、#7 当时的感受）。

本文件只回答「仓库已经具备什么」。不把本地 `Transmission.status = sent` 解释为网络送达，不用 mock 家庭成员或假时间线填补缺口。微信「附近 / 递灯」不是家庭。

分类：

- **已实现**：iOS 或共享领域有可执行路径，并有测试或运行时仓库。
- **只有领域表达**：类型、校验、工厂或微信侧命令存在，但没有家庭语义的闭环（无成员、无网络、无 iOS 仓库）。
- **未实现**：无实体、无命令、无存储、无 UI。

---

## 1. 逐项结论

| 能力 | 判定 | 仓库事实 | 证据 |
| --- | --- | --- | --- |
| 账号身份 | **未实现** | 固定 `LOCAL_OWNER_ID = 'local-user'`。注释写明是未登录过渡，不是真实账号。无登录、无用户表、无 Sign in with Apple。 | `domain/shared/identity.js`；iOS `apps/ios/src/domain-adapters/identity.ts`；`createUseCases` 默认 `ownerId = LOCAL_OWNER_ID`（`apps/ios/src/application/use-cases.ts`） |
| 设备身份 | **未实现** | 无稳定设备 ID、无设备注册、无多设备绑定。本机 SQLite 文件只存在于 App 容器。 | iOS 表定义只有 `moments` / `drafts` / `assets` / `record_quarantine`（`apps/ios/src/infrastructure/sql.ts`）；无 `devices` |
| 家庭身份 | **未实现** | 无 Family 聚合、无 `familyId`、无家庭表。`accessSummary.visibility` 可取 `shared_space`，只是可见性摘要枚举，不是家庭身份。 | `domain/moment/moment.types.d.ts`；`spec/moment-domain-model.md`：「accessSummary 不是授权账本」；iOS 无家庭路由（`apps/ios/src/app/` 仅最近 / 留下 / 回看 / 详情） |
| 邀请 | **未实现** | 无 Invitation 实体、无邀请码/链接、无过期命令。 | 全库无 `Invitation` 实现（`AccessGrant` 仅 `.d.ts` 契约） |
| 加入 | **未实现** | 无接受邀请命令，无 Membership 写入。 | 同上 |
| 退出 | **未实现** | 无主动退出命令，无成员状态机。 | 同上 |
| 移除成员 | **未实现** | 无移除/屏蔽命令。产品要求发布前评估，当前无实现。 | 设计指南 §16.3；无对应代码 |
| 读取权限 | **只有领域表达** | `AccessGrant` 仅契约，不入库。iOS 读取本机全部个人 Moment，不校验家庭成员资格。可见性默认 `private`。 | `domain/moment/moment.types.d.ts` `AccessGrant`；`moment.js` 默认 `visibility: 'private'`；iOS `getRecentLife` / `getHistoryDay` 只读本机 `moments` 表 |
| 分享 | **只有领域表达** | 微信 `passMoment` 可写本地 Transmission。iOS **没有** Transmission 表、adapter、use case 或分享 UI。 | `services/record-service.js` `passMoment`；`test/pass-moment.test.js`；iOS `sql.ts` 无 `transmissions`；详情页只读且无分享按钮（`apps/ios/src/app/moment/[id].tsx`） |
| 接收 | **只有领域表达** | 领域允许 `origin.type = received`（需 `transmissionId` / `originalMomentId` / `snapshotRevision`）。微信 `receiveNearbyLight` 是附近 mock，`legacySource: 'nearby-mock'`，不是家庭接收。iOS 不调用该路径。 | `domain/moment/moment.validator.js`；`services/nearby-service.js`；`test/moment-detail-service.test.js` 「不声称送达」 |
| 撤回 | **只有领域表达** | Transmission 状态枚举含 `revoked`，无状态迁移命令，无 iOS 撤回。 | `domain/transmission/transmission.types.d.ts`；无 `revokeTransmission` |
| 离线（个人） | **已实现** | 个人 Moment / 草稿 / Asset 本机可读写，不依赖网络。 | iOS SQLite + 文件；`apps/ios/src/infrastructure/sqlite-preservation.test.ts` |
| 离线（家庭队列） | **未实现** | 无待发送队列、无乱序缓冲、无「服务端已成功但本地未知」对账。 | 无相关表或 use case |
| 同步 | **未实现** | 无账号、无云、无冲突合并。ADR 0004 明确隔离。 | `apps/ios/spec/adr/0004-family-sync-isolation.md`；`PHASE_0_UNIMPLEMENTED.md` |
| 送达状态 | **只有领域表达** | 枚举：`created` / `sent` / `received` / `declined` / `expired` / `revoked`。**没有** `queued`、`delivered`。`createLocalPassTransmission` 直接写 `sent`，`message` 写明不是送达证明。 | `domain/transmission/transmission.js` L6–L10、L39–L48；`test/pass-moment.test.js` 断言 `/not proof of delivery/` |
| 媒体访问（个人） | **已实现** | 本机 Asset 独立存储；缺失/无法解码/无法播放原位降级，不删 Moment。 | `apps/ios/src/application/use-cases.ts`；recovery / sqlite 测试 |
| 媒体访问（家庭授权） | **未实现** | Asset 有 `storage.originalKey` 等云字段，V1 无云 key。无跨用户媒体授权。 | `domain/asset/asset.types.d.ts`；`spec/moment-domain-model.md`：「V1 没有云 key」 |
| 删除（个人领域） | **只有领域表达** | 生命周期含 `trashed`；永久删除是 repository 操作，不进状态机。iOS 详情只读，无删除入口。 | `spec/moment-lifecycle.md`；`PHASE_0_UNIMPLEMENTED.md`「编辑 / 删除详情内容」 |
| 删除（家庭内容 / 账号） | **未实现** | 无家庭内容删除、无账号删除、无成员数据清除策略实现。 | 设计指南 §16.3 列为发布前门槛 |

---

## 2. 现有实体实际能力（不是家庭）

### 2.1 Moment

- 聚合根。`ownerId` 是**这份副本**的主人；接收副本的 owner 是接收者（`spec/moment-domain-model.md`）。
- 默认 `accessSummary.visibility = 'private'`（`domain/moment/moment.js`）。
- 改可见性只改摘要字段，不创建授权记录。
- iOS 新记录始终个人、本机；选择感受不改变可见性（`emotion-use-cases.test.ts` 断言 `visibility === 'private'`）。

### 2.2 Asset

- 独立实体。Moment 只存 `assetIds`。
- `localUri` 只表示当前设备可读位置。
- 无跨用户、跨设备访问协议。

### 2.3 Transmission

```text
id, sourceMomentId, sourceRevision, senderId,
recipientId?, status, message?, createdAt, sentAt?, receivedAt?,
legacy?, legacySource?
```

- **没有** `familyId`、`targetSpace`、`deliveredAt`、幂等键字段以外的家庭目标。
- `createLocalPassTransmission`：无 `recipientId`，`status: 'sent'`，message = `local share intent only; not proof of delivery`。
- 微信 `passMoment`：精确 id、仅 owner、仅 `active`、幂等 id `tx:local:pass:{momentId}:{revision}`（`test/pass-moment.test.js`）。
- iOS 未接入该命令，也未建表。

### 2.4 AccessGrant / Collection / FutureAccessPolicy

- 仅 `domain/moment/moment.types.d.ts` 契约。
- `spec/moment-domain-model.md`：V1 不进入存储。
- 不能当作已实现权限机制。

### 2.5 微信 nearby

- `services/nearby-service.js` `receiveNearbyLight` 写入 `legacy: true`、`legacySource: 'nearby-mock'`。
- 审计结论：这是旧演示路径，**禁止**当作家庭接收或真实送达证据。
- iOS 禁止空库 mock（`PHASE_0_DOMAIN_AUDIT.md` Catalog 条）。

---

## 3. iOS 个人闭环（家庭的对照基线）

已在 main 上交付、且不得被家庭工作破坏：

| 能力 | 路径 |
| --- | --- |
| 文字 / 最多 3 图 / 1 段现场录音 / 可选感受 | `apps/ios/src/application/use-cases.ts`、`leave.tsx` |
| 草稿恢复、保存幂等 | `drafts` 表；ADR 0003 状态机 |
| 最近、精确 id 详情 | `index.tsx`、`moment/[id].tsx` |
| 年 / 月 / 日回看 | `history-use-cases.ts`、`app/lookback/**` |
| 媒体失败保全 | `expo-media.ts`、`recovery-use-cases.test.ts` |
| 本机身份 | 恒为 `local-user` |

没有家庭 Tab、家庭 feed、分享确认框。空状态不得宣称「家庭已接上」。

---

## 4. 明确不是证据的东西

| 表象 | 不得推出的结论 |
| --- | --- |
| `status: 'sent'` | 家人已收到、网络已确认、已投递 |
| `visibility: 'shared_space'` | 已有家庭空间或成员可读 |
| `origin.type = 'received'` | 来自家庭成员的真实接收 |
| 微信 nearby / 递灯 | 家庭邀请或家庭时间线 |
| iOS 本机列表能读到记录 | 当前用户仍拥有家庭授权 |
| Transmission 枚举含 `received` / `revoked` | 已有接收或撤回状态机 |

---

## 5. 共享领域若要支撑家庭，必须另开 PR 的缺口

下列语义家庭需要、但当前领域没有。本轮**只记录**，不改根目录：

1. Family / Membership / Invitation 聚合不存在。
2. Transmission 没有家庭目标字段。
3. 没有 `queued` / `delivered` 状态，也没有「网络确认」字段。
4. 没有邀请、退出、移除、撤回的领域命令。
5. `AccessGrant` 未实现存储。
6. 没有快照正文存储（只有 `snapshotRevision` 指针）。

影响面见 `adr/0006-family-identity-and-sync.md`。
