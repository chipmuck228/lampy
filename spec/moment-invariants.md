# Moment 不变量

验证失败返回 `ValidationResult`；命令失败抛出带稳定 `code` 的领域错误。

## 创建规则

| # | 规则 | 结果 |
|---|---|---|
| 1 | `id`、`ownerId` 非空字符串；`schemaVersion === 1`；`revision` 为大于 0 的整数 | `MOMENT_INVALID_ID` / `MOMENT_INVALID_OWNER` |
| 2 | 正式 `active` Moment 至少有非空文字、至少一个 assetId，或合法 received origin | `MOMENT_EMPTY` |
| 3 | `draft` 可以暂时没有有效内容 | 通过 |
| 4 | `time.recordedAt` 必须是合法 ISO 时间 | `MOMENT_INVALID_TIME` |
| 5 | `occurredAtPrecision !== 'unknown'` 时必须有合法 `occurredAt` | `MOMENT_INVALID_TIME` |
| 6 | 不得把 `importedAt` 自动写成 `occurredAt` | 命令拒绝，`MOMENT_INVALID_TIME` |
| 7 | 不得把 Asset metadata 拍摄时间自动写成 Moment 发生时间 | 命令拒绝，`MOMENT_INVALID_TIME` |
| 8 | `revision` 从 1 开始，每次领域修改 +1 | 由命令保证 |

## 编辑规则

| # | 规则 | 结果 |
|---|---|---|
| 9 | 只有 `ownerId === actorId` 可改主体 | `MOMENT_FORBIDDEN` |
| 10 | Suggestion / AI 结果不得直接覆盖 content | 领域层无 suggestion 写入入口 |
| 11 | `audit.updatedAt >= audit.createdAt` | `MOMENT_INVALID_TIME` |
| 12 | `trashed` 不得直接编辑，须先恢复 | `MOMENT_TRASHED` |

## 时间规则

- 发生时间与记录时间分离。
- 精度为 `unknown` 时允许没有发生时间。
- 导入时间、拍摄时间都只是线索，不是发生时间。

## 来源规则

| # | 规则 | 结果 |
|---|---|---|
| 13 | `origin.type === 'received'` 必须有 `transmissionId`、`originalMomentId`、`snapshotRevision` | `MOMENT_INVALID_ORIGIN` |
| 14 | 收下后接收者是新副本 owner，不得改写成原作者 | `MOMENT_INVALID_ORIGIN` / `MOMENT_FORBIDDEN` |
| 15 | 导入必须 `origin.type === 'imported'`，并带 `importSource` | `MOMENT_INVALID_ORIGIN` |

## 权限规则

- 当前无账号系统，默认 `local-user`。
- `accessSummary` 只描述摘要，不授予访问。
- 非 owner 的任何写命令失败，`MOMENT_FORBIDDEN`。

## 生命周期规则

合法转换：

```text
draft -> active
active -> archived
archived -> active
active -> trashed
archived -> trashed
trashed -> active
```

其它转换：`MOMENT_INVALID_TRANSITION`。

## 删除规则

- 永久删除不是 Moment 状态。
- `remove(id)` 只允许 repository 使用，并应留下审计日志。
- 普通产品路径只使用 `trashMoment`。

## AI suggestion 边界

- 正式 Moment 的 `content`、`time.occurredAt`、`origin` 只能由用户确认的命令写入。
- Suggestion 模型不得被 repository 当作 Moment 保存。

## 输入引用隔离

进入 Moment / Asset / Transmission 的嵌套对象与数组必须复制。调用者之后修改原 input 不得改变领域对象；命令返回新对象，不修改原聚合。`revision` 只由领域命令递增。

## 运行时 Validator

`.d.ts` 只是开发期契约。持久化读写必须经过完整运行时校验。结构错误使用稳定错误码，不只匹配英文文本：

- `MOMENT_INVALID_CONTENT` / `MOMENT_INVALID_CONTEXT` / `MOMENT_INVALID_ACCESS` / `MOMENT_INVALID_LIFECYCLE`
- `ASSET_INVALID`
- `TRANSMISSION_INVALID`
- `REPOSITORY_INVALID_RECORD`

Validator 不得猜测或改写时间。

## 光罐日历

`projectMomentsToVault` 按查看者时区的自然日 / 自然月 / 自然年筛选。

- `timezoneOffsetMinutes`：东为正，UTC+8 = 480，UTC-5 = -300。
- 页面把 `Date#getTimezoneOffset()` 取反后传入。
- 未传入时默认 `0`（UTC）。
- 非法 view 抛 `VAULT_INVALID_VIEW`，不得静默当 year。
- 优先 `time.occurredAt`；缺失时回退 `time.recordedAt` 仅作展示，不伪造发生日期。
