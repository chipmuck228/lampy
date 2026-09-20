# 存储与迁移

## 新存储 key

| Key | 内容 |
|---|---|
| `lampy_moments` | Moment V1 数组 |
| `lampy_assets` | Asset V1 数组 |
| `lampy_transmissions` | Transmission V1 数组 |
| `lampy_draft_moment` | 当前未点亮的草稿 Moment |
| `lampy_migration_lights_v1` | 迁移标记 |
| `lampy_lights_quarantine` | 无法迁移的损坏旧记录 |

旧 key **保留**：

| Key | 内容 |
|---|---|
| `lampy_lights` | 旧 light 数组，迁移成功后不删除 |
| `lampy_draft` | 旧草稿，读取时升级到草稿 Moment |
| `lampy_incoming` / `lampy_splash_shown` / `lampy_nearby_last_visit` | 会话/UI 状态 |

Repository 不向页面暴露这些 key。

## Repository 边界

- 只有 adapter 调用 `wx.getStorageSync` / `wx.setStorageSync`。
- 读出后必须 `validateMoment` / `validateAsset`。
- 单条损坏数据进入隔离列表，不让整表失败。
- 测试通过注入 memory storage，不依赖微信运行时。

## V0 light → Moment V1 映射

| 旧字段 | 新位置 |
|---|---|
| `id` | `Moment.id`（原样保留，保证幂等） |
| `text` | `content.note` |
| `emotion` | `content.emotion` |
| `createdAt` | `time.occurredAt` 与 `time.recordedAt`（旧模型无法区分，精度 `exact`） |
| `source === 'nearby'` | `origin.type = received`，并生成稳定 legacy Transmission |
| 其它 source | `origin.type = created` |
| `isPublic` | `accessSummary.visibility`：true → `public`，false → `private` |
| `imagePath` | 新建 image Asset，`id = asset:{lightId}:image` |
| `voicePath` | 新建 audio Asset，`id = asset:{lightId}:audio` |
| `isPassed` | **不写入 Moment**；若为 true，生成 `id = tx:legacy:passed:{lightId}` 的 Transmission |
| `position` | **丢弃** |

附近收下的 legacy origin：

```text
transmissionId = tx:legacy:received:{lightId}
originalMomentId = 旧记录 id（或去掉 collected_ 前缀）
snapshotRevision = 1
legacy = true
legacySource = migrated-nearby
```

`ownerId` 一律为 `local-user`。这是未登录 MVP 过渡策略。

## 幂等

1. 已存在相同 Moment.id 则跳过，不复制。
2. Asset / Transmission 使用从 light id 派生的稳定 id，不使用随机数。
3. 成功后写 `lampy_migration_lights_v1`。标记已存在时仍按 id 去重，不会再插入。

## 失败策略

- 不先删旧数据再写新数据。
- 单条失败：写入 quarantine，继续下一条。
- 整次失败：新数据已写入的保留，旧 `lampy_lights` 不动，不写成功标记。
- 控制台输出可诊断日志：`[lampy.migration]`。

## 损坏数据

- 无 id 或非对象：quarantine。
- 迁移后仍不能通过 validator：不入库，quarantine。
- 其它合法记录不受影响。

## 临时媒体路径风险

`Asset.localUri` 可能是微信临时文件，重启或数天后失效。V1 将 `storage.status` 标为 `local`，未来可替换为云 key，不改 Moment id。

## 当前本地存储限制

- 微信 localStorage 容量有限，不适合视频原片。
- 模拟 100 条旧 light 若仍在旧 key 中，迁移后会同时存在两份文本数据。
- 未实现加密。

## 未来云端替换边界

替换点是 Asset `storage.originalKey / previewKey` 与 Transmission 网络状态，不是 Moment 聚合形状。
