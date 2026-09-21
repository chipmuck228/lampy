# Moment 详情回看

## 产品目的

用户已经可以记录。本页补上价值链的最后一环：

```text
记录 → 积累 → 点击旧光 → 重新回忆
```

从首页光墙或光罐点击一颗光，进入同一条只读详情。

## 回看闭环

```text
首页光墙点击光点
        ↓
/pages/moment-detail/moment-detail?id={encodeURIComponent(momentId)}
        ↑
光罐点击光点
```

只传 Moment ID。详情页重新从 Repository 读取，不把完整 Moment 放进 URL。空状态 seed 不导航。

## ViewModel

页面只消费 `getMomentDetail()` 返回的只读 ViewModel：

- `displayDate.primary` / `precision` / `usedRecordedAtFallback`
- `content.note` / `significance` / `emotion`
- `source.type` / `label` / `isLegacy`
- `assets[]`：按 `assetIds` 精确解析
- `state`：是否有文字、可用图片、可用录音、不可用媒体

不向页面暴露 `ownerId`、`revision`、`schemaVersion`、`transmissionId`、`storage.status` 或存储 key。

## Service 与 Projection

- `services/moment-detail-service.js`：校验 ID，读 Repository，组合 ViewModel。
- `projections/moment-detail-projection.js`：纯函数，`projectMomentDetail(moment, assets, options)`。
- 找不到 Moment：`MOMENT_NOT_FOUND`，不回退到第一条。
- 顶层集合非数组：`REPOSITORY_COLLECTION_NOT_ARRAY`，不覆盖原文。
- 读取不增加 revision，不修改 Moment / Asset。

## 日期精度

时区东经为正：UTC+8 = 480，UTC-5 = -300。未传入默认 UTC。

| 精度 | 展示 |
|---|---|
| exact | 2026年9月21日 18:32 |
| day | 2026年9月21日 |
| month | 2026年9月 |
| year | 2026年 |
| unknown | 时间未确认 |

`occurredAt` 缺失而使用 `recordedAt` 时：`usedRecordedAtFallback: true`，文案为 `记录于 2026年9月21日`。不得把记录时间伪装成发生时间。

## Asset 解析

按 `Moment.assetIds` 逐个 `AssetRepository.getById()`。不按全局数组顺序猜测归属。

| 情况 | 媒体状态 |
|---|---|
| Asset 不存在 | `missing`，保留 assetId |
| `storage.status === missing` | `missing` |
| `storage.status === failed` | `failed` |
| `localUri` 为空 | 不得为 `available` |
| 视频且路径可用 | `unsupported` |

任一媒体失败不影响文字和其他媒体。不删除 Moment 或 Asset。

## 图片与录音

- 可用图片单击 `wx.previewImage()`，`urls` 为当前 Moment 全部可用图片。
- 组件加载失败只改页面状态：`这张照片暂时无法显示`。
- 录音使用一个 `InnerAudioContext`：播放 / 暂停 / 继续；结束后复位；卸载时 stop + destroy。
- 每次播放有 `playbackSessionId`。切换录音时停止旧音频产生的 onStop / onEnded / onError 不得覆盖新播放。
- 播放失败只改本次页面会话中的 Asset 展示状态，不写回领域 Asset。
- 非法 query 编码进入 not-found，不得让 decodeURIComponent 把页面打崩。
- 不自动播放。文案：`听听当时的声音` / `播放` / `暂停` / `声音暂时无法播放`。
- 时长只来自 `metadata.durationMs`，没有就不显示。

## 来源展示

| origin | 文案 |
|---|---|
| created | 你点亮的瞬间 |
| imported | 后来拾起的时光 |
| received | 收下的一盏微光 |

legacy received 只表示本地迁移来的收下记录，不是真实送达证明。

## 页面状态

单一 `status`：`loading` | `ready` | `not-found` | `error`。

- loading：呼吸光，无假内容
- not-found：这盏光暂时找不到了
- error：暂时无法打开这盏光（技术信息只写 console）

## 本轮不包含

编辑、删除、归档、评论、点赞、AI 总结、分享链接、视频播放、云端媒体、家庭空间、数字遗产。

## 自动化测试

见 `test/moment-detail-service.test.js`、`test/moment-detail-projection.test.js`。

## 人工预览

见 `spec/MOMENT_V1_PREVIEW_VERIFICATION.md`。详情页清单须在微信开发者工具中逐项确认。
