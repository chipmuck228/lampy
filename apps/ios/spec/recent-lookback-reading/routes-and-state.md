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
| 进入 `/lookback`（无意图、无本次阅读） | 年列表，**不**默认展开日 | 打开**最近一个有明确发生日期**的日子（`exact` 或 `day`）。进入阅读态 |
| 同上，但没有任何明确发生日 | 只见未确认入口 | 进入时间未确认阅读态。不是空库 |
| 同一次使用再进回看 | `rememberLookbackBookOpen` 只恢复展开月/日，不恢复阅读滚动；摘录仍最多 2 条 | 恢复日期 + 正文展开 + 阅读滚动。目录默认收起 |
| 冷启动 | `LOOKBACK_RESTORE_POLICY.coldStart = 'recent-home'` | **保持**。不跨进程跳回上回看 |
| 点年月 | 同页展开一个月，日期行仍在 | 同页打开目录。同时只展开一个月 |
| 点日期 | 该日下挂最多 2 条；再点同一日会重载并定位，不收起 | 收起目录，进入当天阅读。再点「换一天」才开目录 |
| 「这一天还有 N 条」 | `push` 日页 | **取消**这条主路径。当天在原位分批接上 |
| 日页返回 | 写 `{year,month,day}` 意图，`goToLookbackBookFromDay` | 仍写意图。书页按意图进该日阅读态 |
| 年/月深链 | 蹦床 + 一次性意图 | 保留。年意图：目录态定位该年。月意图：目录展开该月。日意图：阅读态该日 |
| 前一 / 后一有记录日 | **无** | 阅读页尾。写出目标日期。没有邻日则不画空按钮 |
| 横滑换日 | 无 | 继续不用 |
| 看这条 | 摘录里有；日页整条 `Pressable` | 阅读态与最近一样：播放和打开分开。日页深链对齐同一阅读块 |
| 打开目录 / 收起目录 | 月行切换；日不收起 | 见 §4 |

一次性定位继续用现网零件，不另发明 query：

`writeLookbackBookIntent` / `takeLookbackBookIntent` / `lookbackBookLocateId` / `nextLookbackLocateSeq` / `lookbackLocateIsCurrent` / `LookbackLocateAnchor`。

过期回调不得拉回旧日期。`onScrollBeginDrag` 取消待完成定位。这两条现网已有，阶段 C 必须接到阅读态，不能只留在目录锚点。

---

## 3. 状态表

| 状态 | 最近 | 回看目录 | 回看阅读 |
| --- | --- | --- | --- |
| **首屏未返回** | 现网 `view === null` 且无转圈。品牌层等 `homeSettled` | 现网同样无独立转圈 | 阅读区可写一句中性「这一天正在读出来」，**不得**先画空库句 |
| **成功** | `days` 按 `recordedAt` 日块 | `getLookbackBook` 年份 / 未确认计数 | `getHistoryDay` / 三个 unconfirmed 的 `items` |
| **失败** | 现失败句。设置和留下仍可点 | 书页失败句 + 重试。不是「以后可以按时间回来看。」 | 阅读失败 + 重试。已选日期保留。目录仍可打开 |
| **重试** | 再 focus 会重读；可加明确重试（阶段 B 可选，与现网失败句并存） | 重拉 `getLookbackBook` | 重拉当天 / 当前未确认页。generation 校验 |
| **空** | `isFirstUse` 现文案。无统计、无横幅 | `isEmpty` 现文案 | 日历有效但 0 条：「这一天还没有留下什么。」无效日：「日历上没有这一天。」 |
| **部分加载** | 无分页。一次 `listRecent(50)` | 月展开 loading / error / ready。其他年仍在 | `hasMore === true` 时页尾「继续往下看」，新条接在已读后面。已读条不卸 |

失败不能改写成空。空不能画失败。部分加载不能用「为你精选」或把多条合成一段。

---

## 4. 目录开合、焦点、位置

阅读态是 `/lookback` 的默认可见面。目录是同页覆盖块，不是新路由。

| 事件 | 目录 | 阅读 | 焦点 | 滚动 |
| --- | --- | --- | --- | --- |
| 冷进回看（进程内无阅读记忆） | 收 | 默认日或未确认 | 当天页首（日期 + 星期） | 顶 |
| 同进程再进 | 收 | 上次日期 | 不抢焦点 | 恢复上次阅读 `offsetY`，等测量 |
| 点「换一天」 | 开。记住当前日期 | 仍挂着，可被目录挡住 | 当前年或当前月行 | 目录滚到当前月；`readingScrollY` 先存 |
| 收起目录（未换日） | 关 | 原日 | 「换一天」 | 恢复 `readingScrollY` |
| 点另一天 | 关 | 新日，展开集清空 | 新页首 | 顶。换日暂停声音 |
| 点同一天 | 关 | 原日 | 页首 | 不重载播放器；可重新定位页首 |
| 系统返回且目录开着 | 关 | 原日 | 「换一天」 | 恢复阅读位置。**不**因此回到最近 |
| 系统返回且目录已收 | 按现网 `goToRecentFromLookbackRoot` | — | — | — |
| 详情返回 | 保持收 | 原日，恢复展开 id | 被打开的那条「看这条」 | 等该条坐标，再 `scrollTo` |
| 年深链 | 开，定位年 | 不进阅读 | 年章节 | `year-YYYY` |
| 月深链 | 开，展开该月 | 不进阅读 | 月行 | `month-YYYY-MM` |
| 日深链 / 日页返回意图 | 收 | 该日 | 页首 | `day-YYYY-MM-DD` |

定位 seq / generation 过期则丢弃。用户开始拖动就 `clearLocate`。

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
| 目录开合 | **不得**卸载阅读树里的播放器。目录是叠加，不是把当天 children 卸掉重建 |
| 文字展开 / 收起 | 只改该条 note 的 `numberOfLines`。播放器不 remount |
| 分批加载 | append。已出现的条（含正在播的）保持同一 component identity |
| 最近保存回声 | 与播放无关。淡入不得触发 `play` |
| Reduce Motion | 保存淡入不播。目录开合可瞬间切，不用装饰翻页 |

展开状态：`Set<momentId>`，只活在本次 `/lookback` 挂载。详情返回要还在。换日清空。进程杀死后不恢复展开。

滚动：阅读态继续 `rememberLookbackScroll('lookback-reading')`（或现 `path` 键拆成目录 / 阅读两条）。目录滚动与阅读滚动分开记。

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

默认打开「最近一个有明确发生日期的日子」：

1. `getLookbackBook()`
2. 从新到旧找第一个可展开月（`lookbackBookMonthOpenable`）
3. `getHistoryMonth`，取该月最后一个有 `count > 0` 的日

两次往返可接受。阶段 C **先不要**加 `getLatestPlacedDay`。若真机证明首屏不可接受，再单独加接口，并测：顺序与 `getHistoryMonth` 最后一日相同、count 与日行相同、无明确日时走到未确认而不是空。

邻日：用当前月页 + 必要时再取相邻可展开月，取上一 / 下一有记录日。跨年同理。不新增邻日接口，除非后来证明要扫很多空月。

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
