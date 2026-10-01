# 阶段 B · 最近扫读 · 走查

基线：#50 merge `6f4f36ce30f256d44c0a530744d8504539b3fc14`  
实现分支：`ios/recent-reading`  
家庭 / AI：关。不改回看。不加最近分页。不覆盖、不重传 TestFlight。不碰 Liuz17。不开始阶段 C。

后续产品决定：个人 MVP 不再跟随系统字号。下面旧 XXXL / Dynamic Type 走查**不是**固定字号版本的 PASS。

夹具只进可丢弃安装。本轮开发构建，后续分发另起 build number。

---

## 命令

在 `apps/ios`，实现 SHA 见本 PR head：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（life-icons / recent-note / save-echo / moment / leave-nav / recent-life） |
| 全量 Jest | 133 suites / 699 tests PASS |
| 改动文件 lint | `life-icons`：无本轮 error |
| `git diff --check` | PASS |

---

## 页面证据口径

静态稿、Jest **不是**运行 PASS。模拟器实际操作只能写「模拟器 PASS」，不能写「真机 PASS」。

| 层 | 结论 |
| --- | --- |
| 自动化 | PASS（上表）。保存反馈资格仍在 `recent-save-echo.test.ts`。长文初始六行由 `recentNoteVisibleLineLimit` 证明。后期改为固定字号后，生产文案走 `life-text`（`allowFontScaling={false}`）；旧「跟随系统字号」句只描述当时实现 |
| 模拟器实际操作 / 隔离安装 | **部分 PASS**。见下表。不是全量夹具 F。旧 XXXL / Dynamic Type 走查**不是**固定字号版本的 PASS |
| 真机 | **PASS**（固定字号，Liuz17）。运行 JS SHA 见文末「真机 · 固定字号」。未卸载、未清库、未重传 TestFlight |

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
| 最大字号稳定画面 | 模拟器 PASS（照片与底栏） | `09-xxxl-stable.png`：等 8s 后底栏完整；大字号纵排。`05` 仍是切换中残字 |
| 「看这条」最大字号 | 自动化 PASS；实页 **部分** | 常规字号 `09c-before-xxxl.png` 两处「看这条」完整。XXXL 切上后照片把文案顶出屏，`09c-xxxl-look-this.png` **没有**拍到可见的「看这条」，不把 XXXL 实页文案写成 PASS。实现已改为换行，不缩小系统字、不加 `hitSlop` |
| 小字号稳定画面 | 模拟器 PASS | `shots/10-extra-small.png`：提示完整，长文仍约 6 行 |
| 声音播放 / 暂停 / 续播 | 模拟器 PASS | `20-playing.png` 正在播放且仍在最近；`21-paused.png` 已暂停 56/59；`22-resumed.png` 从 56 后续播到 57。均未进详情 |
| 播放与打开分离 | 模拟器 PASS | 最近条同时有「播放 / 暂停」和「看这条」。点播放只改听的状态；点「看这条」才进详情（此前误点已打开详情页 `返回原来的位置`） |

---

## 实现对照（供复审，不是未走项的运行 PASS）

- 短文完整；长文最多 6 行；仅行数 > 6 时写「还有正文」。未测完先夹 6 行
- 图：`shouldPairRecentImages`（**非**大字号且**实际正文列** ≥ 280）才组带
- `RecentMoment` 始终稳定外层
- 保存反馈必须同时：最近路由当前聚焦、本次 focus 的 `getRecentLife` 已成功、目标 ID 在该次结果中、`AppState === active`。失焦、新读取开始或失败会清掉本次 `loadReady`。active 回调不得用失焦前的旧列表消费 pending。旧读取结果仍按 focus / request generation 拒绝。消费一次后，刷新或详情返回不重播
- 「看这条」允许换行；可见点击区 `minHeight` 48；不关系统缩放、不用 `hitSlop` 补救
- Figma Make 视觉取舍不再以本目录或 `figma-make-supplement.md` 为下一轮唯一依据。下一轮设计权威见独立 PR（`spec/figma-visual-authority/`）。**不实现于本 PR，不开始阶段 C**

---

## 收尾 · 最大字号「看这条」（2026-10-01）

运行 SHA：**`fd6923b24e7bd5520a673a17dcea5fbcf1a93f10`**（与 `origin/ios/recent-reading`、PR #51 head 一致）。  
环境：隔离机 `Lampy-recent-b-isol` UDID `144E9B83-7C64-46F3-8E15-A1DB3817E092`，iPhone 17 Pro / iOS 26.5，Dev Client `app.lampy.ios`，Metro `8083`。`content_size=accessibility-extra-extra-extra-large`。未碰 Liuz17，未重传 TestFlight。走查后已复位 `large`。

用户口径：最大字号下照片把操作顶出屏外**不算失败**。必须实际滚到该条末尾再判断。

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 滚到一条记录末尾 | 模拟器做到 | 先把隔离窗口钉到主屏 `{80,60}`，HID 才能带动列表。`51-xxxl-after-type.png` 照片占满首屏；`51-xxxl-scroll4.png` / `51-xxxl-end1.png` / `51-xxxl-caption-before-tap.png` 已过照片，到条尾控件 |
| 「看这条」全文 + 箭头完整可见 | **NOT VERIFIED** | 条尾只稳定看到一条短横与箭头（`51-xxxl-caption-before-tap.png`）。未见完整三字「看这条」。自动化仍证明字符串未裁、可换行；**不能**把测试或未见全文的截图写成可达性 PASS |
| 不被底栏挡住 | 该帧模拟器可见 | `51-xxxl-caption-before-tap.png`：条尾控件在下一张照片之上、底带之上，没有被「最近 / 回看」挡住 |
| 可点击并进入详情 | **NOT VERIFIED** | 钉窗后在 y=20–27% 连点，画面未进详情（`51-xxxl-tap-y22.png` 与点前相同）。不能证明点到了，也不能证明点不了 |
| 详情返回位置 | **NOT VERIFIED** | 未进入详情，无返回可验 |

照片顶出屏外：按口径不记失败。  
本项**不是**运行 PASS。真机当时仍 **NOT VERIFIED**（隔离机，不是 Liuz17）。

---

## 真机 FAIL · 整片垂直裁切（2026-10-01，用户）

设备：**Liuz17 / iPhone 17 Pro / iOS 26.2**。未卸载、未清库、未重传 TestFlight。

真机当时加载的 JS SHA：**未从手机读到，不得把这次 FAIL 自动记到当时 Git head**（`3faac89` / `fd6923b` 只是仓库状态）。复测时从 Metro bundler 或摇一摇「JS 包」核对实际 SHA。

| 页 | 结果 |
| --- | --- |
| 最近 | **FAIL**。声音说明、播放、日期、「看这条」垂直裁切 |
| 回看 | 同类文字和「看这条」完整 |

根因（对照组件树，不是只修换行）：

1. 最近每条包在 `Animated.View`（保存回声）。iOS 原生动画层默认裁溢出，字形墨水出了 RN 盒就被切。回看摘录是普通 `View`。
2. 最近声音 / 播放 / 感受 / 「看这条」写了**固定 `lineHeight`**。`fontSize` 会跟系统缩放，`lineHeight` 不会。最大字号下行盒矮于字形。回看正文本身没有死行高。
3. 底带 `painted` 高度在字号切换后会留着常规字号的旧测量。

修复不关系统缩放、不封顶字号、不删内容、不改媒体、不做 Figma 改版。自动化不是真机 PASS。

### 真机复测（通过自动化之后）

确认 Metro / 开发客户端加载的是本修复 SHA，再在 **Liuz17** 上：

1. 不杀进程：常规 → 最大 → 小 → 常规。每一档看最近：正文、日期、感受、声音说明、播放、「看这条」、底带都不裁；滚到条尾可点。
2. 最大字号后完全退出再冷启动，再看最近同样几项。
3. 点「看这条」进详情，返回位置和播放状态仍对。
4. 对照回看：不应回退。
5. 结果单独记「真机 PASS / FAIL」+ **实际 JS SHA**。模拟器或测试不得代替。

---

## 真机 · Face ID 后黑屏

Liuz17 报告：Face ID 通过后整屏黑、什么都不显示。不能把该现象自动记到某一个旧 head。

处理：不要把 `overflow: 'visible'` 写在带 native-driver opacity 的 `Animated.View` 上（Face ID 进出时 iOS 可能整窗不合成）。外壳改回普通 `View`；解锁成功且 `active` 时立刻 `allowScreenCapture`。根层用纸色，避免底下露出系统黑底。

复测：确认 Metro 加载本修复 SHA → Face ID → 应回到纸色最近页，不是黑屏。仍不合并。

---

## 真机 · 固定字号（2026-10-01，用户）

设备：**Liuz17 / iPhone 17 Pro / iOS 26.2**。Dev Client `app.lampy.ios`，本仓库 Metro `8083`（LAN `192.168.31.139`）。未卸载、未清库、未重传 TestFlight。未拿 #52 / 文档 head 代替运行包。

实际运行 JS SHA：**`a2920c4ea9b1a8687753071eaebba9767566cced`**（`Use a fixed app type scale instead of following Dynamic Type.`）。

核对：该 SHA 于 21:16:53 +0800 落在 `ios/recent-reading`。Metro `8083` 的 iOS 包在 **21:23:27** 打完后，有个人记录的客户端立刻 `first-run completed`。随后同一条连接上出现本机保护与 Face ID 日志（21:24:43–21:25:32）。8082 只绑 `127.0.0.1`；8081 是 `lampy-guide`，不是本仓库。不是仓库 head 的口头替代。

用户四项均为 **真机 PASS**：

| 项 | 结论 |
| --- | --- |
| 系统常规字号与最大字号各看一次「最近」 | **PASS**。应用文字大小一致（不再跟随系统字号）。正文、日期、播放和「看这条」完整可见可点 |
| 「回看」「留下」「本机设置」各看一次 | **PASS**。无裁切，长内容可滚动，操作入口可达 |
| 留下一条文字＋照片＋录音 | **PASS**。保存、播放、暂停续播、详情返回；草稿与位置正常 |
| 开启本机保护后后台返回 | **PASS**。Face ID 期间仍遮挡。Metro 同期：`setting: on` 后 `background`/`active` 均为 `cover: true`、`locked: true`，认证中保持遮挡，解锁后 `cover: false` |

旧 XXXL / Dynamic Type 走查（隔离机未验证、「最近」垂直裁切 FAIL、Face ID 黑屏）仍是历史记录，**不是**本 SHA 的 PASS。

#51 本 SHA 无新增阻塞，可普通合并。#52 仍独立做设计复审，不随本表合并。
