# F4：接收与家庭缓存

日期：2026-09-25。基线 `origin/main` `7d53c1d`（PR #13 merge，含 F3 `9152e6d`）。本切片只让**当前有效成员**读取其有权接收的 F3 快照及关联 F2 媒体，并写入与个人库隔离的家庭缓存。

`identityLoopAccepted` 仍为 false。家庭入口仍只在 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 配置时出现；本切片不打开该入口。F5 撤回与退出后彻底清理另开 PR；本切片必须先做到失去或无法确认资格时**不展示**缓存。

## 未决项与本切片决策

| 项 | 决策 | 理由 |
| --- | --- | --- |
| 列表 | `GET /v1/families/:familyId/shares` 只返回：有效会话 + 当前 active 成员 + `audienceUserIds` 含本人 + 分享状态为 active | 后来加入者不在 F3 名单里，默认空列表。不是时间线。 |
| 单条快照 | 沿用 F3 `GET .../shares/:shareId`，每次再核会话、成员、audience、状态 | 缓存存在不是授权证明。 |
| 媒体读取 | **新路径** `GET .../shares/:shareId/media/:objectId` 与 `/content`。F2 `GET /v1/media/:id` 仍仅上传者可读 | 已知 objectId 不能绕过快照授权。objectId 必须出现在该分享白名单里。 |
| 分享状态 | F4 视已存行为 `active`。尚无撤回列；F5 再持久化 `revoked`。读取时若将来不是 active 则当不存在 | 本切片不实现撤回。 |
| 哈希 | 授权媒体元数据返回服务端 `contentSha256`。客户端写入前必须比对长度与哈希 | 缺文件或哈希不符不得标为已接收。 |
| 缓存键 | `(userId, familyId, shareId)`。文件在 `family-cache/`，不进 `lampy-assets/` | 按登录账号及家庭隔离。 |
| 接收状态 | `listed` / `receiving` / `received` / `failed`。只有全部媒体提交后才是 `received` | 半条下载、写失败、进程重启都不得展示「完整接收」。 |
| 临时文件 | `{shareId}/{objectId}.part`。核验通过才改名；失败删除 `.part`；退出/登出删除该账号该家目录 | 重试幂等：已核验文件可跳过。 |
| 展示 | 资格 `ready` 才读缓存。离线、401、成员无法确认、退出、被移除、解散：立即隐藏。`listed`/`receiving`/`failed` 只写「家里有这条分享」 | 不得用 F3 保存成功推断「家人已收到」。 |
| 个人库 | 接收快照不进 `moments`，不得写成 `origin.created`，不出现在最近/回看 | 个人文字、照片、录音、回看继续可离线。 |

## 授权矩阵（读取）

| 读者 | 列表 | GET 快照 | F4 分享媒体 | F2 `/v1/media/:id` |
| --- | --- | --- | --- | --- |
| 未登录 | 401 | 401 | 401 | 401 |
| 已登录、非该家成员 | 404 | 404 | 404 | 仅本人上传对象 |
| 分享时已是成员（在 audience） | 可见该条 | 200 | 200（objectId 在快照内） | 仅本人上传对象 |
| 后来加入者（不在 audience） | 不含该条 | 403 | 403 | 仅本人上传对象 |
| 知道 objectId 但不在该快照 | — | — | 403 | 非上传者 403 |
| 退出 / 被移除 / 解散后 | 404 | 404 | 404 | 仅本人上传对象 |
| 离线 / 权限无法确认 | App 不展示 | 不展示 | 不展示 | 不展示家庭内容 |

## API

```text
GET /v1/families/:familyId/shares
Authorization: Bearer
200 { shares: ShareView[] }

GET /v1/families/:familyId/shares/:shareId
200 ShareView（F3，无 localUri / 令牌 / people）

GET /v1/families/:familyId/shares/:shareId/media/:objectId
200 { objectId, mimeType, byteLength, contentSha256 }

GET /v1/families/:familyId/shares/:shareId/media/:objectId/content
200 raw bytes + Content-Type
```

`GET /v1/media/:objectId` 与 `/content` **不变**：仍仅上传者。接收不得走这两条。

## 缓存结构

```text
family_received_shares
  (user_id, family_id, share_id) PK
  snapshot_revision, author_user_id, snapshot_json, shared_at
  receive_status, expected_media_count

family_received_media
  (user_id, family_id, share_id, object_id) PK
  mime_type, byte_length, content_sha256, storage_key, status
```

`snapshot_json` 只有 F3 白名单。`storage_key` 只存相对 `family-cache/` 的 objectId，不进个人 Asset。`receive_status=received` 当且仅当 `expected_media_count` 条媒体均为 `stored` 且哈希已核。

## 失败恢复

| 情况 | 行为 |
| --- | --- |
| 下载中断 / 进程重启 | 保持 `receiving` 或 `failed`；已核验文件可复用；`.part` 删除后重拉 |
| 媒体缺失 / 哈希不符 | 不标 `received`；该条保持「家里有这条分享」 |
| SQLite 写失败 | 回滚该次提交；不展示完整接收 |
| 重试 | 同一 `shareId` 幂等；已存且哈希对则跳过 |
| 离线 / 401 / 成员无法确认 | 立即隐藏；不删个人库；缓存不得当现授权 |
| 退出 / 被移除 / 解散 / 登出 | 立即隐藏；隔离或删除该账号该家缓存目录与行 |

## 客户端

`listFamilyInbox()` / `refreshFamilyInbox()`：成员不是 `ready` 则 `{ kind: 'hidden' }`，不展示缓存行。

`receiveShare(shareId)`：走 F4 媒体路径，不走 F2 上传者 GET。成功只表示**本机已写入家庭缓存**。

## 不做（F5 / 时间线）

撤回、服务端停供、退出后保证清掉所有导出、家庭时间线、Transmission 改写、打开未配置的家庭入口、宣称身份闭环或家人已收到。
