# 导航实现走查

实现分支 `ios/navigation-band`（#34）。base：`origin/main` @ `4466b0d`（#33 merge）。
走查 head：`e08c402`（按可用宽与文字选一行 / 2×2 / 纵排）。

## 真机 · 末条不被底带挡住

操作者：Liuz17。机型：iPhone 17 Pro。系统：iOS 26.2。字号：最大。
安装构建 SHA：`e08c402a707fd5453a88fbedec8969baaa374a0e`。

向下滑过「一段声音 · 5秒」之后，完整看到并点到播放与「看这条」。实际听到声音，播放状态正常。

| 项 | 结果 |
| --- | --- |
| 末条操作被底带遮挡 | **PASS**（真机，见上） |
| 横屏 | **NOT VERIFIED** |
| iPad | **NOT VERIFIED** |
| VoiceOver | **NOT VERIFIED** |

这不是 iPhone 16 模拟器 AX XXXL 截图。那张图里阅读区文字碎成笔画，只记为模拟器观察，见下。

## 模拟器 · iPhone 16 · iOS 18.6

本机 `.env` 有家庭 API 时底带为四项；三项画面是临时关掉 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 后重载拍的，拍完已恢复。

Jest 证明调用了 `back` / `dismissTo`，**不等于**原生栈已打印。无 `/` 路径已用 Release 打印根栈。

### 底带排版

按可用宽度（窗宽 − 32）和标签实测宽度选排布，不因 `fontScale >= 1.3` 直接占满三行。当前处是非按钮文字，「留下」仍是动作（字号更大）。不裁字、不缩小系统字。每项触达 ≥48。

| 规则 | 何时 |
| --- | --- |
| 一行均分 | 每列 ≥ `max(48, 文字宽 + 8)` |
| 有意 2×2 | 四项一行放不下，但半宽仍够；顺序 最近 / 回看 / 留下 / 家庭（回看根则 回看 / 最近 / 留下 / 家庭） |
| 单列纵排 | 2×2 也放不下放大后的字；三项同样按实测，没有 2×2 |

| 画面 | 文件 | 结果 |
| --- | --- | --- |
| 最近 · 四项一行 | `shots/iphone16-band-4-recent.png` | **PASS** |
| 回看根 · 四项一行 | `shots/iphone16-band-4-lookback.png` | **PASS** |
| 最近 · 三项一行 | `shots/iphone16-band-3-recent.png` | **PASS** |
| 回看根 · 三项一行 | `shots/iphone16-band-3-lookback.png` | **PASS** |
| XXXL · 四项仍一行 | `shots/iphone16-band-4-xxxl-row.png` | **PASS** |
| AX XXXL · 四项 2×2 | `shots/iphone16-band-4-axxxxl-grid.png` | **PASS**（底带 2×2 完整。阅读区笔画碎开是模拟器观察，不是真机结果） |
| `fontScale` 1.3 三项仍一行 | — | **PASS**（Jest） |
| 2×2 仍不够才纵排 | — | **PASS**（Jest · 200pt × 3.1） |

iPad 左栏仅 Jest：rail `112` + 滚动区 `flex: 1; minWidth: 0`。

### 路由序列

| 序列 | 模拟器 | Jest | 说明 |
| --- | --- | --- | --- |
| 甲 最近 → 回看 → 最近 → 再回看 | **PASS** | — | 保留 `jia-*` |
| 乙 热深链 `lampy://lookback` → 「最近」 | **PASS** | — | 保留 `yi-dismiss-recent` |
| 乙′ `?from=recent` → 「最近」 | **PASS** | **PASS** | 保留 `yi-spoof-dismiss` |
| 乙″ `lampy://lookback?o=invalid`（上一页是 `index`） | **PASS** | **PASS** | `o-invalid-land` → `o-invalid-after` |
| 丙 最近 → 回看 → 留下 → 保存 → 再按返回 | **PASS** | **PASS**（调用 `dismissTo`） | 保留 `bing-*` |
| 栈无 `/`：冷启动回看 → 留下 → 保存 → 再返回 | **PASS** | — | Release 已打印栈。不再追 Dev Client 启动器 |

### 栈里没有 `/`

Release 安装构建：`npx expo run:ios --configuration Release`，再 `terminate` + `lampy://lookback`。打印见 `shots/nav-stack-no-root.jsonl`：

1. 冷启动回看：`["lookback/index"]`，没有 `/`。`iphone16-release-cold-lookback.png`
2. 回看根留下并保存：落到最近，新记录在 9/28 最前。`iphone16-no-root-after-save.png`
3. 保存后：`["lookback/index", "index"]`。符合 #33：`dismissTo('/')` 换掉留下，回看根留在下面
4. 再滑返回：fade 未弹出，停在最近，没有回到留下

### 末项（模拟器补充）

列表新→旧。与真机「一段声音 · 5秒」不是同一条记录。

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 当天最后一条「播放」与「看这条」露出 | **PASS** | `last-item-end` / `last-item-play`。9/28「Same day voice」 |
| 整表最底「门口的风」的播放 | **NOT VERIFIED** | 最旧一条无声音；不能改库 |

## 命令（合并前）

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --no-coverage` | **PASS**（83 suites / 485 tests） |
| 本轮文件 `npx eslint` | **PASS** |
| `npx expo lint`（全量） | **FAIL**（既有 `leave.tsx:121`、`share/[id].tsx` 的 `set-state-in-effect`；`origin/main` 已有，#34 未引入） |
| `git diff --check` | **PASS** |
