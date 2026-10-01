# 最近：照片显现（Photo Reveal）

> 范围：只改 `apps/ios/spec/recent-photo-reveal/` 与 spec 索引。**不写运行代码。不合并。**
> 基线：`origin/main` @ `b9a01440fbe790062d921753a5a8416cd3382705`（#54 merge）。从该 SHA 新开，不续写 #53 / #54 实现分支。
> 不改 `apps/ios/src`、React Native、动画实现、图片组件、数据模型、ViewModel、路由。
> 不引入新的视觉组件体系。不改现有设计 token。不定义颜色或字体。
> 家庭和 AI 仍关。不改 Moment、Asset、保存、草稿、播放器、回看逻辑、本机保护。

原则：[`design-principles.md`](./design-principles.md)。状态：[`interaction-states.md`](./interaction-states.md)。未来实现验收：[`verification-plan.md`](./verification-plan.md)。

静态稿不是运行证据。本 PR 全部页面项 **NOT VERIFIED**。

---

## 0. 基线核对（2026-10-02）

| 对象 | 状态 | SHA |
| --- | --- | --- |
| `origin/main` | #54 已合 | `b9a01440fbe790062d921753a5a8416cd3382705` |
| 本分支 | `ios/recent-photo-reveal`（PR #55 OPEN）从上述 SHA 新开 | 本 PR |

#54 已把「最近」从生活记录列表收成**最近留下的生活阅读入口**。一条记录的阅读顺序是：

文字 → 照片 → 声音 → 感受

下一阶段要优化照片**进入阅读**时的感觉。本 PR **只冻结设计语言**，不实现。

---

## 1. 产品定位

「最近」不是：

- Timeline
- 媒体列表
- 社交 Feed

照片不是附件。

照片是生活片段里的**停顿**：读完字之后，目光落到当时留下的画面。

---

## 2. 定义

**Photo Reveal（照片显现）**

> 照片随着阅读节奏自然显现。

它不是：

- 图片加载动画
- 卡片出现动画
- 营销页滚动效果

用户在读自己的生活时，照片应当像**记忆被重新注意到**，而不是一个 UI 元素被展示出来。

---

## 3. 本 PR 输出

新增：

- `apps/ios/spec/recent-photo-reveal/README.md`
- `apps/ios/spec/recent-photo-reveal/design-principles.md`
- `apps/ios/spec/recent-photo-reveal/interaction-states.md`
- `apps/ios/spec/recent-photo-reveal/verification-plan.md`

索引：`apps/ios/spec/README.md` 增加本目录一行。

---

## 4. 设计决策摘要

| 决策 | 采用 | 禁止 |
| --- | --- | --- |
| 是什么 | 阅读时被重新注意到 | 加载完成、卡片入场、营销滚动 |
| 力度 | 轻、克制、一次性 | scale / bounce / spring / 展开 / 飞入 / blur / parallax / 自动播 |
| 初态 | 照片已在，未完全被注意（约 0.85） | 从完全透明突然出现 |
| 推荐动效 | opacity 0.85→1，translateY 8pt→0，600–800ms，ease-out | 另造一套视觉语言或 token |
| 触发 | 用户滚到、进入视口 | 页面加载自动播 |
| 多图 | 每张独立显现 | 一次播完全部 |
| 结束后 | `revealed` 保持，不重播 | 滚回再闪一次 |
| Reduce Motion | 直接 `revealed` | 仍播动画 |

---

## 5. 未实现（本 PR 明确不做）

- 任何 `apps/ios/src` 改动
- 视口检测、显现状态机、动画
- 图片组件、加载占位、失败 UI
- 显现状态持久化或跨进程恢复
- Jest / 模拟器 / 真机走查
- 回看、详情、留下页的同类效果
- 新组件体系、新 token、颜色、字体

现网照片仍按 #54 静态出现。本目录写成设计，**不等于**已上线。

---

## 6. 后续实现 PR 建议范围

另开实现 PR，从**当时的** `origin/main` 新开，不要叠在本分支或 #53。

**只做「最近」Presentation 上的照片显现。**

| 做 | 不做 |
| --- | --- |
| Recent 已显示的照片进入视口后按本目录显现 | Moment / Asset / ViewModel / 路由 |
| `not-seen` → `revealing` → `revealed`；进程内返回保持 | 保存、草稿、播放器状态机 |
| 多图各张独立；缺失 / 失败不装成显现 | 回看、详情、留下的照片动效 |
| Reduce Motion 直接 `revealed` | 新视觉组件体系、改 token / 色 / 字 |
| 视口观察保持轻量，不拖播放器 | 页面加载时预播；从 opacity 0 弹出 |

实现 PR 保持 OPEN，按 [`verification-plan.md`](./verification-plan.md) 验收。本 spec PR 仍保持 OPEN，不随实现一起 squash。

---

## 7. 本 PR 不包含

- `apps/ios/src/**`
- React Native / 动画 / 图片组件
- 数据模型、ViewModel、路由
- TestFlight、夹具写入个人库
- 家庭入口、AI
