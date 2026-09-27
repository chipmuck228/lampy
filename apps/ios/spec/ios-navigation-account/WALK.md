# 导航实现走查 · iPhone 16 模拟器

基线：`origin/main` @ `4466b0d`（#33 merge）。实现分支 `ios/navigation-band`（#34）。
机型：iPhone 16 · iOS 18.6 · `app.lampy.ios` Dev Client · Metro :8081。
本机 `.env` 已配置家庭 API，因此底带出现「家庭」。这是门控打开，不是空入口。

Jest 证明调用了 `back` / `dismissTo`，**不等于**原生栈已打印。下面「模拟器」栏只记这次实际打开并点到的页面。未打印 Expo Router 栈。

## 页面证据

| 画面 | 文件 | 结果 |
| --- | --- | --- |
| 最近：标题在阅读区，底带一行（最近 / 回看 / 留下 / 家庭），带在 Home Indicator 之上 | `shots/iphone16-recent-after-link.png` | **PASS** |
| 深链 `lampy://lookback`：回看根，无顶栏返回，底带一行（回看 / 最近 / 留下 / 家庭） | `shots/iphone16-lookback-deeplink.png` | **PASS** |

底带未再折成「最近」独占一行。四项在 393pt 上同一行；`flexWrap: nowrap`，窄宽度才改 `column`。

## 路由序列

| 序列 | 模拟器 | 说明 |
| --- | --- | --- |
| 甲 最近 → 回看 → 底带「最近」→ 再回看 | **PASS** | `jia-lookback` → `jia-back-recent` → `jia-lookback-again`。回到同一最近（缺省竖图仍在）。未打印栈 |
| 乙 深链回看根，再点「最近」 | **PASS**（热深链） | `lampy://lookback` 落到回看根；点「最近」到最近（`yi-dismiss-recent`）。`terminate` 后冷启动落在 Expo 启动器，**进程冷启动乙 NOT VERIFIED** |
| 乙′ `lampy://lookback?from=recent` | **PASS**（热深链） | 点「最近」仍到最近（`yi-spoof-dismiss`），没有因 `from=recent` 回到非最近页。Jest：无签发 token 即使上一页名叫 `index` 也不 `back()` |
| 丙 最近 → 回看 → 留下 → 保存 → 再按返回 | **PASS** | 留下文案「返回原来的位置」；保存「Walksave」后落在最近（`bing-after-save`）；新句在最近顶上（`bing-recent-top`）。再左缘滑动仍停在最近，未进回看/留下（`bing-after-back`）。未打印栈；HID 左缘手势有时不生效，此次未带出回看 |
| 深链回看 → 留下 → 保存（栈里无 `/`） | **NOT VERIFIED** | 未在无 `/` 的进程里保存。契约：无 `/` 时 `dismissTo` 回退须以后确认 |

## 底带末项

| 项 | 结果 |
| --- | --- |
| 同日最后一条滚到底，「看这条」完整可见、停在带上沿 | **PASS**（`last-item-end`：末条「门口的风」） |
| 同日最后一条的「播放」 | **NOT VERIFIED**（该条无声音控件） |
| 回看长年列表滚到最后一年 | **NOT VERIFIED**（当前只有 2026） |
| 最大字号纵排 | **NOT VERIFIED** |
| Home Indicator 与点击行 | 稿面/截图带在 Indicator 之上；实距未量 |
| 横屏 / iPad 原生页 / VoiceOver | **NOT VERIFIED**。iPad 左栏：Jest 断言 rail `width: 112`、`flexShrink: 0`，滚动区 `flex: 1; minWidth: 0`、无 `width: '100%'` |

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --no-coverage` | **PASS**（83 suites / 480 tests） |
| 本轮文件 `npx eslint`（`lookback-origin.ts`、`root-nav-band.tsx`、`life-page.ts`、`lookback/index.tsx`、`index.tsx` 及对应测试） | **PASS** |
| `npx expo lint`（全量） | **FAIL**（既有 `leave.tsx:121`、`share/[id].tsx` 的 `set-state-in-effect`，本轮未改那些逻辑） |
| `git diff --check` | **PASS** |
