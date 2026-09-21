# 存储与迁移

## 新存储 key

| Key | 内容 |
|---|---|
| `lampy_moments` | Moment V1 数组，含合法与尚未识别的原始项 |
| `lampy_assets` | Asset V1 数组 |
| `lampy_transmissions` | Transmission V1 数组 |
| `lampy_draft_moment` | 当前未点亮的草稿 Moment |
| `lampy_migration_lights_v1` | 迁移标记 |
| `lampy_moments_quarantine` | 无法通过 Moment validator 的原始记录 |
| `lampy_assets_quarantine` | 无法通过 Asset validator 的原始记录 |
| `lampy_transmissions_quarantine` | 无法通过 Transmission validator 的原始记录 |
| `lampy_lights_quarantine` | 无法迁移的损坏旧 light |

旧 key **保留**：

| Key | 内容 |
|---|---|
| `lampy_lights` | 旧 light 数组，迁移成功后不删除 |
| `lampy_draft` | 旧草稿，读取时升级到草稿 Moment |
| `lampy_incoming` / `lampy_splash_shown` / `lampy_nearby_last_visit` | 会话/UI 状态 |

Repository 不向页面暴露这些 key。

## Repository 数据保全

- `list()` / `getById()` 只返回通过 validator 的记录。
- 非法记录写入对应 quarantine，**原文仍留在主数组**。
- `save(entity)` 只替换相同合法 id 的旧版本，其它原始项全部保留。
- `remove(id)` 只删除明确匹配的 id。
- 不得把“过滤后的合法数组”整表写回。
- `replaceAll(records)`：任一条非法则整体拒绝，原存储不变。
- 顶层集合已存在但不是数组：`list()` 返回空；`save` / `remove` / `replaceAll` 抛 `REPOSITORY_COLLECTION_NOT_ARRAY`，**不得覆盖原文**；整份原文进入 quarantine。
- 集合 key 缺失时视为空数组，允许第一次写入。
- quarantine 用稳定 fingerprint 去重：`entityType + 稳定序列化哈希`。相同原文只更新 `lastSeenAt`。
- 内容变化会产生新 fingerprint，这是有意行为。

quarantine 项：

```text
fingerprint, entityType, reason, errors[], raw, firstSeenAt, lastSeenAt
```

## V0 light → Moment V1 映射

| 旧字段 | 新位置 |
|---|---|
| `id` | `Moment.id` |
| `text` | `content.note` |
| `emotion` | `content.emotion` |
| `createdAt` | `time.occurredAt` 与 `time.recordedAt` |
| `source === 'nearby'` | received + legacy Transmission |
| 其它 source | created |
| `isPublic` | visibility |
| `imagePath` / `voicePath` | Asset |
| `isPassed` | 只生成 `tx:legacy:passed:{id}` |
| `position` | 丢弃 |

传入的 `ownerId`（缺省 `local-user`）同时用于 Moment.ownerId、Asset.ownerId、legacy passed 的 senderId、legacy received 的 recipientId。

## 迁移标记

```text
version: 1
sourceFingerprint: 旧 lights 集合的稳定指纹
completedAt
migrated / skipped / quarantined
```

- 版本与 `sourceFingerprint` 相同：不再写入，返回 `alreadyDone: true`，`skipped` 为已存在 Moment 的 light 数。
- lights 内容变化：重新扫描；已有 id 不重复；quarantine fingerprint 去重。
- 旧 key 不是数组：不写成功 marker，不删数据。

## 失败策略

- 不删除 `lampy_lights`。
- 不删除已有 Moment / Asset / Transmission。
- 单条失败进入 `lampy_lights_quarantine`，继续下一条。
