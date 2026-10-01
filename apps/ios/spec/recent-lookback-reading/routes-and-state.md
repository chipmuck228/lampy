# 操作、路由、状态、播放与位置

对照的是 `origin/main` @ `d5c02386ebd335948f172b487df157390f3a3d9c` 的代码事实。下面「现网」指该 SHA；「采用」指阶段 B / C 要实现的契约。

页面继续只走 `getUseCases()`。不直接查 SQLite。

---

## 1. 现网路由（不要假设已经没有）

| URL | 现网 | 阶段 C 后 |
| --- | --- | --- |
| `/` | 最近。`RecentScreen` | 仍是最近。只改呈现与一次保存回声 |
| `/lookback`、`/lookback?o=` | 时间书：年章节 + 展开一个月 + 选中日下最多 2 条摘录 | **同页两态**：目录态 / 阅读态。`o=` 仍表示从最近来 |
| `/lookback/:year` | 蹦床：`writeLookbackBookIntent({year})` → `replace` `/lookback` | 保留蹦床。目录态滚到该年 |
| `/lookback/:year/:month` | 蹦床到书页并展开该月 | 保留。无效月降级到年 |
| `/lookback/:year/:month/:day` | **真页面**：当天列表，整条进详情，声不可播，「继续往下看」 | **保留真页面**，与阅读态共用当天阅读块。深链不删 |
| `/lookback/unconfirmed` | 根未知时间列表 | 保留。书页点「时间未确认」可在同页进阅读态，深链仍进此页 |
| `/lookback/:year/unconfirmed` | 年内月份未确认 | 保留 |
| `/lookback/:year/:month/unconfirmed` | 月内日子未确认 | 保留 |
| `/moment/:id` | 详情。`router.back()` | 不改详情语义。返回恢复来源页的日期 / 展开 / 滚动 |
| `/leave?from=` | 留下。保存一律 `dismissTo('/')` | 不改保存落点。最近消费一次性 `justSavedMomentId` |

年 / 月无效：`lookbackBookIntentFromParts` 已降级（月 `13` → 年；日 `02/31` → 年月）。阶段 C 不改这条。

`LookbackYearMonths`、`LookbackMonthCalendar` 现网路由不挂。本轮不复活七列月历。

---

## 2. 操作与路由表

### 2.1 最近

| 操作 | 现网 | 采用 |
| --- | --- | --- |
| 打开最近 | `/` | 同左 |
| 底带「回看」 | `push(lookbackRootHrefFromRecent())` → `/lookback?o=` | 同左。回到最近仍用 `o=` / `dismissTo('/')` |
| 底带「留下」 | `push(leaveHref('recent'))` | 同左 |
| 设置 | `push('/account')` | 同左 |
| 家庭 | `isFamilyProductEntryOpen()` 为假时不画 | 继续关闭 |
| 看这条 | `push(/moment/:id)`，触达 `LookThisHit` | 同入口、低强调、≥ 48pt。整条不是大按钮 |
| 播放 / 暂停 | `useRecentClipPlayback`，按 `AudioView.id` | 维持已验收 A/B、后台。与「看这条」分开 |
| 保存成功 | `dismissTo('/')`，`useFocusEffect` 重读。无滚动记忆，无淡入 | 新记录按 `recordedAt` 出现在正确日块。一次性淡入 / 轻触感，只消费本次保存 id |
| 从详情返回 | 原生 `back()`，列表重读，滚动靠系统 | 阶段 B 不另做最近滚动记忆。系统能停在原条即可 |

### 2.2 回看

| 操作 | 现网 | 采用 |
| --- | --- | --- |
| 进入 `/lookback`（无意图、无阅读快照） | 年列表，**不**默认展开日 | 走默认日查找（§6.1）。不是「第一个可展开月」 |
| 最新月只有月精度 | 月仍可展开（`lookbackBookMonthOpenable`） | 跳过该月，继续更早的月，直到有明确日 |
| 查找时某月读取失败 | 现网无此查找 | **停**。失败态。不得当无日期跳过 |
| 无明确日，但有 year/month 精度 | 根上能看见三种入口 | **目录态**。禁止用根 unknown 列表代替这些范围 |
| 只有整体 unknown | 根上「时间未确认」一行 | 直接进入该阅读章节 |
| 同一次使用再进回看 | `rememberLookbackBookOpen` 只恢复展开月/日，不恢复阅读滚动；摘录仍最多 2 条 | 按范围恢复日期、已加载分页、展开 ID、滚动。目录收起。先内容后位置 |
| 冷启动 | `LOOKBACK_RESTORE_POLICY.coldStart = 'recent-home'` | **保持**。快照随进程丢。不跨进程跳回上回看 |
| 点年月 | 同页展开一个月，日期行仍在 | 同页打开目录。同时只展开一个月 |
| 点日期 | 该日下挂最多 2 条；再点同一日会重载并定位，不收起 | 收起目录，进入当天阅读。再点「换一天」才开目录 |
| 「这一天还有 N 条」 | `push` 日页 | **取消**这条主路径。当天在原位分批接上 |
| 日页返回 | 写 `{year,month,day}` 意图，`goToLookbackBookFromDay` | 仍写意图。书页按意图进该日阅读态 |
| 年/月深链 | 蹦床 + 一次性意图 | 保留。年意图：目录态定位该年。月意图：目录展开该月。日意图：阅读态该日 |
| 前一 / 后一有记录日 | **无** | 阅读页尾。写出目标日期。没有邻日则不画空按钮 |
| 横滑换日 | 无 | 继续不用 |
| 看这条 | 摘录里有；日页整条 `Pressable` | 阅读态与最近一样：播放和打开分开。日页深链对齐同一阅读块 |
| 打开目录 / 收起目录 | 月行切换；日不收起 | 见 §4。先暂停再盖；底层不可点、不可读；明确收起；不自动播 |

一次性定位继续用现网零件，不另发明 query：

`writeLookbackBookIntent` / `takeLookbackBookIntent` / `lookbackBookLocateId` / `nextLookbackLocateSeq` / `lookbackLocateIsCurrent` / `LookbackLocateAnchor`。

过期回调不得拉回旧日期。`onScrollBeginDrag` 取消待完成定位。这两条现网已有，阶段 C 必须接到阅读态，不能只留在目录锚点。

---

## 3. 状态表

| 状态 | 最近 | 回看目录 | 回看阅读 |
| --- | --- | --- | --- |
| **首屏未返回** | 现网 `view === null` 且无转圈。品牌层等 `homeSettled` | 现网同样无独立转圈 | 阅读区可写一句中性「这一天正在读出来」，**不得**先画空库句 |
| **成功** | `days` 按 `recordedAt` 日块 | `getLookbackBook` 年份 / 未确认计数 | `getHistoryDay` / 三个 unconfirmed 的 `items` |
| **失败** | 现失败句。设置和留下仍可点 | 书页失败句 + 重试。不是「以后可以按时间回来看。」 | 阅读失败 + 重试。已选范围保留。默认日查找失败同样停，不跳月、不进 unknown。目录仍可打开 |
| **重试** | 再 focus 会重读；可加明确重试（阶段 B 可选，与现网失败句并存） | 重拉 `getLookbackBook` | 重拉当天 / 当前未确认页。generation 校验 |
| **空** | `isFirstUse` 现文案。无统计、无横幅 | `isEmpty` 现文案 | 日历有效但 0 条：「这一天还没有留下什么。」无效日：「日历上没有这一天。」 |
| **部分加载** | 无分页。一次 `listRecent(50)` | 月展开 loading / error / ready。其他年仍在 | `hasMore === true` 时页尾「继续往下看」，新条接在已读后面。已读条不卸 |

失败不能改写成空。空不能画失败。部分加载不能用「为你精选」或把多条合成一段。

---

## 4. 目录覆盖

阅读态是 `/lookback` 的默认可见面。目录是同页**覆盖层**，不是新路由，也不是把阅读 children 卸掉。

打开顺序（必须按这个次序，不能先盖再停）：

1. 若有正在播的声音：`pause`，按 `AudioView.id` stash。
2. 写入当前阅读快照（§5）：范围、已加载分页、展开 ID、当前 `scrollY`。
3. 盖上目录。阅读树仍在下面。
4. 底层阅读：禁止触达（`pointerEvents="none"`），禁止无障碍访问（隐藏子树）。VoiceOver 只能落到目录标题、关闭、年/月/日/未确认行。
5. 焦点落到当前范围所在的年或月行；没有当前范围则落关闭控件。

关闭（「收起」或目录开着时的系统返回）：

- 揭开覆盖。阅读树本来就在，不重拉、不重建播放器。
- **不**自动 `play`。进度仍在 Asset 记忆里，用户再点才续。
- 焦点回到目录入口「换一天」。
- 不改阅读快照里的范围和展开。滚动保持打开前记下的位置；若打开期间用户只在目录里滚，不写进阅读 `scrollY`。

短屏：覆盖要能滚完目录。关闭行和至少一行年月必须在首屏或一次短滚内够到。底层即便露边也不可点、不可被 VoiceOver 读到。

| 事件 | 目录 | 阅读树 | 焦点 | 声音 |
| --- | --- | --- | --- | --- |
| 冷进回看（无快照） | 收 | 默认查找结果 | 页首 | 不自动播 |
| 同进程再进 / 重挂载 | 收 | 按快照恢复（§5） | 不抢 | 不自动播 |
| 点「换一天」 | 开 | 挂着，不可点、不可读 | 当前月或关闭 | 先暂停 |
| 收起 / 系统返回且目录开 | 关 | 仍是原范围 | 「换一天」 | 保持暂停 |
| 点另一天或另一未确认范围 | 关 | 换范围，展开与分页清空 | 新页首 | 已暂停 |
| 点同一天 | 关 | 原范围，播放器不卸 | 「换一天」 | 保持暂停 |
| 系统返回且目录已收 | 现网 `goToRecentFromLookbackRoot` | — | — | pause + stash |
| 详情返回 | 保持收 | §5 | 被打开的「看这条」 | 不自动播 |
| 年 / 月深链 | 开，定位该年或展开该月 | 不进阅读 | 年或月行 | — |
| 日深链 / 日页返回意图 | 收 | 该日 | 页首 | 不自动播 |

年 / 月深链仍是目录，不是默认日查找。日意图优先于快照和默认查找。

---

## 5. 播放与阅读位置

### 5.1 现网事实

- 最近与书页摘录各造一份 `useRecentClipPlayback`。记忆表 `recent-clip-memory` 按 **Asset id** 存在模块里，进程内可跨这两处。
- 日页、三个未确认页的 `MomentAudio` **没有** `onPlay`。
- 详情用裸 `useSoundPlayer`，不读 Asset 记忆。
- 书页 `loadMonth` / `loadDay` 会 `clips.pause()`。
- 后台 / 离开：`useSoundPlayer` park；记忆 stash。返回不自动 `play`。
- 冷启动清空意图、滚动、打开月、音频。

### 5.2 采用

| 规则 | 说明 |
| --- | --- |
| 用户点了才播 | 阅读态、日页深链、未确认阅读都接同一套播放，不再把声音做成整条按钮 |
| 同一时刻一段 | 已有共享 player。换条先 stash 再播 |
| 进度属 Asset | 继续 `AudioView.id`。不能用 moment id 或「第几条」 |
| 换日 / 离开关回看 | `pause` + stash。返回不自动播 |
| 目录开合 | 先 pause + stash，再盖。阅读树不卸。关闭不自动播。底层无触达、无障碍 |
| 文字展开 / 收起 | 只改该条 note 的 `numberOfLines`。播放器不 remount |
| 分批加载 | append。已出现的条（含正在播的）保持同一 component identity |
| 最近保存回声 | 与播放无关。淡入不得触发 `play` |
| Reduce Motion | 保存淡入不播。目录开合可瞬间切，不用装饰翻页 |

### 5.3 统一进程内阅读快照

现网只有 `rememberLookbackBookOpen`（年/月/日）和按 path 的 `rememberLookbackScroll`。阶段 C 收成**一份**进程内快照，书页阅读态和日页深链按同一范围键读写。目录滚动另记，不进这份快照。

范围键：

```
day:YYYY-MM-DD
unknown
year-unconfirmed:YYYY
month-unconfirmed:YYYY-MM
```

快照字段：

| 字段 | 含义 |
| --- | --- |
| `scope` | 上面的范围键 |
| `loadedOffset` | 已请求到的分页 offset（0、50、100…）。恢复时从 0 接到这个 offset，用现 `getHistoryDay` / 三个 unconfirmed |
| `expandedIds` | 用户展开过、且当时存在的 moment id |
| `scrollY` | 阅读滚动 |

写入时机：离开回看根、进详情、打开目录、分批加载成功、展开变化、滚动结束。进程杀死后整份丢掉。

恢复时机：同进程重挂载 `/lookback`、从详情 `back()`、从最近再 `push` 回来。日页深链与书页阅读共用同一 `scope` 时读同一份。

恢复次序（不能先滚再铺）：

1. 定 `scope`：日/未确认深链意图优先于快照；都没有才走默认日查找。
2. 按 `loadedOffset` 把各页接上。这一步失败：该范围失败 + 重试，**保留快照**，不改写成空，不掉进默认日，不跳 unknown。
3. 用还存在的 `expandedIds` 展开。已删除的 id 默默丢掉，不报错。
4. 等内容尺寸和锚点测完。
5. 再 `scrollTo(scrollY)`。测量过期或 seq 过期则不滚。

记录变化：

| 变化 | 处理 |
| --- | --- |
| 范围还在，条有增删 | 已加载页按现查询重拉同一 offset；展开只保留仍在的 id |
| 范围变成空日 | 留在该日，空态句。`scrollY` 作废，停在页首 |
| 范围日历无效 | 「日历上没有这一天。」不改去默认日 |
| `hasMore` 变了 | 以这次查询为准。已展示的接在原位；不再用旧条数猜总页 |
| 用户开始拖动 | `clearLocate`，取消这次未完成的自动复位。快照里的 `scrollY` 随后改成用户停下的位置 |

冷启动：`LOOKBACK_RESTORE_POLICY.coldStart = 'recent-home'`。快照、意图、滚动、打开月、音频记忆全部丢。不跳回看。

---

## 6. 读取契约（阶段 A 结论：不先加新接口）

现成接口已经够用：

| 用途 | 现接口 | 计数 / 顺序 |
| --- | --- | --- |
| 最近 | `getRecentLife()` → `listRecent(50)` | 无 `hasMore`。多于 50 的更早记录只在回看。阶段 B **不**加最近分页 |
| 目录 | `getLookbackBook()` | 年 / 月 / 三种未确认的 **count** |
| 展开一个月 | `getHistoryMonth` | 有记录日 + `dayUnconfirmedCount`。安静日不列出 |
| 当天 | `getHistoryDay(y,m,d,offset)` | `items` + **`hasMore`**（仓库分页，不是 `count - items.length`） |
| 日行条数 | 月页 `entry.count` | `exact` + `day` 的 count 查询 |
| 未确认 | `getHistoryUnknown` / `Year` / `Month` + offset | 各自 `hasMore` |

禁止：用已展示条数去猜「这一天一共几条」；用 `LOOKBACK_BOOK_EXCERPT_LIMIT = 2` 当阅读上限。

「继续往下看」只看 `hasMore`。日行「N条」只看 count。两者暂时不一致时（例如两条查询之间有删除），以当前 `items` 为准继续读，`hasMore` 为假就停，不补假条。

### 6.1 默认日查找（无快照、无日意图时）

不要用 `lookbackBookMonthOpenable`。那个函数在「只有月精度」时为 true，只表示目录能展开。

```
book ← getLookbackBook()
  失败 → 书页失败，停。不是空，不是 unknown。
  isEmpty → 现空库句。

months ← 书上所有月份，年新到旧、月新到旧
for month in months:
  page ← getHistoryMonth(year, month)
  失败或 invalid → 停。阅读/查找失败 + 重试。
                   不得当作「无明确日」继续下一个月。
  days ← page.entries 中 count > 0 的日（exact + day）
  若 days 非空 → 采用该月最后一个日，进入阅读态。结束。
  否则（只有 dayUnconfirmedCount，或两者都无）→ 跳过，下一个更早的月。

若从未采用任何日：
  若任一 yearUnconfirmedCount > 0 或任一 dayUnconfirmedCount > 0
    → 目录态。year / month 范围留在各自入口。
      禁止把这些条放进 getHistoryUnknown 的列表来「代替」。
  否则若 unknownCount > 0
    → 直接进入时间未确认阅读章节。
  否则
    → 空库句（与 isEmpty 一致）。
```

阶段 C **先不要**加 `getLatestPlacedDay`。查找就是多次 `getHistoryMonth`，失败即停。真要加接口时单测：L-skip 得到 9月28日、E-search 不跳过、L-ym 进目录、L-unknown 进 unknown 章。

邻日：用当前月页 + 必要时再取相邻**有明确日**的月，取上一 / 下一有记录日。只有月精度的月不是邻日。跨年同理。不新增邻日接口，除非后来证明要扫很多空月。

`lookbackBookExcerpts` / `LOOKBACK_BOOK_EXCERPT_LIMIT` 在阶段 C 阅读态停用。函数可留到删干净测试再移除，避免半套。

---

## 7. 一次性保存回声

留下保存已经 `dismissTo('/')`。阶段 B 加进程内：

```
writeJustSavedMomentId(id)
consumeJustSavedMomentId() → id | null
```

最近 focus 读到 id，且该 id 出现在本次 `getRecentLife()` 里，才淡入 + 轻触感。之后必须已消费。

不触发：下拉/focus 刷新、从回看返回、从详情返回、后台回前台、Reduce Motion（只跳过淡入；触感也可跳过）、id 不在 50 条窗口。

不新增成功弹窗。
