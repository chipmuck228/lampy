# 回看同页连续阅读走查

实现分支 `ios/lookback-continuous-reading`，从最新 `origin/main`（#51 固定字号已合入，`4e64f4c`）新开。**没有**从 #51 旧分支或未合入实现复制。#52 Figma 视觉稿仍独立，本切片未全局替换未落地字体/配色。

Jest 与静态稿 **≠** 原生页面 PASS。未实际操作的项写 **NOT VERIFIED**。

## 本机命令（本轮）

在 `apps/ios`：

- `npx tsc --noEmit`：通过
- 相关 Jest：25 suites / 87 tests 通过（回看 application + screen + locate / race / catalog / reading）
- 改动文件 `eslint`：无 error（`lookback-chrome` 既有 `tryLocate` hook 依赖警告仍在）
- `git diff --check`：通过

未跑全库 Jest。未重传 TestFlight。未向 Liuz17 写夹具、未卸载或清空该机。

## 关键交互（实现）

- 可见阅读页是 `/lookback`，底带不变。顶部「回看 / 慢慢看 / 换一天」，目录覆盖层只列有记录的年、月和未确认范围；同时只展开一个月；选日后关闭目录。
- 新会话默认找最近一个有 exact/day 记录的日子；只月精度的月跳过；某月读取失败立即失败+重试，不继续跳；无明确日但有 year/month 精度则打开目录；只有整体 unknown 则打开该章；空库安静空态。
- 同进程返回恢复 scope、已加载分页、展开 ID、scrollY；先内容后滚动；`hasMore=false` 停止；删除的展开 ID 丢弃。
- 当天页首一次写日期、星期、真实条数；记录不重复同日日期；仅 exact 显示时刻；长文 6 行预览 + 原位展开/收起 +「阅读完整记录」（精确 Moment ID）。
- 分页复用 `getHistoryDay`；页尾相邻有记录日；不用横滑换日。
- 声音复用真实播放器，按 Asset ID 记进度；换日、开目录、离开暂停，返回不自动播。
- 旧年/月路由仍是一次性定位跳板；日深链与三种未确认路由保留。页面不查 SQLite。

## 模拟器

**NOT VERIFIED**。本轮没有用可丢弃安装走同日混合记录、目录、相邻日、冷深链、短屏/横屏/iPad 或 VoiceOver。

## 自动化

| 项 | 结果 |
| --- | --- |
| 默认范围、未确认、月读取失败 | **PASS**（`lookback-reading.test.ts`） |
| 分页恢复、hasMore 停止、删除展开 ID | **PASS**（application restore / keepExpandedIds） |
| 快速换日、迟到请求 | **PASS**（`lookback-book-race`） |
| 精确 ID、原位展开、多图/缺失媒体 | **PASS**（`lookback-reading.test.tsx`、`lookback-screen`） |
| 目录焦点及底层不可访问 | **PASS**（`lookback-catalog-a11y`） |
| 播放进度隔离、主动播放 | **PASS**（既有 clip playback 契约 + 回看不自动播；本轮未重跑 `use-recent-clip-playback` 全套） |
| 年定位滚目录、日定位滚阅读 | **PASS**（`lookback-book-locate` / `locate-day` / switch / stale / drag / rapid） |

## 真机（Liuz17 / 可丢弃安装）

下列全部 **NOT VERIFIED**：

- 同日长混合记录＋短文字＋单图＋仅声音
- 原位展开、连续加载、详情返回
- 目录选择、相邻日、冷深链
- 短屏、横屏、iPad 及 VoiceOver
- 声音换日 / 目录 / 详情后的暂停与续播
