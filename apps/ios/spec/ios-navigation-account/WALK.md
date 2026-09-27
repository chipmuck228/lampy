# 导航实现走查 · iPhone 16 模拟器

基线：`origin/main` @ `4466b0d`（#33 merge）。实现分支 `ios/navigation-band`。
机型：iPhone 16 · iOS 18.6 · `app.lampy.ios` Dev Client · Metro :8082。
本机 `.env` 已配置家庭 API，因此底带出现「家庭」。这是门控打开，不是空入口。

Jest 不是原生走查。下列「模拟器」栏只记这次实际打开的页面。

## 页面证据

| 画面 | 文件 | 结果 |
| --- | --- | --- |
| 最近：标题在阅读区，底带是滚动外兄弟（最近 / 回看 / 留下 / 家庭），带在 Home Indicator 之上 | `shots/iphone16-recent-after-link.png` | **PASS** |
| 深链 `lampy://lookback`：回看根，无顶栏「返回原来的位置」，底带（回看 / 最近 / 留下 / 家庭） | `shots/iphone16-lookback-deeplink.png` | **PASS**（序列乙的落地） |

## 路由序列

| 序列 | 模拟器 | 说明 |
| --- | --- | --- |
| 甲 最近 → 回看 → 底带「最近」→ 再回看 | **NOT VERIFIED** | 未能在模拟器上可靠点按底带。Jest：`from=recent` 走 `back()`，且 `push('/lookback?from=recent')` |
| 乙 深链回看根 | **PASS**（落地） / **NOT VERIFIED**（再点「最近」） | `lampy://lookback` 落到回看根，来源空。未点「最近」所以未看到 `dismissTo('/')` 之后的栈 |
| 丙 最近 → 回看 → 留下 → 保存 → 再按返回 | **NOT VERIFIED** | 未在模拟器保存。Jest：保存调用 `dismissTo('/')`，不调用 `replace` |
| 深链回看 → 留下 → 保存 | **NOT VERIFIED** | 未走。契约：无 `/` 时 `dismissTo` 回退须在以后原生确认 |

未在模拟器打印 Expo Router 栈。保存后再按返回的落点 **NOT VERIFIED**。

## 底带末项

| 项 | 结果 |
| --- | --- |
| 同日多条、最后一条有声音，滚到底看「播放」「看这条」 | **NOT VERIFIED**（最近页第一条照片占满一屏，未能滑动） |
| 回看长年列表滚到最后一年 | **NOT VERIFIED**（当前数据只有 2026） |
| 最大字号纵排 | **NOT VERIFIED** |
| Home Indicator 与点击行 | 稿面上带在 Indicator 之上；实距未量 |
| 横屏 / iPad / VoiceOver | **NOT VERIFIED** |

## 命令

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npx jest --no-coverage` | **PASS**（81 suites / 476 tests） |
| `npx expo lint` | **FAIL**（既有 `leave.tsx` / `share/[id].tsx` 的 `set-state-in-effect`，本轮未改那些逻辑） |
| `git diff --check` | **PASS** |
