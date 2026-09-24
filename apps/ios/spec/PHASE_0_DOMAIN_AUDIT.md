# Phase 0：领域与平台审计

日期：2026-09-24。范围：只读审计。未修改根目录微信小程序代码。

分类：

- **可直接复用语义**：纯 CommonJS，无 `wx.*`，规则与测试已锁定。iOS 不得改语义，只能通过 adapter 调用或对等移植。
- **需要平台适配**：规则可复用，但存储、时钟、路径、页面 URL 或语言绑定了微信。
- **不能复用**：微信 UI、光墙视觉、mock 空库、微信 Key、未真实存在的能力。

## 1. 领域

| 模块 | 路径 | 判定 | 理由 |
| --- | --- | --- | --- |
| Moment 聚合与命令 | `domain/moment/moment.js`、`moment.commands.js` | 可直接复用语义 | `createDraftMoment` / `activateMoment` / `updateMomentContent` / `attachAsset` / `detachAsset` / 生命周期转换。无 `wx`。`attachAsset` **不限制**图片数量。 |
| Moment 校验 | `domain/moment/moment.validator.js` | 可直接复用语义 | 激活要求：非空文字、至少一个 `assetId`，或完整 `received` origin。`createdAt` 不能冒充 `occurredAt`。 |
| Moment 错误码 | `domain/moment/moment.errors.js` | 可直接复用语义 | 稳定 `code`。详情找不到用 `MOMENT_NOT_FOUND`，不得回退。 |
| Asset | `domain/asset/asset.js`、`asset.validator.js` | 可直接复用语义 | 独立实体。`captureTime` 不得写入 `Moment.time.occurredAt`。`type` 含 image/audio/video。`localUri` 只是本机位置。 |
| Transmission | `domain/transmission/transmission.js` | 可直接复用语义，**能力不等于送达** | `createLocalPassTransmission` 的 `sent` 只是本地分享意图。`message` 写明不是送达证明。 |
| 共享时间/克隆/身份 | `domain/shared/time.js`、`clone.js`、`identity.js`、`calendar.js`、`date-format.js` | 可直接复用语义 | `LOCAL_OWNER_ID = local-user` 是过渡身份，不是账号。日历边界已有测试。 |
| 哈希/光墙坐标 | `domain/shared/hash.js` | 不能复用到 iOS UI | 只服务随机视觉位置。设计规范禁止随机旋转与随机坐标。 |

**共享边界：** 根目录领域是 CommonJS + JSDoc，不是 TypeScript 工程。iOS 不得把文件复制成第二套真相。application 协调仓库与领域命令；projection 只消费已读取数据。见 `spec/adr/0002-typescript-javascript-share-boundary.md`。

## 2. Repository

| 模块 | 路径 | 判定 | 理由 |
| --- | --- | --- | --- |
| 保全规则 | `repositories/safe-repository.js`、`record-partition.js` | 需要平台适配 | `list` 只返回合法项；非法进 quarantine、原文留在主集合；非数组集合不得覆盖。规则必须保留。实现依赖可注入 `storage.get/set/remove`。 |
| Moment/Asset/Transmission 仓库 | `repositories/moment-repository.js` 等 | 需要平台适配 | 工厂本身无 `wx`，但默认绑微信 Key。 |
| Key | `repositories/keys.js` | **不能复用 Key 名** | `lampy_moments` 等属于微信存储。iOS 用 SQLite 表，不得改名或读写这些 Key。 |
| 存储适配 | `repositories/storage-adapter.js` | 部分 | `createMemoryStorage` 可测。`createWxStorage` 不能进 iOS。 |
| 微信 light 迁移 | `migrations/migrate-lights-to-moments-v1.js` | 不能复用到 iOS 运行时 | 只服务微信旧 light。iOS 新库不得跑这条迁移。 |

## 3. Service

| 模块 | 路径 | 判定 | 理由 |
| --- | --- | --- | --- |
| 详情读取 | `services/moment-detail-service.js` 的 `getMomentDetail` | 需要平台适配 | 精确 id、不回退、集合损坏报错。`buildMomentDetailUrl` 是微信路径，不能用。 |
| 记录写入 | `services/record-service.js` | 需要重写适配层 | 正确处：同一 clock、草稿与正式分离、激活后清草稿、`passMoment` 精确 id。错误处：默认 `getRuntime()` → 微信存储；表单只有 **一张图 + 一段语音路径**；草稿媒体走 `lampy_draft` 路径字符串，不是 Asset ID。 |
| Runtime | `services/runtime.js` | 需要平台适配 | `createRuntime(storage)` 可测。无参 `getRuntime()` 创建 `createWxStorage()`，iOS 禁止。 |
| Catalog | `services/catalog.js` | **不能复用** | `seedLegacyLightsIfEmpty` 在空库写入 `generateMockLights()`。iOS 空库必须保持空。 |
| Nearby | `services/nearby-service.js` | 不能复用 | 微信附近/递灯演示，不是家庭成员体系。 |
| 音频状态机 | `services/audio-player-state.js` | 可直接复用语义 | 播放/暂停/不可用。无 `wx`。 |
| 音频控制器 | `services/audio-playback-controller.js` | 需要平台适配 | 会话隔离规则可学；实现绑 `InnerAudioContext`。 |

## 4. Projection

| 模块 | 路径 | 判定 | 理由 |
| --- | --- | --- | --- |
| 详情投影 | `projections/moment-detail-projection.js` | 需要平台适配 | 纯函数：缺失 Asset 保留 id 与类型，不删 Moment。`SOURCE_LABELS` 仍是「点亮/微光」，iOS 展示层应映射为设计规范用语，**不得改领域 origin**。 |
| 历史日历过滤 | `projections/vault-projection.js` 的 `isSameCalendarDay/Month/Year` 用法 | 需要平台适配 | 日历边界可复用。`arrangedLights` 的随机 x/y、`点亮了 N 个瞬间` 文案、Tabs 日/月/年 **不能**作为 iOS 回看 UI。 |
| 光墙 / 衰减 | `projections/light-wall-projection.js`、`visual-decay.js` | 不能复用 | 光点视觉与呼吸，与「时间中的生活版面」冲突。 |

## 5. 页面与工具（全部不能复用 UI）

| 模块 | 路径 | 判定 | 理由 |
| --- | --- | --- | --- |
| 首页/记录/光罐/附近/详情页 | `pages/**` | 不能复用 | WXML/WXSS/`wx.navigateTo` / `wx.chooseMedia` / `wx.getRecorderManager`。 |
| Mock lights | `utils/mock-lights.js` | 不能复用 | 空库假数据。 |
| 微信存储工具 | `utils/storage.js` | 不能复用 | 直接 `wx.getStorageSync`。 |

## 6. 规格与测试（作为验收真相，不是可执行 iOS 代码）

| 路径 | 用途 |
| --- | --- |
| `spec/moment-domain-model.md` | 聚合边界 |
| `spec/moment-invariants.md` | 不变量 |
| `spec/moment-lifecycle.md` | 状态机；递灯不是送达 |
| `spec/moment-storage-and-migration.md` | 微信 Key 与保全；iOS 不得改这些 Key |
| `spec/moment-detail.md` | 只读详情、精确 id |
| `spec/moment-test-matrix.md` | 测试矩阵 |
| `test/moment-commands.test.js` | 激活、时间精度、隔离 |
| `test/moment-detail-service.test.js` | 找不到不回退、损坏不覆盖 |
| `test/repository-data-preservation.test.js` | 保全 |
| `test/pass-moment.test.js` | 精确 id、幂等 Transmission |
| `test/record-clock.test.js` | 一次写入一个 clock |
| `test/moment-detail-projection.test.js` | 缺失媒体类型、不把音频当照片 |

## 7. 产品规范与领域之间必须写明的缺口

对照 `apps/ios/spec/LAMPY_APP_PRODUCT_DESIGN_GUIDE.md`：

| 产品要求 | 仓库事实 |
| --- | --- |
| 最多 3 张图 | 领域 `attachAsset` 无上限；微信记录页只接 1 张。iOS 必须在 **application** 层强制 ≤3，并补测试。 |
| 最多 1 段音频 | 领域允许多个 audio id。产品限制放 application，不改领域命令语义。 |
| 家庭成员 / 真实送达 | 只有本地 Transmission 意图。无邀请、成员、网络接收。 |
| 音频从系统文件导入 | 现有记录页是现场录音。领域 Asset 可挂 `localUri`，但 **没有**已验证的「从文件导入音频」产品路径。 |
| 「当时的感受」词表 | `content.emotion` 是自由字符串。未知旧值必须原样安全显示。 |
| significance | 领域有字段，V1 页面未采集。iOS MVP 不实现。 |
| 空库 | 微信 `catalog` 会写入 mock。iOS 禁止。 |

## 8. iOS 脚手架现状（2026-09-24）

| 路径 | 状态 |
| --- | --- |
| `apps/ios/src/app/index.tsx` | 空壳文案，无 Moment、无 mock 列表 |
| `apps/ios/src/app/_layout.tsx` | Stack，无 Tabs |
| `apps/ios/src/{domain-adapters,application,infrastructure,projections,screens}` | 仅 README |
| `apps/ios/spec/LAMPY_APP_PRODUCT_DESIGN_GUIDE.md` | 产品基准 |

本轮不增加产品页面或通用 UI 组件。
