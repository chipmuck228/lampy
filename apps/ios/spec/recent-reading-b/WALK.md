# 阶段 B · 最近扫读 · 走查

基线：#50 merge `6f4f36ce30f256d44c0a530744d8504539b3fc14`  
实现分支：`ios/recent-reading`  
家庭 / AI：关。不改回看。不加最近分页。不覆盖、不重传 TestFlight。不碰 Liuz17。不开始阶段 C。

夹具只进可丢弃安装。本轮开发构建，后续分发另起 build number。

---

## 命令

在 `apps/ios`，实现 SHA 见本 PR head：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（recent-note / save-echo / moment / images / leave-nav / recent-life / life-page） |
| 全量 Jest | 132 suites / 697 tests PASS |
| 改动文件 lint | `index` / `recent-save-echo`：无本轮 error |
| `git diff --check` | PASS |

---

## 页面证据口径

静态稿、Jest **不是**运行 PASS。模拟器实际操作只能写「模拟器 PASS」，不能写「真机 PASS」。

| 层 | 结论 |
| --- | --- |
| 自动化 | PASS（上表）。保存反馈三则资格在 `recent-save-echo.test.ts`：详情失焦后 active 不消费；新 focus 读取未完成不得用旧列表；本次成功只消费一次，刷新/返回不重播。长文初始六行由 `recentNoteVisibleLineLimit` 证明 |
| 模拟器实际操作 / 隔离安装 | **部分 PASS**。见下表。不是全量夹具 F |
| 真机 | **NOT VERIFIED**。未上物理机，未碰 Liuz17，未重传 TestFlight |

---

## 隔离安装（模拟器）

可丢弃机 `Lampy-recent-b-isol`（UDID `144E9B83-7C64-46F3-8E15-A1DB3817E092`，iPhone 17 Pro / iOS 26.5）。Dev Client + 本仓库 Metro `8083`。未写 Liuz17，未动 `Lampy-guide-isol`。字号走查后已复位 `large`。

两图 / 三图 / 可读+缺失：写入该隔离库的 `Documents/SQLite/lampy.db` 与 `lampy-assets`（真实相册 JPEG，一张故意无文件）。**不是** PHPicker 留下：系统确认键不接受本机 HID 点击。声音条由留下页实录后保存。

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 短文完整 | 模拟器 PASS | `shots/01-short-saved.png`：`门口的风还在。` 整句，「看这条」无「还有正文」 |
| 保存回最近 | 模拟器 PASS | 留下后回到最近。回声落地已完全不透明 |
| 详情 | 模拟器 PASS | `shots/02-detail.png` |
| 详情返回位置 / 不重播回声 | 模拟器 PASS | `shots/03-detail-back.png` |
| 长文截断 | 模拟器 PASS | `shots/04-long-and-short.png`、`08`：约 6 行 +「看这条，还有正文」 |
| 长文初次测量跳动 | 不继续追拍第一毫秒。落地帧未见整篇先撑开再收。初始六行由自动化证明 | `04`、`08` |
| 三张可读图组带 | 模拟器 PASS | `shots/06-three-top.png`：横图独列 + 两张竖图并排 |
| 两张可读图组带 | 模拟器 PASS | `shots/07-two-photos.png`：两张竖图并排 |
| 可读图 + 缺失图 | 模拟器 PASS | `shots/08-mix-missing.png`：瀑布可读；完整提示「这张照片暂时找不到了，但这条记录还在。」 |
| 常规字号 | 模拟器 PASS | `06` / `07` / `08`（`content_size=large`） |
| 最大字号稳定画面 | 模拟器 PASS（照片与底栏） | `shots/09-xxxl-stable.png`：等待 8s 后底栏「最近 / 回看 / 留下」完整；大字号不再组带，改为纵排。`09b-xxxl-text.png`：「看这条」在该帧被裁成「看这」，不把整页文案写成 XXXL PASS。`05` 仍是切换中约 3s 的残字，不能当稳定态 |
| 小字号稳定画面 | 模拟器 PASS | `shots/10-extra-small.png`：提示完整，长文仍约 6 行 |
| 声音播放 / 暂停 / 续播 | 模拟器 PASS | `20-playing.png` 正在播放且仍在最近；`21-paused.png` 已暂停 56/59；`22-resumed.png` 从 56 后续播到 57。均未进详情 |
| 播放与打开分离 | 模拟器 PASS | 最近条同时有「播放 / 暂停」和「看这条」。点播放只改听的状态；点「看这条」才进详情（此前误点已打开详情页 `返回原来的位置`） |

---

## 实现对照（供复审，不是未走项的运行 PASS）

- 短文完整；长文最多 6 行；仅行数 > 6 时写「还有正文」。未测完先夹 6 行
- 图：`shouldPairRecentImages`（**非**大字号且**实际正文列** ≥ 280）才组带
- `RecentMoment` 始终稳定外层
- 保存反馈必须同时：最近路由当前聚焦、本次 focus 的 `getRecentLife` 已成功、目标 ID 在该次结果中、`AppState === active`。失焦、新读取开始或失败会清掉本次 `loadReady`。active 回调不得用失焦前的旧列表消费 pending。旧读取结果仍按 focus / request generation 拒绝。消费一次后，刷新或详情返回不重播
