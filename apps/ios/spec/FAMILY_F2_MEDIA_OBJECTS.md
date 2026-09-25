# F2：服务端媒体对象

日期：2026-09-25。基线 `origin/main` `f4472c3`。本切片只建立将来分享可引用的服务端媒体能力，**不实现 Moment 分享**。规格 F2 是媒体对象，不是身份闭环，也不是家庭时间线。

`identityLoopAccepted` 仍为 false。家庭入口仍只在 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 配置时出现；本切片不打开该入口。

## 未决项与本切片决策

规格与 ADR 0006 只规定：媒体不得带设备 `localUri`；分享用服务端对象。下列实现细节此前未写死。

| 项 | 决策 | 理由 |
| --- | --- | --- |
| 大小 | 单对象最大 **8 MiB**（`8388608` 字节） | 覆盖一张照片或一段短录音，避免单实例家庭 API 被大文件拖垮。超过则 `MEDIA_TOO_LARGE`，不落盘。 |
| 格式 | 图片 `image/jpeg`、`image/png`；声音 `audio/mp4`（含 m4a/aac）。只认声明的 MIME **且** 核魔数 | 与个人库已有照片/录音一致。仅 Content-Type 不够，避免把任意字节标成媒体。 |
| 存储位置 | 元数据在家庭 SQLite（`family_media_objects`）。文件在受控目录 `LAMPY_FAMILY_MEDIA_PATH`，未设则为数据库目录下的 `media/`。磁盘文件名只有服务端 `objectId` | 重启后仍可按 ID 读。路径不进响应、日志、元数据。 |
| 删除时机 | F2 **不**因退出/移除/解散删对象（尚无分享授权）。上传失败、中断、元数据未提交时删除本次写入，不返回已保存。本切片不提供删除 API | 删除与分享撤回留给 F5。F2 只保证失败不冒充成功、不留可被引用的孤儿对象。 |
| 引用形态 | 服务端分配 `med_…` objectId。响应只有 `objectId` / `ownerUserId` / `mimeType` / `byteLength` / `createdAt` | 禁止本机路径当服务端引用。 |
| 谁能读 | 有效会话 **且** `ownerUserId` 是当前用户。他人即使知道 ID 也 `FORBIDDEN`。会话失效 `UNAUTHENTICATED` | 当前没有分享授权。 |
| 谁能传 | 已登录用户主动提交的字节。客户端 API 只接受调用方传入的 `bytes` + `mimeType`，不扫描个人库 | 个人默认不同步。 |
| 幂等 | `Idempotency-Key` 可选。同一 `userId + uploadMedia + key` 且内容指纹相同则返回同一对象。指纹不同 `CONFLICT`。同一用户同一内容哈希即使换 key 也复用已有对象 | 重试不复制。 |
| 校验失败 | 声明 MIME 与魔数不一致、空体、截断 → `MEDIA_UNSUPPORTED` 或 `MEDIA_CORRUPT`。不写对象 | 损坏内容不能当已保存。 |

## API

```text
POST /v1/media
Authorization: Bearer <session>
Idempotency-Key: <optional>
Content-Type: image/jpeg | image/png | audio/mp4
Body: raw bytes（不是 JSON，不含 localUri）

200 { objectId, ownerUserId, mimeType, byteLength, createdAt }

GET /v1/media/:objectId
Authorization: Bearer
200 同上元数据（无路径、无令牌）

GET /v1/media/:objectId/content
Authorization: Bearer
200 raw bytes + Content-Type
```

## 失败码

| 码 | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 无会话或已失效 |
| `FORBIDDEN` | 403 | 对象存在但不是上传者 |
| `MEDIA_NOT_FOUND` | 404 | 无此对象，或元数据在而文件缺失（不冒充可读） |
| `MEDIA_TOO_LARGE` | 413 | 超过 8 MiB |
| `MEDIA_UNSUPPORTED` | 415 | MIME 不支持或与魔数不符 |
| `MEDIA_CORRUPT` | 400 | 声明格式但内容不完整 |
| `MEDIA_WRITE_FAILED` | 507/500 | 磁盘不足或元数据未提交；已删本次文件 |
| `CONFLICT` | 409 | 幂等键复用但内容指纹不同 |

日志、响应、SQLite 行不得包含本机路径或会话令牌。`storage_key` 只存 `objectId`。

## 客户端

`uploadSelectedMedia({ bytes, mimeType, idempotencyKey })`：只上传这次明确传入的字节。状态：`idle` / `uploading` / `stored` / `failed`。失败不改个人 Moment、Asset、草稿文件。不出现「已分享」「家人已收到」。不开放家庭入口。

## 不做

Moment 分享、Transmission 改写、家庭时间线、接收快照、跨设备同步、媒体自动上传、微信 `domain/` 变更、真机/公网验收宣称。
