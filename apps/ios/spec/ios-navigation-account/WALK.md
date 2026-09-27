# 导航实现走查 · iPhone 16 模拟器

基线：`origin/main` @ `4466b0d`（#33 merge）。实现分支 `ios/navigation-band`（#34）。
机型：iPhone 16 · iOS 18.6。
本机 `.env` 有家庭 API 时底带为四项；三项画面是临时关掉 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 后重载拍的，拍完已恢复。

Jest 证明调用了 `back` / `dismissTo`，**不等于**原生栈已打印。无 `/` 路径已用 Release 安装构建打印 Expo Router 根栈（见下）。

## 底带排版

三项、四项都铺满安全区可用宽度，每项一列，文字在列中居中。当前处是非按钮文字，「留下」仍是动作（字号更大）。没有用 `gap` 把词堆在左边。

| 画面 | 文件 | 模拟器 |
| --- | --- | --- |
| 最近 · 四项（最近 / 回看 / 留下 / 家庭） | `shots/iphone16-band-4-recent.png` | **PASS** |
| 回看根 · 四项（回看 / 最近 / 留下 / 家庭） | `shots/iphone16-band-4-lookback.png` | **PASS** |
| 最近 · 三项（无家庭） | `shots/iphone16-band-3-recent.png` | **PASS** |
| 回看根 · 三项（无家庭） | `shots/iphone16-band-3-lookback.png` | **PASS** |

左右边距对称；列中心均分；带在 Home Indicator 之上。滚动区高度未用尺子量。大字号纵排、横屏、iPad 原生页、VoiceOver、XXXL：**NOT VERIFIED**。iPad 左栏仅 Jest：rail `112` + 滚动区 `flex: 1; minWidth: 0`。

## 路由序列

| 序列 | 模拟器 | Jest | 说明 |
| --- | --- | --- | --- |
| 甲 最近 → 回看 → 最近 → 再回看 | **PASS** | — | 保留 `jia-*`。未打印栈 |
| 乙 热深链 `lampy://lookback` → 「最近」 | **PASS** | — | 保留 `yi-dismiss-recent` |
| 乙′ `?from=recent` → 「最近」 | **PASS** | **PASS** | 保留 `yi-spoof-dismiss` |
| 乙″ `lampy://lookback?o=invalid`（上一页是 `index`） | **PASS** | **PASS** | `o-invalid-land` → `o-invalid-after` 落到最近。未打印栈；`[/, lookback]` 上 `back` 与 `dismissTo` 画面相同 |
| 丙 最近 → 回看 → 留下 → 保存 → 再按返回 | **PASS** | **PASS**（调用 `dismissTo`） | 保留 `bing-*`。未打印栈 |
| 栈无 `/`：冷启动回看 → 留下 → 保存 → 再返回 | **PASS**（栈已打印） | — | 见下一节。Dev Client **不能**建这条栈 |

## 栈里没有 `/`

Dev Client 启动器挡冷深链。下列命令都进不到 JS 回看根（不要把热深链或 Jest 算成这条）：

| 命令 | 落点 |
| --- | --- |
| `xcrun simctl terminate … app.lampy.ios` 然后 `openurl lampy://lookback` | Expo Dev Client 启动器（`iphone16-no-root-try1-lampy.png`）。Expo 文档：development build **不支持**用应用深链冷启动 |
| `openurl 'exp+lampy-ios://expo-development-client/?url=http://127.0.0.1:8081/--/lookback'` | 把 `--/lookback` 当成 Metro 包地址，报 Failed to load app（`iphone16-no-root-try2-expplus.png`） |
| `openurl 'exp://127.0.0.1:8081/--/lookback'` | 打开 Expo Go，版本不兼容（`iphone16-no-root-try3-exp.png`） |

能直接打开 `lampy://` 的安装构建：

```
npx expo run:ios --configuration Release --device 5A7769A7-45B7-4A6E-8C17-938F6618BD56
xcrun simctl terminate 5A7769A7-45B7-4A6E-8C17-938F6618BD56 app.lampy.ios
xcrun simctl openurl 5A7769A7-45B7-4A6E-8C17-938F6618BD56 'lampy://lookback'
```

打印的根栈（`shots/nav-stack-no-root.jsonl`），不是看屏幕猜的：

1. 冷启动回看：`lookback-focus` → `names: ["lookback/index"]`。**没有 `index`（`/`）**。`iphone16-release-cold-lookback.png`
2. 回看根「留下」→ 写 `noroot-walk-0928` → 保存：落到最近，新记录在 9/28 最前。`iphone16-no-root-leave.png` / `iphone16-no-root-after-save.png`
3. 保存后根栈：`recent-focus` → `names: ["lookback/index", "index"]`，`index` 为当前。`dismissTo('/')` 在 Expo Router 57.0.22 里目标不在栈上时，**换掉当前（留下）、下面的回看根还在**（与 `StackRouter` `POP_TO` `index === -1` 一致）
4. 再滑返回：根栈是 fade，左缘手势**没有弹出**，画面仍停在最近（`iphone16-no-root-after-back.png`）。**没有回到已保存的留下**。按 #33：若这次能弹出，会话根是回看；打印的栈正是 `[lookback/index, index]`

未改路由。未改个人 SQLite；这条是 App 里留下的。

## 末项

列表新→旧。下面两件不是同一件事：

| 项 | 模拟器 | 说明 |
| --- | --- | --- |
| **当天最后一条**「播放」与「看这条」完整露出，停在带上沿，带不盖住 | **PASS** | `last-item-end` / `last-item-play`。9/28 当天最后一条是「Same day voice」（留下录的）。不是整表最底 |
| 点「播放」看到暂停/进度 | **NOT VERIFIED** | 控件在带上方可点，点后画面仍是「播放」。本轮不修播放器 |
| **整张最近列表滚到最底**「门口的风」的播放 | **NOT VERIFIED** | 最旧一条无声音；不能改库。与「当天最后一条」分开记 |
| 横屏 / iPad / VoiceOver / XXXL | **NOT VERIFIED** | 未跑 |

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --no-coverage` | **PASS**（83 suites / 481 tests） |
| 本轮文件 `npx eslint` | **PASS**（本轮无路由改动） |
| `npx expo lint`（全量） | **FAIL**（既有 `leave.tsx:121`、`share/[id].tsx` 的 `set-state-in-effect`） |
| `git diff --check` | **PASS** |
