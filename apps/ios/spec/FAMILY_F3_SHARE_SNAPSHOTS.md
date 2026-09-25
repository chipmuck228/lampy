# F3：Moment 分享快照

日期：2026-09-25。基线 `origin/main` `13212d6`（PR #12 merge，含 F2 `3949fb5`）。本切片只保存不可变分享快照及其授权依据，**不实现**接收下载、家庭缓存、时间线或撤回。

`identityLoopAccepted` 仍为 false。家庭入口仍只在 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 配置时出现；本切片不打开该入口。

## 未决项与本切片决策

| 项 | 决策 | 理由 |
| --- | --- | --- |
| `sourceRevision` | 钉个人 Moment 的整数 `revision`。服务端原样保存，并与白名单内容指纹绑定 | 原件继续改 `revision` 时，已存快照不动。要更新只能再分享一次（新 revision）。 |
| 快照白名单 | `note`、`emotion`、`occurredAt`、`occurredAtPrecision`、已选 F2 `objectId`（服务端补 `mimeType`/`byteLength`） | 规格首版字段。不含 `significance`、`context.people`、整份 Moment JSON、`localUri`。 |
| 来源信息 | 快照内保存 received 三件套：`transmissionId=shareId`、`originalMomentId`、`snapshotRevision`，外加 `familyId` | 给 F4 用。F3 不把快照写入个人 `moments`。不改微信 `domain/`。 |
| 可见范围 | 提交时记下 `sharedAt` 与当时全部 **active** `audienceUserIds`（含作者） | 后来加入者不在名单里，默认不可见。不是时间线，只是授权依据。 |
| 媒体 | 只引用已上传且 `ownerUserId` 为当前用户、文件可读且哈希匹配的 F2 对象。`expectedMediaCount` 只与同一次请求的 `mediaObjectIds.length` 比较 | 服务端看不到个人库，不能证明原件媒体数量。缺文件或上传失败时，**App 确认**不得悄悄少一张。他人 objectId → `FORBIDDEN`。 |
| 幂等 | 可选 `Idempotency-Key`。`userId+shareMoment+key` 且指纹相同则同一 `shareId`。指纹 = family + moment + revision + 白名单。同一 `(family, author, sourceMomentId, sourceRevision)` 也复用 | 重试不建两份。revision 同、字段不同 → `CONFLICT`。 |
| 部分失败 | 任一媒体核不过或事务未提交：不建分享，不返回已保存。已上传的 F2 对象保留。个人原件与个人媒体不改 | 媒体上传失败或保存失败都不得显示分享成功。 |
| 读接口 | `GET` 单条分享：再核会话、成员资格、audience。不是家庭 feed | 用来证明后来加入者不可见。不下载媒体、不写本机缓存。 |
| 成功文案 | 「分享已经保存在家里的服务上」 | 不得写「家人已收到」。 |

## API

```text
POST /v1/families/:familyId/shares
Authorization: Bearer
Idempotency-Key: <optional>
{
  sourceMomentId, sourceRevision,
  note, emotion, occurredAt?, occurredAtPrecision,
  mediaObjectIds, expectedMediaCount
}

200 {
  shareId, familyId, authorUserId, sourceMomentId, sourceRevision,
  snapshot: { note, emotion, occurredAt, occurredAtPrecision, media, origin },
  audienceUserIds, sharedAt,
  stored: 'server'
}

GET /v1/families/:familyId/shares/:shareId
200 同上（无 localUri、无令牌、无 people）
```

`origin`：`{ type: 'received', transmissionId, originalMomentId, snapshotRevision }`。

## 信任边界

服务端**没有**个人 Moment 库。`sourceMomentId`、白名单字段、`mediaObjectIds` 和 `expectedMediaCount` 都由调用方提供。服务端只核：会话、成员资格、本人 F2 对象是否可读、以及**请求内部** `expectedMediaCount === mediaObjectIds.length`。调用方可以把媒体列表和数量同时设为零（有 note 即可）。

因此不得宣称：

- 「服务端验证本人个人原件」
- 「服务端保证原件媒体不会遗漏」

实际 App 的确认流程必须从本机个人库重新读取该 Moment，按当时 `assetIds` 逐项核对；缺文件、读失败或尚未上传时不得把数量改成 0 后提交。

## 失败码

| 码 | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 无会话 |
| `NOT_IN_FAMILY` | 404 | 不是该家有效成员；确认前被移出/退出/解散 |
| `FORBIDDEN` | 403 | 引用他人媒体；或分享存在但读者不在当时 audience |
| `SHARE_NOT_FOUND` | 404 | 无此分享 |
| `SHARE_MEDIA_INCOMPLETE` | 400 | 确认的媒体数量与请求不一致 |
| `SHARE_MEDIA_UNAVAILABLE` | 409 | 媒体缺失、不可读或哈希不对 |
| `CONFLICT` | 409 | 幂等键或同一 revision 复用但快照字段不同 |
| `BAD_REQUEST` | 400 | 字段不合法（含试图带 localUri） |

## 客户端

组合根 `createIosFamilyUseCases` 必须注入与个人页同一套 SQLite `moments` / `assets`，以及可读本机文件的 `readAssetBytes`。未注入则预览为 `MOMENT_NOT_FOUND`。

个人详情在 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 已配置时出现「分享给家里」，进入 `/share/:id`。未配置时不出现该入口，确认页也不请求家庭服务。

`prepareSharePreview(momentId)`：只读本机个人 Moment。不在个人库 → 不能分享（含「他人记录」）。列出将发送的白名单；每条媒体须已有本人 F2 对象，或本机文件可读、确认时再上传。

`confirmShareMoment(...)`：再读个人 Moment，revision 对不上则拒绝。`expectedMediaCount` 取这次重读的 `assetIds.length`，不采用调用方自报数量。缺一条就失败，不得提交空媒体列表来跳过。状态：`idle` / `confirming` / `stored` / `failed`。失败不改个人库。

## 不做（F4 / F5）

接收设备下载、家庭缓存、家庭时间线、撤回、Transmission 改写、自动上传、打开家庭入口、宣称身份闭环通过。
