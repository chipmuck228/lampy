# Lookback reading visual

Branch: `ios/lookback-reading-visual`  
Base: `origin/main` @ `aab672654a50842deac262a751a43ed607093a35` (#57 merged)  
Head: `ecc41a7`（视觉调整＋走查记录；用户报告真机通过，运行 SHA 未从设备核对）.

## Attachments

Named `App(2).tsx` / `index(2).css` were **not found**.

Readable source copied into `attachments/`:

- `/Users/zhen/Downloads/生活记录应用设计/src/App.tsx`
- `/Users/zhen/Downloads/生活记录应用设计/src/index.css`

Confirmed sections: `lookback-column` / `screen-top`, `directory-wrapper`, `day-heading` / `day-records`, `RecordBlock` / `record-foot`, `day-navigation` / `end-note`.

Not copied: synthetic days, web player timer, Noto/DM Sans, phone chrome, inline directory.

## Functional base

This PR is **连续阅读＋视觉**, not visual-only. It already includes OPEN #53 (`31a6542`) on `aab6726`. Do not merge #53 again; close it only after #58 lands. Catalog is no longer a 换一天 overlay. It is an in-place **时间目录** on the same page. Recent and lookback share `LeaveFab` / `useLeaveFabMotion` / `createRecentLeaveFabScroll`.

## Visual choices

- Page chrome matches Recent header rhythm: kicker `LAMPY · 时间里的记录` uses the same `recentType.kicker` as `LAMPY · 生活记录`; title `回看` and mark `慢慢看` sit on one row; the header sits in the same `RootReadingLayout` slot with the same safe-area + `12/20` top inset as Recent; a `recentRule` line sits under the header and again before the day’s records. Reading type follows the attachment lookback roles via `lookbackType` (Songti day title 31, PingFang year/meta, record note/feeling/open/end at the same iOS-point scale as Recent). Tokens only; no web fonts.
- In-place 时间目录: collapsed range uses the larger date size and Chinese month (`2026年 · 九月`). Expanded year is the small muted year token; months are a step larger (`九月`) with no year/month totals. Days stay on the month indent as `9 / 18` left and `周三 · 3条` right. Unknown ranges sit at the bottom. Changing day keeps the current records on screen and fades them like Recent → Lookback; it does not flash「这一天正在读出来。」Ready records then rise in slowly (about 640ms, 12pt) instead of popping. First load hides the loading sentence and uses the same appear. Reduce Motion swaps without the fade. Same-day open/close holds the reading line; only a real day change locates the new title.
- Day heading: year / `9月18日` / `周五 · 3条记录`. VoiceOver still reads the full `星期X` date plus count. Neighbor days stay on one row: previous left, next right.
- Records stay separate. Hairline + gap. No cards. Photos unchanged (original aspect, all reachable).
- Sound uses existing `MomentAudio` `chrome="row"` with real playback state and 48pt hits. No timer-forged progress.
- Foot: accent dot + original feeling word; `阅读完整记录` keeps the system chevron and exact Moment ID. Wrap when narrow.
- End note only when ready, `hasMore=false`, no more error/loading, and restore is not pending. Confirmed day uses `这一日，读到这里。`; unconfirmed ranges use `这一段，读到这里。`
- Empty library: `日子会慢慢留在这里。` / `先留下一点，以后再回来看看。` Shared floating 留下 uses the system plus icon; catalog open hides and disables it. Scroll padding uses `leaveFabScrollReserve()`, not the nav band.
- First `getLookbackBook()` failure keeps any already-shown records and offers `再试一次`.

## Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | **PASS** |
| Jest catalog / FAB / book-screen / expand / adapt / guards / failure / page / locate / origin / reading helpers / day fade | **PASS** 15 suites / 76 tests |
| `expo lint` on touched lookback and shared FAB files | **PASS** with one **pre-existing** `react-hooks/exhaustive-deps` warning in `lookback-chrome.tsx` `tryLocate` |
| `git diff --check` | **PASS** |

## Running shots

Isolation App before/after shots: **NOT VERIFIED** (no isolation install was launched for this pass).  
Simulator: **NOT VERIFIED**.  
User device: **PASS**（用户报告以上视觉调整通过；测试 SHA 未确认）.  
Automation beyond Jest: **NOT VERIFIED**.

Storyboard was not used as a substitute.

## Device retest

用户报告真机通过本轮回看视觉调整：眉题与「最近」统一、眉题到顶间距、时间目录中文月份与左右日行、换日保留并淡出、记录缓慢出现、邻日左右对齐、「阅读完整记录」单行右齐。未能从真机安装包或设备日志核对该次运行的 JS SHA，故记为：**用户报告通过，测试 SHA 未确认**。模拟器、隔离安装本轮未走。

| 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- |
| 眉题 `LAMPY · 时间里的记录` / `回看` · `慢慢看` / 顶距与分割线 | Jest 字号与槽位 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 时间目录：`2026年 · 九月`、小年份、日行 `9 / 18` · `周三 · 3条` | Jest catalog / book-screen | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 换日保留当前记录并淡出；不闪「这一天正在读出来。」 | Jest hold / fade | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 记录缓慢出现（约 640ms、12pt） | Jest fade-in 时长 | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 邻日左／右对齐；`阅读完整记录` 单行右齐 | Jest reading | **NOT VERIFIED** | **PASS**（用户报告；SHA 未确认） |
| 目录选日 → 连续阅读 → 展开 → 详情 → 返回 | 沿用 guards | **NOT VERIFIED** | **NOT VERIFIED** |
| 播放／暂停／目录开关／换日不自动播 | 沿用 player guards | **NOT VERIFIED** | **NOT VERIFIED** |
| 短屏 / 横屏 / iPad / VoiceOver | Jest 边距／目录 a11y | **NOT VERIFIED** | **NOT VERIFIED** |

#57 的「用户报告通过，测试 SHA 未确认」只属于设置页，不搬到本分支当实现 SHA。

静态截图不算通过。隔离机走查仍待另开：

1. 目录选日 → 连续阅读 → 原位展开 → 精确详情 → 返回原位置.
2. 播放 → 暂停 → 打开目录 → 关闭／换日：不自动播，进度不串.
3. 同日长文+两图+声音；短文／单图／仅声音；长文展开收起.
4. 多页当天、继续加载、真正结束后才见结束句。确认日用「这一日，读到这里。」；未确认范围用「这一段，读到这里。」
5. 三种未确认范围、空库（浮动「＋ 留下」可用）、目录打开时浮动按钮隐藏并禁用、缺失媒体。
6. 目录首次失败 → 点一次重试 → 成功；已有内容仍在。
7. 短屏、横屏、iPad.
