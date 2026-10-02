# 最近／回看底带与「＋ 留下」视觉

独立分支 `ios/root-nav-leave-visual`。从当时最新 `origin/main` 开出；合并前再核远端，不把某一 SHA 当成永远不变的基线。

只改本轮需要的 `apps/ios` 文件。复用 `RootNavBand`、`RootReadingLayout`、`LifeIcon`、`LeaveFab`、`useLeaveFabMotion`、`createRecentLeaveFabScroll`、`recentFabMotion`。不新建第二套导航、浮动按钮、计时器或滚动状态机。

本 PR 保持 OPEN，不自动合并，不上传或覆盖 TestFlight。不卸载、不清空 Liuz17。

走查：[`WALK.md`](./WALK.md)。

附件 `image(20261002-154758).png` 在仓库与工作区中未找到。下列规格按文字要求实现，**不声称看过截图**。

---

## 1. 底带视觉

手机底带固定顺序，两页一致，不因当前页对调：

| 位置 | 目的地 | 系统符号 | 类型包核对 |
| --- | --- | --- | --- |
| 左 | 最近 | `line.3.horizontal`（横线列表） | `sf-symbols-typescript` 含此名 |
| 右 | 回看 | `book`（书） | `sf-symbols-typescript` 含此名。未使用 `book.open`：该名不在本仓库类型目录里，也不对全部 `LifeIcon` 做断言来绕过检查。`book` 是闭着的书，不是打开的书；本轮未在真机核过 `book.open` 是否画出，因此改用已收录符号。 |

- 两项等宽，整块触控 ≥ 48pt。
- 图标在上、标签在下，居中。图标 23pt，标签 13pt，间距 4pt，固定字号（`allowFontScaling: false`）。
- 当前项：现有 `sage` 深墨绿，完整图标 + 标签。
- 另一项：现有 `inkSoft`，不靠过低透明度区分。
- 背景 `paper`，手机带上沿 `hairline`。无选中胶囊、色块、玻璃、重阴影。
- Home Indicator 仍只由外层 `SafeAreaView` 处理一次；底带不再加 `paddingBottom`。
- 设置继续在页眉齿轮。家庭入口关闭，不留空位，不增加账户或订阅。
- 横屏 / iPad 仍用现有 `shouldUseNavRail` 左栏。左栏只统一为图标在上、标签在下，不改成手机底带。

## 2. 导航行为

来源 token、`dismissTo`、滚动恢复、回看目录规则不改。两个根页不互相 push 叠栈。

| 项 | 行为 |
| --- | --- |
| 当前项 | 外层 `View` 显式 `accessible`，`accessibilityRole="tab"`，`accessibilityState.selected=true`，读名称。内部文字 `accessible={false}`，图标 `decorative`，避免重复朗读。点击不导航、不刷新、不回顶。Jest 能找到标签不等于 VoiceOver 已核过。 |
| 另一项 | 现有 `onOther` / `onFamily`。不改写来源或路由状态。 |
| 底带 | 仍是滚动区外的兄弟节点，不是覆盖正文的绝对定位层。 |

## 3. 「＋ 留下」只改视觉

同一套 `LeaveFab` 继续给最近和回看用。

**未改（行为文件保持原实现）：**

- `useLeaveFabMotion`
- `createRecentLeaveFabScroll`
- `recentFabMotion`
- 滚动方向、阈值、停止等待、动画时长 / 缓动 / 取消、Reduce Motion
- 聚焦 / 失焦 / 后台、目录展开隐藏与关闭后恢复
- 空库 / 加载 / 失败的显示规则
- 点击路由、草稿和保存

**本轮视觉：**

- 系统 `plus` +「留下」；触控 ≥ 48pt。
- 去掉上浅白 / 下浅墨分层。胶囊单色：页面 `paper` 为 `#F3F0E9`，按钮底用现有略深的 `paperDeep` `#E8E1D5`。不靠降低可见态 opacity 来做浅色。
- plus 与「留下」用 `sage`。边为现有 `hairline`。阴影极轻，与 `opacity` 同一外壳，便于整颗一起淡出。无模糊、玻璃、渐变带、纹理图。
- 手机：按钮底边距导航带上沿 14pt（12–16pt 内）。
- 右侧用 `pageGutter`（手机 24、常规宽 48）对齐正文右边距。iPad 左栏时 overlay 仍在阅读栏内，不套用手机整屏坐标。
- 动画值绑定、隐藏时的点击 / 无障碍处理保持原样。
- 不因空库已有「留下第一条」再藏浮动按钮。

## 3b. 显隐核实（源码，不改行为）

对照参数（`recent-leave-fab.ts`，本轮无 diff）：

| 项 | 值 |
| --- | --- |
| 顶部视为已回顶 | `offsetY <= 8` → 显示 |
| 下滚隐藏 | `delta > 12` |
| 上滚恢复 | `delta < -8` |
| 停止后恢复 | 800ms |
| 隐藏动画 | 380ms，`opacity 1→0`，`translateY 0→10` |
| 显示动画 | 640ms，反向 |
| Reduce Motion | 时长 0，立即到位 |
| 缓动 | `Easing.out(cubic)` |

调用链：最近 `onRecentScroll` → `leaveFab.onScroll`，`available={leaveFab.open}`。回看根页同样 `onScroll`，目录展开时 `readingLocked` 停止滚动喂给控制器，且 `available={leaveFab.open && !readingLocked}`。每页只挂一份 `LeaveFab`，共用同一组件。

用户看到「滚动时只是背景变淡」：

1. **源码规则：** 隐藏是整颗 `opacity` 在 380ms 内到 0，不是单独改背景或文字颜色。慢滑每步 `delta ≤ 12` 记 idle，800ms 后按原规则再出现。这是设计，不是浅色常驻。
2. **iOS 阴影残留** 仍是待验证假设，不是已确认根因。阴影与填充放在同一显隐外壳，是为了视觉层一起受 `opacity` 控制，不能代替真机手势验收。
3. **未改等待、阈值或控制器。**

运行环境见 `WALK.md`。属性测试不等于原生显隐或 VoiceOver PASS。

## 4. 正文避让

```
leaveFabScrollReserve = LEAVE_FAB_HIT(48) + GAP(14) + TRAIL(30)
```

不含导航带高度。最近与回看根页都只加这一段。不靠空记录、固定屏高或重复 spacer。

## 5. 文件

| 文件 | 作用 |
| --- | --- |
| `src/screens/root-nav-band.tsx` | 固定顺序、图标+标签、纸色细线、overlay 边距 |
| `src/screens/life-page.ts` | 底带顺序与字号 / 图标 token |
| `src/screens/life-icons.tsx` | `recent` / `lookback` / `family` 符号 |
| `src/screens/leave-fab.tsx` | 静态样式、`leaveFabScrollReserve`、`leaveFabOverlayPadding` |
| `src/screens/lookback-chrome.tsx` | 根页底垫改为同一套 reserve |
| 相关 Jest | 顺序、已选中、当前项不导航、48pt、避让不含带高；原显隐测试保留 |

未改：`recent-leave-fab.ts`、Moment / 媒体 / 日期 / 库、草稿保存、播放、本机保护、目录分页、设置与法务文案、家庭 / AI 门控。
