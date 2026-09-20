# Moment 领域模型 V1

## 定义

Moment 是由一个用户明确确认值得保留、具有可表达的发生时间，并可以包含文字、情绪、媒体和上下文的生活瞬间。

它回答的问题是：什么事情在什么时候发生，由谁确认值得留下，留下了哪些真实内容。

## 为什么 Moment 是聚合根

Lampy 的产品能力都将围绕“被确认的生活瞬间”展开，而不是围绕一张图、一段录音或一次分享。媒体、传递、授权都依附于这个确认行为。

因此 Moment 是一致性边界：

- 内容、时间、来源、生命周期、资产引用在同一事务语义下变更；
- `revision` 只由 Moment 命令递增；
- 页面不得直接拼装 lifecycle 或 origin。

Moment 不是万能对象。传递历史、长期授权、集合、建议都在聚合外。

## 聚合边界

```text
Moment
├── content          用户确认过的文字与情绪
├── time             发生时间与记录时间
├── context          人、地点、标签
├── origin           创建 / 导入 / 接收
├── lifecycle        draft | active | archived | trashed
├── accessSummary    当前可见性摘要，不是授权账本
└── assetIds         资产身份列表，不是临时文件路径

独立模型
├── Asset
├── Transmission
├── AccessGrant      V1 只建契约，不实现存储
├── Collection       V1 只建契约，不实现存储
├── Suggestion       V1 只建契约，禁止写入正式内容
└── FutureAccessPolicy
```

## 字段语义

| 字段 | 语义 |
|---|---|
| `id` | 稳定身份。迁移时尽量沿用旧 light id。 |
| `schemaVersion` | 持久化契约版本，当前为 `1`。 |
| `revision` | 领域内容版本，从 1 开始，每次合法修改 +1。 |
| `ownerId` | 这份 Moment 副本的主人。接收副本的 owner 是接收者，不是原作者。 |
| `content.note` | 用户写下的文字。对应旧 `text`。 |
| `content.significance` | 用户确认的“为何值得留下”。V1 页面未采集。 |
| `content.emotion` | 用户选择的情绪。 |
| `time.occurredAt` | 事情发生的时间。不是导入时间，也不是媒体 metadata 时间。 |
| `time.occurredAtPrecision` | 发生时间精度。`unknown` 时允许没有 `occurredAt`。 |
| `time.recordedAt` | 用户或系统记录这条 Moment 的时间，必须存在。 |
| `time.importedAt` | 素材进入系统的时间，不得当作发生时间。 |
| `assetIds` | Asset 身份。Moment 内禁止只存微信临时路径。 |
| `origin` | 如何进入这个用户的记忆。 |
| `accessSummary` | 展示与默认可见性，不是完整授权记录。 |
| `lifecycle` | 草稿、正式、归档、回收站。永久删除不是状态。 |
| `audit` | 创建/更新时间。`updatedAt` 不得早于 `createdAt`。 |

## 与 Asset、Transmission 的关系

- Asset 是独立持久化实体，Moment 只保存 `assetIds`。
- 一张图或一段录音不能单独成为 Moment 类型。
- Transmission 记录“递给谁 / 从谁收下”，禁止用 Moment 上的布尔值代替。
- 收下别人的 Moment 会生成接收者自己的新 Moment，`origin.type = received`，并指向 `transmissionId` 与 `originalMomentId`。

## 明确不属于 Moment

- 光墙坐标、大小、颜色、透明度、模糊、动画延迟；
- 微信临时文件路径本身；
- `isPassed` / `isPublic` 这类展示或一次性标记；
- AI 识别或生成结果（只能是 Suggestion）；
- 点赞、评论、关注；
- 完整授权账本和数字遗产策略。

## 相对候选结构的调整

1. `origin` 增加可选 `legacy?: true` 与 `legacySource`。旧 nearby 数据没有真实传递闭环，必须标明迁移来源，不能假装完整 Transmission。
2. `Asset.localUri` 仅表示当前设备可读位置，`storage.status` 才是资产身份状态。V1 没有云 key。
3. `AccessGrant` / `Collection` / `Suggestion` / `FutureAccessPolicy` 只提供 `.d.ts` 契约，不进入 `lampy_moments`。
4. 未登录阶段使用固定 `ownerId = local-user`，这是 MVP 过渡，不是真实账号系统。
5. 领域层保持纯 JavaScript + JSDoc + `.d.ts`，不改造为 TypeScript 工程。

## V1 已解决

- 把 light 拆成 Moment / Asset / Transmission；
- 领域命令与不变量；
- 运行时校验与本地 repository；
- 旧数据幂等迁移；
- UI projection 离开持久化模型。

## V1 有意不解决

- 云存储、真实分享接收、视频选择 UI、AI 识别、家庭空间、数字遗产；
- 真实用户身份与多人授权；
- 微信临时文件过期后的媒体恢复。
