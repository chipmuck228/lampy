# Moment 生命周期

```text
draft -> active
active -> archived
archived -> active
active -> trashed
archived -> trashed
trashed -> active
```

## 各状态允许的操作

| 状态 | 允许 |
|---|---|
| `draft` | 更新内容、挂接/卸下 Asset、激活、关闭后作为草稿恢复 |
| `active` | 更新内容、挂接/卸下 Asset、归档、移入回收站、创建 Transmission |
| `archived` | 恢复为 active、移入回收站 |
| `trashed` | 恢复为 active |

## 禁止的转换

- `draft -> archived`
- `draft -> trashed`
- `trashed -> archived`
- `trashed -> draft`
- `active -> draft`
- 任意跳到未定义状态

没有对应领域命令的状态改写一律非法。

## Asset 上传状态与 Moment 解耦

Asset 有自己的 `storage.status`：`local | pending | ready | failed | missing`。

- Moment 可以在 Asset 仍为 `local` 时激活（当前微信临时文件即如此）。
- Asset 丢失或上传失败不自动把 Moment 改成 `trashed`。
- 未来云上传替换的是 Asset storage，不是 Moment lifecycle。

## 草稿关闭和恢复

- 记录页关闭时，未激活的 Moment 以 `draft` 写入草稿存储。
- 再次进入记录页读取同一草稿，不新建 id。
- 点亮成功后清除草稿，Moment 进入 `active` 并写入正式仓库。

## 删除为什么不是普通状态

回收站是可逆隔离。永久删除破坏身份稳定性，影响 Transmission 引用和迁移幂等，因此只作为 repository 操作，不进入状态机。

## 递灯

`passMoment(momentId, storage, actorId)` 必须精确指定 Moment：

1. `momentId` 必填。
2. 找不到目标明确失败，不得回退到列表第一条。
3. 只有当前 actor 的 `active` Moment 可以递灯。
4. 本地幂等 id：`tx:local:pass:{momentId}:{revision}`。同 id 保存更新同一项。
5. Transmission 的 `sent` 只表示本地分享意图，不是真实送达证明。当前没有网络接收闭环。
