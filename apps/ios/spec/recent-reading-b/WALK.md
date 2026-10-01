# 阶段 B · 最近扫读 · 走查

基线：#50 merge `6f4f36ce30f256d44c0a530744d8504539b3fc14`  
实现分支：`ios/recent-reading`  
家庭 / AI：关。不改回看。不加最近分页。不覆盖、不重传 TestFlight。不碰 Liuz17。

夹具只进可丢弃安装。本轮开发构建，后续分发另起 build number。

---

## 命令

在 `apps/ios`，实现 SHA 见本 PR head：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（recent-note / save-echo / moment / images / leave-nav / recent-life / life-page） |
| 全量 Jest | 132 suites / 693 tests PASS |
| 改动文件 lint | `index` / `recent-note` / `recent-moment` / `recent-save-echo` / `life-page` / `moment-images`：无本轮 error |
| `git diff --check` | PASS |

---

## 页面证据口径

静态稿、Jest **不是**运行 PASS。模拟器实际操作只能写「模拟器 PASS」，不能写「真机 PASS」。

| 层 | 结论 |
| --- | --- |
| 自动化 | PASS（上表） |
| 模拟器实际操作 / 隔离安装 | **部分 PASS**。见下表。不是全量夹具 F，不能把未走项写成 PASS |
| 真机 | **NOT VERIFIED**。未上物理机，未碰 Liuz17，未重传 TestFlight |

---

## 隔离安装（模拟器）

新建可丢弃机 `Lampy-recent-b-isol`（UDID `144E9B83-7C64-46F3-8E15-A1DB3817E092`，iPhone 17 Pro / iOS 26.5）。从已有 Dev Client 安装，Metro 走本仓库 `8083`，**不是** 8081 上的 `lampy-guide`。空库。未写 Liuz17，未动 `Lampy-guide-isol` 的库。

JS 为本工作区未提交前的实现（随后同一内容提交）。字号走查后已复位 `large`。

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 短文完整 | 模拟器 PASS | `shots/01-short-saved.png`：`门口的风还在。` 整句，「看这条」无「还有正文」 |
| 保存回最近 | 模拟器 PASS | 留下后回到最近，短条已在。回声 420ms 内结束，落地帧已是完全不透明，**没有**抓到半透明中间帧 |
| 详情 | 模拟器 PASS | `shots/02-detail.png`：`返回原来的位置`、全文、发生精度 |
| 详情返回位置 / 不重播回声 | 模拟器 PASS | `shots/03-detail-back.png`：仍停在短条，无再次淡入 |
| 长文截断 | 模拟器 PASS | `shots/04-long-and-short.png`：约 6 行 + 省略，「看这条，还有正文」。同日短条在下，日期只出现一次 |
| 长文初次测量跳动 | 落地帧未见整篇先撑开再收。未能用连续帧证明「测量前的第一毫秒」。按实现：未测完先 `numberOfLines=6` | `04` |
| 最大字号切换 | **NOT VERIFIED（稳定态）** | `shots/05-xxxl-mid-switch.png` 是切换后约 3s，字形残缺，不能当稳定 XXXL PASS。复位 `large` 后 `04` 的布局恢复 |
| 两图 / 三图组带 | **NOT VERIFIED** | 隔离库未留下照片 |
| 缺失图 | **NOT VERIFIED** | 未造 unavailable 资产 |
| 播放与打开分离 | **NOT VERIFIED** | 未留下声音。短条只有「看这条」，没有播放控件 |

---

## 实现对照（供复审，不是未走项的运行 PASS）

- 短文完整；长文最多 6 行；仅行数 > 6 时写「还有正文」。未测完先夹 6 行，避免先整篇后截断
- 图：`shouldPairRecentImages`（**非**大字号且**实际正文列** ≥ 280）才组带。列宽 = 页宽扣安全区、gutter、日期轨 120 与轨距 32，再与 `recentColumnWidth` 取小。页面够宽但列不足 280 不组带。大字号一律纵排，**不是**「非常大字号才组带」
- `RecentMoment` 始终稳定外层。无反馈 `opacity=1`，有反馈绑动画值。切换 `echoId` / `echoing` 不拆正文、图、声音控件
- 回声：失焦立刻停并回到 1；动画中开 Reduce Motion 立刻停并完全显示；每次独立序号，旧完成回调不能改新动画；前台只认 `AppState === 'active'`。消费后不因后台返回、详情返回或刷新重播
