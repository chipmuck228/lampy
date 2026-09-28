# 生活回眸 · 只读输入与候选输出

阶段 A 契约。不是运行代码。实现必须按此裁剪，不能把整条 Moment JSON 或整个库交给模型。

---

## 1. 范围如何落位

与现行回看书页同一套规则（`occurredAt` + `occurredAtPrecision`，个人 `active`，本地 `ownerId`）：

| 用户选择 | 计入 | 不计入 |
| --- | --- | --- |
| 某年 Y | 该年 `exact` / `day` / `month` / `year` | `unknown`；其他年；家庭接收快照；草稿；已删 |
| 某年 Y 某月 M | 该月 `exact` / `day` / `month` | 该年 `year` 精度（月份未确认）；`unknown`；其他月；家庭；草稿；已删 |

`recordedAt` 不得冒充发生时间，也不得单独用来划回眸范围。

---

## 2. 只读输入

application 先在本机选好集合，再投影成模型行。投影之后**删除**路径、URI、账号、家庭字段。

### 2.1 一次请求

```ts
type MemoirModelRequest = {
  locale: 'zh-Hans';
  range: MemoirRange;
  coverage: MemoirCoverage;
  moments: MemoirModelMoment[]; // 仅本批实际送入的行
};

type MemoirRange =
  | { kind: 'year'; year: number }
  | { kind: 'month'; year: number; month: number };

type MemoirCoverage = {
  rangeTotal: number;          // 范围内个人 active 条数（含只有媒体的）
  textBearingTotal: number;    // 范围内 note trim 后非空
  analyzedCount: number;       // === moments.length
  analyzedIds: string[];
  omittedTextBearingCount: number; // textBearingTotal - analyzedCount
  mediaOnlyCount: number;
  feelingFilledCount: number;
  imageCount: number;
  imageMissingCount: number;
  audioCount: number;
  audioMissingCount: number;
};
```

`analyzedIds` 必须等于 `moments[].id`，且每条都在 `range` 内。`omittedTextBearingCount > 0` 时，任何输出句子都按「部分覆盖」校验。

### 2.2 每一条

```ts
type MemoirModelMoment = {
  id: string;                 // 精确 Moment ID
  revision: number;
  occurredAt?: string;        // 有则给 ISO；unknown 根本不应出现在年/月请求里
  occurredAtPrecision: 'exact' | 'day' | 'month' | 'year';
  note: string;               // 用户原文，可空（空行不应进入 moments[]）
  feeling: { value: string; known: boolean } | null; // 用户未填则为 null
  media: {
    imageCount: number;       // 0–3，含缺失
    imageMissingCount: number;
    audioCount: 0 | 1;
    audioDurationMs: number | null; // 仅声音存在且时长已知
    audioMissing: boolean;
    unknownMediaCount: number;
  };
};
```

`feeling.known` 对应现有 `projectFeeling`：词表内为 true，未知旧值为 false。未知旧值仍把 `value` 原样送入，**不得**改写成词表近义词，也不得在 `feeling === null` 时补一个猜测。

### 2.3 明确禁止进入模型的字段

| 禁止 | 现网对应 |
| --- | --- |
| 本机路径、`file://`、`ImageView.uri`、`AudioView.uri` | 详情/回看播放用，回眸不用 |
| 媒体字节、缩略图、波形 | 第一版不识图、不转写 |
| 家庭接收快照、邀请、成员、账号资料 | 家庭缓存 ≠ 个人 Moment |
| 整个 `moments` 表或未选年份 | 只送 `analyzedIds` |
| `content.significance` | 页面不采集，MVP 不做 |
| `context.people` / `context.place` / `tags` | iOS 留下页未作为产品字段采集；送进去会诱使关系断言 |
| `ownerId`、设备名、通讯录 | 无必要 |
| 日志里的正文 | 现有规范已禁止记私人正文 |

确认页可以对用户显示「3 张照片、1 段 12 秒声音」，这些数字来自 `media` 计数，不是字节。

---

## 3. 候选输出

```ts
type MemoirCandidate = {
  range: MemoirRange;
  coverage: Pick<MemoirCoverage, 'analyzedIds' | 'analyzedCount' | 'omittedTextBearingCount' | 'textBearingTotal'>;
  segments: MemoirSegment[];
};

type MemoirSegmentKind = 'quote' | 'careful_summary' | 'undetermined';

type MemoirSegment = {
  kind: MemoirSegmentKind;
  text: string;          // 短中文。quote 应能在来源 note 中找到（允许空白差异）
  sourceIds: string[];   // 至少 1 个；必须 ⊆ analyzedIds
};
```

| kind | 何时用 | 文本约束 |
| --- | --- | --- |
| `quote` | 证据就是那一两句原文 | `text` 来自单一来源 `note` 的连续片段，不添加事实 |
| `careful_summary` | ≥2 条来源里有原文依据的线索 | 只陈述来源里写过的事；不补感受、不补空白日子 |
| `undetermined` | 来源互相矛盾或不够 | 写「这些记录没法确定……」，并仍挂上读过的 `sourceIds` |

照片和声音可以在**预览页**按其原 Moment 展示（走现有详情或书页摘录），不写进 `text` 当「图里是什么」「声音里说了什么」。

---

## 4. 校验器（确定性，先于预览）

整份候选要么通过，要么整份丢弃。不局部改写模型句子来「救」一次生成。

| 规则 | 拒绝条件 |
| --- | --- |
| ID 存在且在本批 | `sourceIds` 有不在 `analyzedIds` 的值 |
| 范围 | 该 ID 按 §1 不算在用户所选年/月 |
| 日期精度 | `text` 写出比来源 `occurredAtPrecision` 更细的日历（例如来源是 `month`，句子写「8月12日」；来源是 `year`，句子写某月某日） |
| 无依据专名 | `text` 出现的人物名、地点名、亲属/职场关系词，在该段所有 `sourceIds` 的 `note`（及已填 `feeling.value`）里都找不到原样子串 |
| 无依据感受 | 来源 `feeling === null`，句子写「你当时很难过 / 很幸福」等 |
| 空白即生活 | 句子把没有记录的日子写成「你没有生活 / 这一年很空」 |
| 部分覆盖全称 | `omittedTextBearingCount > 0` 或用户选年但只分析了子集，却出现「这一年你的生活」「整年」「你一直」 |
| 媒体幻觉 | 句子描述照片内容或声音台词 |
| 空来源 | `sourceIds` 为空，或 `text` 为空 |
| quote 不在原文 | `kind === 'quote'` 且规范化后的 `text` 不是该来源 `note` 的子串 |

「专名 / 关系词」第一版用词表 + 来源子串，不调用第二个模型。词表至少包括：爸爸、妈妈、父亲、母亲、老公、老婆、丈夫、妻子、儿子、女儿、孩子、同事、老板、朋友、家里、公司，以及样本里出现的具体姓名/地名。复审可增列，不能减到零。

日期：只允许复述来源已写在 `note` 里的日期词，或按精度格式化的发生日（`day`/`exact` →「8月12日」；`month` →「8月」；`year` →「2023年」）。不得把 `recordedAt` 写成发生日。

---

## 5. 衍生物

```ts
type MemoirRecord = {
  id: string;                 // memoir_…
  createdAt: string;
  range: MemoirRange;
  sourceRevisions: { id: string; revision: number }[];
  candidate: MemoirCandidate; // 已通过校验的副本
};
```

- 保存与删除只动这份记录
- 不 `UPDATE` Moment / Asset / emotion
- 再生成 = 新衍生物，或先删后写；不覆盖原 Moment
- 打开预览时若某 `sourceId` 已不存在：该段来源键失败，文案「这条已经不在」，其余仍在
- 若存在但 `revision` 不同：来源键标「后来改过」，不自动重跑

阶段 C 才建表。本文件不指定 SQL 列名以外的实现。
