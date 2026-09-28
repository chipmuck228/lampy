# 回看书页对照 · 真图与未拍

未写 **真页面** 的帧是结构示意。Jest、本目录 HTML、#35/#36 静态稿 **≠** 原生 PASS。

## 真页面（引用已有走查，不另造库）

| 文件 | 方案 | 库状态 | 结果 |
| --- | --- | --- | --- |
| `../lookback-month/shots/iphone16-lookback-years.png` | A 根 | 时间未确认 4 条；2026 有 1 条 | 真页面 · 当时 PASS |
| `../lookback-year-day/shots/iphone16-year.png` | A 年 | 稀疏 S：十一空月，9 月一点，列表「有1条记录」 | 真页面 · PASS |
| `../lookback-year-day/shots/iphone16-year-xxxl.png` | A 年 XXXL | 无三列 | 真页面 · PASS |
| `../lookback-month/shots/iphone16-lookback-month.png` | A 月 | 稀疏 S：七列 + 24 日一行 | 真页面 · PASS |
| `../lookback-month/shots/iphone16-lookback-month-xxxl.png` | A 月 XXXL | 不画七列 | 真页面 · PASS |
| `../lookback-month/shots/se3-375-lookback-month.png` | A 月 375pt | 仍画七列 | 真页面 · PASS |
| `../lookback-year-day/shots/iphone16-day.png` | A 日 | 9月24日一条短文 | 真页面 · PASS |
| `../lookback-year-day/shots/iphone16-detail.png` | A/B 详情 | 精确 ID | 真页面 · PASS |
| `../lookback-year-day/shots/iphone16-day-xxxl.png` | A 日 XXXL | 本库该日一条 | 真页面 · PASS |
| `shots/iphone16-year-expand-pr36.png` | B 年展开 | 态 D：9月 14 条 = 27 日 11 + 28 日 3。从 #36 `f17c7f2` 拷入，便于本 PR 离线打开 | **#36 分支真页面**。main 上没有这张运行页 |
| `../recent-visual-round/shots/iphone16-closeout-idle-mix.png` | 最近（对照层次） | 图文声 + 看这条分控 | 真页面 · 最近 PASS。**不是**回看书页 |

B 真图与 A 年/月真图**不是同一天的库**。并排时看结构，不把 1 条和 14 条画成一次拍摄。

## 结构示意（storyboard.html，不是设备 PASS）

| 帧 | 方案 | 说明 |
| --- | --- | --- |
| 书页根 · 多年章节 | C′ | 无真页面 |
| 稀疏月展开 + 当天预览 | C′ | 用态 S 的 24 日一条 |
| 同日多条预览上限 | C′ | 用态 D 的 27 日：2 条 + 「还有 9 条」 |
| 嵌套月历抢高度 | C-cal | 用来否决，不是推荐稿 |
| 只有月精度 | A/B/C′ | 用户路径无法从留下创建；**NOT VERIFIED** |
| 长文 / 三图 / 混合 / 缺失 | C′ | 结构；混合层次对照最近真图 |
| 窄屏 / XXXL / 横屏 / iPad | 三案 | 横屏、iPad：**#34 NOT VERIFIED** |

## 未走查（不得写成 PASS）

| 项 | 状态 |
| --- | --- |
| C′ / C-cal 任何原生页 | 无实现 |
| 密集月真页面 | 无此库 |
| 长文、三张照片、图文声在回看预览 | 无 |
| 媒体缺失在书页 | 无 |
| 月精度、年精度用户路径 | 留下不能写；**NOT VERIFIED** |
| 书页展开/收起/换日后的播放 | **不得声称已验证** |
| 横屏、iPad、VoiceOver | **#34 NOT VERIFIED** |
| 冷启动 `lampy://` 与 Expo Go 抢协议 | 运行说明，不是本 PR 验收 |
| 320pt 窗 | 运行时造不出该机型；Jest ≠ 页面 |
