# 导航实现走查 · iPhone 16 模拟器

基线：`origin/main` @ `4466b0d`（#33 merge）。实现分支 `ios/navigation-band`（#34）。
机型：iPhone 16 · iOS 18.6 · `app.lampy.ios` Dev Client · Metro :8081。
本机 `.env` 有家庭 API 时底带为四项；三项画面是临时关掉 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 后重载拍的，拍完已恢复。

Jest 证明调用了 `back` / `dismissTo`，**不等于**原生栈已打印。未打印 Expo Router 栈。

## 底带排版

三项、四项都铺满安全区可用宽度，每项一列，文字在列中居中。当前处是非按钮文字，「留下」仍是动作（字号更大）。没有用 `gap` 把词堆在左边。

| 画面 | 文件 | 模拟器 |
| --- | --- | --- |
| 最近 · 四项（最近 / 回看 / 留下 / 家庭） | `shots/iphone16-band-4-recent.png` | **PASS** |
| 回看根 · 四项（回看 / 最近 / 留下 / 家庭） | `shots/iphone16-band-4-lookback.png` | **PASS** |
| 最近 · 三项（无家庭） | `shots/iphone16-band-3-recent.png` | **PASS** |
| 回看根 · 三项（无家庭） | `shots/iphone16-band-3-lookback.png` | **PASS** |

左右边距对称；列中心均分；带在 Home Indicator 之上。滚动区高度未用尺子量。大字号纵排、横屏、iPad 原生页：**NOT VERIFIED**。iPad 左栏仅 Jest：rail `112` + 滚动区 `flex: 1; minWidth: 0`。

## 路由序列

| 序列 | 模拟器 | Jest | 说明 |
| --- | --- | --- | --- |
| 甲 最近 → 回看 → 最近 → 再回看 | **PASS** | — | 保留 `jia-*`。未打印栈 |
| 乙 热深链 `lampy://lookback` → 「最近」 | **PASS** | — | 保留 `yi-dismiss-recent` |
| 乙′ `?from=recent` → 「最近」 | **PASS** | **PASS** | 保留 `yi-spoof-dismiss` |
| 乙″ `lampy://lookback?o=invalid`（上一页是 `index`） | **PASS** | **PASS** | `o-invalid-land` → `o-invalid-after` 落到最近。未打印栈；`[/, lookback]` 上 `back` 与 `dismissTo` 画面相同 |
| 丙 最近 → 回看 → 留下 → 保存 → 再按返回 | **PASS** | **PASS**（调用 `dismissTo`） | 保留 `bing-*`。未打印栈 |
| 进程冷启动 / 栈无 `/` 的回看 → 留下 → 保存 | **NOT VERIFIED** | — | `terminate` 后 `lampy://lookback` 落在 Expo Dev Client 启动器（`cold-lookback`），没有进到回看根 |

## 末项

用 App「留下」录了一段声音并再写一句，形成同日两条。列表新→旧，当天最后一条是「Same day voice」。

| 项 | 模拟器 | 说明 |
| --- | --- | --- |
| 当天末条「播放」与「看这条」完整露出，停在带上沿，带不盖住 | **PASS** | `last-item-end` / `last-item-play` |
| 点「播放」看到暂停/进度 | **NOT VERIFIED** | 控件在带上方可点，点后画面仍是「播放」 |
| 整表最底「门口的风」的播放 | **NOT VERIFIED** | 最旧一条无声音；不能改库 |

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --no-coverage` | **PASS**（83 suites / 481 tests） |
| 本轮文件 `npx eslint` | **PASS** |
| `npx expo lint`（全量） | **FAIL**（既有 `leave.tsx:121`、`share/[id].tsx` 的 `set-state-in-effect`） |
| `git diff --check` | **PASS** |
