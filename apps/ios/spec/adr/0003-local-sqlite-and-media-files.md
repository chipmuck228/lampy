# ADR 0003：iOS 本地结构化存储与媒体文件

状态：已接受（Phase 0，实现尚未开始）
日期：2026-09-24

## 决策

- **结构化数据**：`expo-sqlite`。表至少：`moments`、`assets`、`moment_assets`、`drafts`、`draft_assets`、`schema_migrations`。
- **图片与音频**：`expo-file-system` 写入 App 持久目录。禁止把 URI / base64 / 二进制塞进 Moment 行。
- **小型安全配置**：`expo-secure-store` 仅放必要配置，不放 Moment JSON、不放媒体。
- **禁止**：AsyncStorage 存 Moment/Asset；微信 Key `lampy_*`；空库写入 mock。
- **草稿**与正式 Moment 分表。保存状态机：`draft → persisting-assets → committing-moment → saved | recoverable-failure`。保存必须幂等。
- **媒体生命周期**：临时拍照/录音不是 Asset。须：稳定 Asset ID → 复制到持久目录 → 确认存在 → 记录 mime/大小/时长/尺寸 → 原子写入 Asset 与引用。失败保留可恢复草稿。仅当无 Moment/Draft 引用时删除应用自有文件。不删除系统相册原片。缺失 Asset 不删除 Moment。

## 与微信存储的隔离

微信 `lampy_moments` 等 Key 与迁移结构保持不动。iOS 库从 schema version 1 新建，不跑 `migrate-lights-to-moments-v1`。

## 后果

- 保全规则对齐 `safe-repository`：损坏返回错误，不写 mock；找不到指定 id 不回退。
- 下一轮先做纯文字，可暂缓真实文件复制，但仍不得把正文以外的媒体假数据写入 Moment。
