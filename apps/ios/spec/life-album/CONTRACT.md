# 生活册 · 数据、来源与导出

阶段 A 契约。不是运行代码。生活册独立于 Moment 聚合，只引用精确 `momentId`。

---

## 1. 三层对象

| 层 | 名称 | 可变 | 作用 |
| --- | --- | --- | --- |
| 1 | 编辑中的册 `LifeAlbum` | 是 | 用户正在做的册：名称、封面、开篇、收入顺序 |
| 2 | 分页结果 `AlbumLayout` | 派生 | 对当前册 + 当前可读 Moment 测完的页。预览与日后 PDF 共用这一份 |
| 3 | 导出快照 `AlbumExport` | 冻结 | 用户确认导出的那一次：内容、顺序、排版版本、当时可读的媒体字节 |

不要在阶段 A 决定「收集时复制整个个人库或全部媒体」。推荐：**收集只存引用**；导出当时才把该次需要的媒体打进快照。

---

## 2. 编辑中的册

```ts
type LifeAlbumId = string; // 稳定身份，不复用 Moment id

type LifeAlbum = {
  id: LifeAlbumId;
  schemaVersion: 1;
  name: string;                 // 默认「一些日子」
  opening?: string | null;      // 用户自写开篇。空则无开篇页
  cover: AlbumCover;
  entries: AlbumEntry[];        // 顺序即成册顺序；同一 momentId 至多一次
  createdAt: string;
  updatedAt: string;
};

type AlbumCover =
  | { kind: 'words' }
  | { kind: 'image'; momentId: string; assetId: string };

type AlbumEntry = {
  momentId: string;
  collectedAt: string;
  sourceRevisionAtCollect: number; // 收下时的 revision，供「后来改过」
};
```

- `entries` 是唯一收藏真相。禁止第二份「勾选数据库」。
- 封面图必须仍在该册 `entries` 里，且 Asset 仍是图。移出该条则封面回 `words`。
- 不存分类、标签、AI 摘要、模板 id。

建议本机表（阶段 B）：`life_albums`、`life_album_entries`。不进 `moments` / `assets`，不进微信 Key，不进领域 `Collection` 桩。

---

## 3. 分页结果

`AlbumLayout` 是**已测完的画稿**，不是待排素材。预览和 PDF 是两个渲染器，必须读同一份 JSON，把每一块画进记录的框，用记录的字体和断点。禁止任一端再测一遍、再换行、再缩放图。

```ts
type AlbumLayout = {
  albumId: LifeAlbumId;
  layoutVersion: string;        // 如 'album-a5-v2'；版本变了必须整份重排
  pageSize: { widthPt: number; heightPt: number }; // 420 × 595
  fonts: AlbumFontSpec;
  sourceFingerprint: AlbumSourceFingerprint;
  albumUpdatedAt: string;
  generatedAt: string;
  pages: AlbumPage[];
};

type AlbumFontSpec = {
  coverName: { family: 'album-serif'; sizePt: 28; lineHeightPt: 36; color: '#25231F' };
  body: { family: 'album-serif'; sizePt: 17; lineHeightPt: 32; color: '#25231F' };
  date: { family: 'album-ui'; sizePt: 15; lineHeightPt: 22; color: '#53604F' };
  meta: { family: 'album-ui'; sizePt: 15; lineHeightPt: 22; color: '#5C5851' };
};

/** 生成时所见的册与来源。任一字段与现况不同，预览缓存作废。 */
type AlbumSourceFingerprint = {
  name: string;
  opening: string | null;
  cover: AlbumCover;
  entryOrder: string[];         // momentId 顺序
  moments: {
    momentId: string;
    revision: number;
    media: { assetId: string; role: 'image' | 'audio' | 'unknown'; available: boolean }[];
  }[];
};

type AlbumBox = { xPt: number; yPt: number; widthPt: number; heightPt: number };

type AlbumPage = {
  index: number;                // 0 = 封面
  blocks: AlbumPlacedBlock[];
};

type AlbumPlacedBlock = AlbumBlock & {
  box: AlbumBox;                // 页内绝对坐标，原点为页左上
};

type AlbumBlock =
  | { kind: 'cover-name'; albumId: string; text: string }
  | { kind: 'cover-image'; albumId: string; momentId: string; assetId: string; status: 'available' | 'missing' }
  | { kind: 'opening'; albumId: string; text: string; textRange: { start: number; end: number } }
  | { kind: 'day-rule'; momentId: string; dateKey: string; text: string }
  | {
      kind: 'note';
      momentId: string;
      revision: number;
      textRange: { start: number; end: number }; // 原文 Unicode 码位 [start, end)
    }
  | {
      kind: 'image';
      momentId: string;
      assetId: string;
      status: 'available' | 'missing';
      intrinsicRatio: number | null; // 宽/高；missing 可空
    }
  | { kind: 'audio'; momentId: string; assetId: string; status: 'available' | 'missing'; durationMs: number | null }
  | { kind: 'unknown-media'; momentId: string; label: string }
  | { kind: 'feeling'; momentId: string; value: string; known: boolean }
  | { kind: 'recorded-at'; momentId: string; label: string }
  | { kind: 'source-changed'; momentId: string }
  | { kind: 'source-gone'; momentId: string }
  | { kind: 'close'; text: string };
```

约束：

- `textRange` 是分页器按**真实字体测量**切出的原文片段 `[start, end)`，不是「第几行到第几行」。预览和 PDF 不得各自按行宽再排一遍。阶段 C 必须用同一对字面实测，并对照两份渲染，证明同版；静态 HTML 样本不能代替这次探测。若以后要做「照片优先」版式，须另写规则，第一版不采用。
- 图框 `box` 已含原比例算出的宽高；渲染器只缩放进这个框，不改比例、不裁切。
- `album-serif` / `album-ui` 的具体字面在阶段 C 钉死（系统中文衬线 + 现网 UI 字体）。预览与 PDF 必须映射到**同一对**字面。
- 封面图与正文图可以是同一个 `assetId`（复用）。正文里该 `assetId` 仍只出现一次。
- 不把 layout 当用户编辑稿。册一改，旧 layout 整份作废。

### 3.1 预览缓存何时作废

打开预览前比较现况与 `sourceFingerprint` + `layoutVersion`。下列任一不同，丢掉缓存并重排：

- 册名、开篇、封面、收入顺序
- 任一 `momentId` 的 `revision`
- 任一 Asset 的 `available`（可读 ↔ 缺失）
- 条目增减
- `layoutVersion` 升级

### 3.2 导出过程中来源变化

1. 开始导出时读取并冻结指纹 `F0`，只用 `F0` 对应的那一份 layout。
2. 写文件前再读一遍来源。若不等于 `F0`：**整次失败或整次重试**，不得把旧页和新来源拼进同一份 PDF。
3. 重试则重新读取、重新排（或确认指纹未变后沿用新的一致 layout），再写。
4. 失败文案：「排的时候记录有变动，这一次没有导出。」临时文件删掉。
5. 已 `ready` 的旧导出仍不动。

---

## 4. 导出快照

```ts
type AlbumExport = {
  id: string;
  albumId: LifeAlbumId;
  layoutVersion: string;
  name: string;
  opening: string | null;
  entries: { momentId: string; revision: number }[];
  pages: AlbumPage[];           // 导出当时冻结的分页
  media: AlbumExportMedia[];    // 该次实际打入的文件，可空（字册）
  createdAt: string;
  file?: { path: string; mime: string } | null;
  status: 'preparing' | 'ready' | 'failed' | 'cleared';
};

type AlbumExportMedia = {
  momentId: string;
  assetId: string;
  bytesId: string;              // 快照目录内的副本，不是 Moment 的 localUri
  role: 'image' | 'audio';
};
```

原记录之后改变，**不得**悄悄改写已 `ready` 的导出文件。要更新只能再导出一次。

---

## 5. 来源变化（推荐方案）

| 事件 | 编辑中的册 | 分页 / 预览 | 已导出文件 |
| --- | --- | --- | --- |
| Moment 改字/图/声（revision +1） | 引用保留。可标「后来改过」 | 按**当前**可读内容重排 | 不动 |
| Moment 删除 / 找不到 | 引用保留为缺口，不自动丢掉 id | 「这条已经不在。」不补别条，不从隐藏副本复活 | 不动 |
| Asset 缺失 | 条目仍在 | 该媒介块 `missing`，可见说明 | 不动 |
| 改册名 / 开篇 / 封面 / 顺序 / 移出 | 立即保存 | 作废旧 layout | 已导出不动 |
| 删册 | 删册与条目。可选清该册 `preparing`/`failed` 临时文件与用户确认后的本机导出 | — | App 内文件按用户确认删除；**已分享到 App 外的无法撤回** |
| 导出中来源变化 | 见 §3.2：与开始时的指纹不一致则整次重试或失败，禁止混版 | 旧预览若指纹已变则作废 | 不写半份、不混两个 revision |
| 取消 / 失败 | 册不动 | 旧预览可留 | 删除本次临时文件，不留半份 PDF |
| 用户排除某张图 | 阶段 B 第一版**不做**逐资源排除。整条移出，或整条收入。若复审要排除单张，须另开切片并写进 layout | — | — |

**删除原记录的保留边界：** 收集阶段不静默复制私人正文和媒体。因此删掉 Moment 后，预览不能再看见原文。已经导出的那一份可以仍含当时打入的内容——那是用户主动导出的结果，须在导出说明里写清。禁止为了「删了还能在册里看」而在收集时做一份永不清理的私拷。

---

## 6. 隐私与本机保护

- 个人功能离线、本机完成。不上传册内容，不分析图片或声音。
- 家庭接收快照不是个人 Moment，不得收入生活册。
- 应用生成的预览缓存、分页临时文件、导出临时文件都是私人内容，受本机保护约束：保护开启且未解锁时不展示预览页、不露文件名里的正文。
- 用户主动导出后，文件可能进入「文件」、分享表或别人的设备。须在第一次导出前用短句说明，例如：「导出会生成一份文件。它不再只待在 Lampy 里，Lampy 也不能从别人的设备收回。」
- 基础备份（系统备份是否包含应用容器）与付费生活册导出分开讲。前者已在「记录与存储」；后者是可选成品，不是备份。

---

## 7. 导出技术范围（比较，不新增依赖）

后续第一版优先 PDF。阶段 A **不**加入 `expo-print`、PDF kit、StoreKit、云。

| 路径 | 优点 | 风险 | 本轮结论 |
| --- | --- | --- | --- |
| WebView / HTML → 系统打印 PDF | 少依赖；中文靠系统字体 | 打印分页可能与预览测量不一致；嵌入字体不稳 | 可作阶段 C 对照，不能当唯一真相 |
| 自绘 + 原生 PDF（Core Graphics 等） | 与测量同一套坐标 | 要 Development Build 探针；中文嵌入、图片内存 | **推荐作为 D 的主路径**，先做 C 探测 |
| 栅格整页图再装 PDF | 分页一致 | 体积大、字不能选、内存 | 仅当嵌入字体失败时的退路 |
| 完整原声离线包 | 能听 | 手机 PDF 阅读器不保证能播嵌入声 | **不承诺** PDF 内嵌声音可播。原声包另探，不靠云端二维码长期保存 |
| 分享 | `UIActivityViewHolder` / 以后的 `expo-sharing` | 需探测权限与临时 URL 生命周期 | 阶段 D。失败须清临时文件 |

阶段 C 必须探测（隔离夹具，不碰 Liuz17）：

1. 中文换行与系统字体度量是否等于预览
2. 中文字体能否嵌入 PDF，文件多大
3. 三张大图 + 长文的内存峰值
4. 离线生成、取消、失败后临时文件是否还在
5. 分享表取消是否留下可读残片
6. 本机保护开启时预览与临时目录是否被遮挡

---

## 8. 与家庭分享快照的区别

| | 生活册导出 | 家庭 F3 分享 |
| --- | --- | --- |
| 谁决定 | 用户把多条收成一册再导出 | 用户把**一条**分享到家里 |
| 存在哪 | 本机文件 | 家庭服务（入口现关） |
| 改原件 | 已导出不动 | 已分享 revision 不动 |
| 媒体 | 导出时打入副本 | 上传对象，不传本机路径 |

两套快照不得共用一张表、一个「已分享」标记。
