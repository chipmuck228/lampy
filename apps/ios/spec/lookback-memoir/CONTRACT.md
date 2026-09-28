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

application 在本机按 §1 选定个人 Moment 之后，**按白名单逐字段构造** `MemoirModelMoment`。不得先投影整条 Moment / `HistoryMomentItem` 再删除字段。路径、URI、账号、家庭、`significance`、`context`、`ownerId` 从未赋给请求对象。

阶段 C 用测试锁死：序列化后的请求 JSON 键 ⊆ 白名单；断言不含 `uri`、`path`、`file://`、`ownerId`、家庭字段。本文件只改契约，不在本 PR 写这些测试。

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

### 2.3 白名单（仅这些键可以出现在模型请求里）

`MemoirModelRequest`：`locale`、`range`、`coverage`、`moments`  
`MemoirRange`：`kind`、`year`、以及月范围的 `month`  
`MemoirCoverage`：§2.1 所列计数与 `analyzedIds`  
`MemoirModelMoment`：`id`、`revision`、`occurredAt`、`occurredAtPrecision`、`note`、`feeling`、`media`  
`media`：`imageCount`、`imageMissingCount`、`audioCount`、`audioDurationMs`、`audioMissing`、`unknownMediaCount`  
`feeling`：`value`、`known`（仅当用户已填感受）

未列即禁止。尤其不得出现：本机路径、`file://`、`uri`、媒体字节、家庭接收/邀请/账号、`significance`、`context.people` / `place` / `tags`、`ownerId`、`assetIds`、整个 `moments` 表。

确认页可以对用户显示「3 张照片、1 段 12 秒声音」，数字来自 `media` 计数，不是字节。

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
| `quote` | **第一版只使用这种。** 证据就是那一两句原文 | `text` 来自单一来源 `note` 的连续片段，不添加事实。预览按来源时间排列这些摘录 |
| `careful_summary` | 以后若要做自由归纳 | 机器**不能**验真情节是否被拼凑。不得声称已自动验证 |
| `undetermined` | 以后若要做「无法确定」 | 同样不能靠校验器证明语义正确 |

第一版若不能可靠约束自由归纳：**只产出原文摘录 + 来源排列**。不要宣称已自动验真。`careful_summary` / `undetermined` 留在类型里是为了以后，阶段 C 第一版不得把它们当已验收能力。

照片和声音可以在**预览页**按其原 Moment 展示（走现有详情或书页摘录），不写进 `text` 当「图里是什么」「声音里说了什么」。

---

## 4. 校验器：机器能拒的，和只能人审的

整份候选要么通过机器规则，要么整份丢弃，不局部改写句子。**通过机器校验 ≠ 语义为真，≠ 自动保存。**

### 4.1 机器可确定拒绝

这些规则有明确谓词，阶段 C 必须用测试锁死。

| 规则 | 拒绝条件 |
| --- | --- |
| ID 在本批 | `sourceIds` 有不在 `analyzedIds` 的值 |
| 范围 | 该 ID 按 §1 不算在用户所选年/月 |
| 空来源或空文 | `sourceIds` 为空，或 `text` 为空 |
| quote 不在原文 | `kind === 'quote'` 且去掉首尾空白后的 `text` 不是该唯一来源 `note` 的子串 |
| 第一版种类 | 第一版出现 `careful_summary` 或 `undetermined` |
| 部分覆盖禁用词 | `omittedTextBearingCount > 0` 且 `text` 含「这一年你的生活」「整年」「你一直」 |

`quote` 既是原文子串，就不再用机器去解析其中的日期或专名。

### 4.2 只能由人审阅（机器不得标 PASS，也不得标「已拒绝」充数）

现有「专名词表 + 来源子串」**不能**识别把两条原文拼成新情节的句子（例如「在家和同事开了一下午会」：子串都能在某条里找到，组合却是新事实）。

有感受字段也**不能**证明「你很幸福」是用户原意：空感受时禁几个词只是弱启发式；已填「平静」时改写成「幸福」，机器无法验真。

下列错误留给人读。样本里标「人审」，不写进校验器必拒表：

- 把多条记录合成一条同时成立的情节
- 改写或升级感受（幸福、热爱、很难过……）
- 把没有记录的日子写成生活空白
- 描述照片内容或声音台词（没有稳定谓词）
- 写出比精度更细、且不像简单禁用词的日期断言
- 专名 / 关系是否「真的有依据」

以后若做自由归纳，必须继续当人审，不得宣称自动验真。第一版用原文摘录避开这类错误，而不是假装校验器已经抓住它们。

---

## 5. 预览不是保存

机器校验通过之后只进入**临时预览**。此时还没有衍生物。

- 用户必须再点「保留这份回眸」，才写入 `MemoirRecord`
- 取消、返回、离开预览、杀进程：不留下衍生物
- 未保留之前没有「删除回眸」；那只作用于已经保留的份
- 原始 Moment / Asset / emotion 始终不变，不因预览、保留或删除回眸而 `UPDATE`

```ts
type MemoirRecord = {
  id: string;                 // memoir_…  仅在用户保留之后存在
  createdAt: string;
  range: MemoirRange;
  sourceRevisions: { id: string; revision: number }[];
  candidate: MemoirCandidate;
};
```

- 保留与删除只动这份记录
- 再生成 = 先回到未保存的预览；不覆盖原 Moment
- 打开**已保留**的回眸时，若某 `sourceId` 已不存在：该段来源键失败，文案「这条已经不在」
- 若存在但 `revision` 不同：来源键标「后来改过」，不自动重跑

阶段 C 才建表。本文件不指定 SQL 列名以外的实现。
