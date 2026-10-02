# Lookback reading visual

Branch: `ios/lookback-reading-visual`  
Base: `origin/main` @ `aab672654a50842deac262a751a43ed607093a35` (#57 merged)  
Head: see the visual commit on this branch.

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

- Page chrome: kicker `LAMPY · 时间里的记录`, title `回看`, subtitle `慢慢看`. Tokens only; no font shrink.
- In-place 时间目录: collapsed shows the current year/month or known unconfirmed range plus a system chevron. Expanded lists recorded years/months and unconfirmed ranges in a capped inner scroll. Reading stays mounted. Same-day open/close holds the reading line; only a real day change locates the new title.
- Day heading: year / `9月18日` / `周五 · 3条记录`. VoiceOver still reads the full `星期X` date plus count.
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
| Jest catalog / FAB / book-screen / expand / adapt / guards / failure / page / locate / origin / reading helpers | **PASS** 14 suites / 57 tests |
| `expo lint` on touched lookback and shared FAB files | **PASS** with one **pre-existing** `react-hooks/exhaustive-deps` warning in `lookback-chrome.tsx` `tryLocate` |
| `git diff --check` | **PASS** |

## Running shots

Isolation App before/after shots: **NOT VERIFIED** (no isolation install was launched for this pass).  
Simulator: **NOT VERIFIED**.  
User device: **NOT VERIFIED**.  
Automation beyond Jest: **NOT VERIFIED**.

Storyboard was not used as a substitute.

## Device retest

User-reported SHA: 用户报告通过，测试 SHA 未确认 — that line belongs to #57, not this branch.

For this visual PR, on an isolation install (not Liuz17):

1. 目录选日 → 连续阅读 → 原位展开 → 精确详情 → 返回原位置.
2. 播放 → 暂停 → 打开目录 → 关闭／换日：不自动播，进度不串.
3. 同日长文+两图+声音；短文／单图／仅声音；长文展开收起.
4. 多页当天、继续加载、真正结束后才见结束句。确认日用「这一日，读到这里。」；未确认范围用「这一段，读到这里。」
5. 三种未确认范围、空库（浮动「＋ 留下」可用）、目录打开时浮动按钮隐藏并禁用、缺失媒体。
6. 目录首次失败 → 点一次重试 → 成功；已有内容仍在。
7. 短屏、横屏、iPad.
