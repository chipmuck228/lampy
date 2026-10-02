# 最近／回看底带与「＋ 留下」视觉 · 走查

Base：当时 `origin/main`（#59 merge）。分支 `ios/root-nav-leave-visual`。只改本轮 `apps/ios`。家庭入口关闭。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

附件底带图 `image(20261002-154758).png` **未找到**，按文字规格实现。

实现 SHA、PR head 见文末「版本」；合并前再核远端。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（底带、leave-fab 显隐、catalog reserve、navigation-band、lookback-book-adapt、recent-reading-hierarchy、lookback-origin） | **PASS** 9 suites / 40 tests |
| 本轮 ESLint | **PASS** 0 errors（`lookback-chrome` 原有 hooks warning，非本轮引入） |
| `git diff --check -- apps/ios` | **PASS** |
| `git diff` `recent-leave-fab.ts` / `recent-leave-fab.test.ts` | 空，行为文件未改 |

## 自动化（Jest）

| 项 | 结果 |
| --- | --- |
| 两页底带顺序均为 最近 \| 回看 | **PASS**（Jest） |
| 当前项 `selected`，点击不调用 `onOther` | **PASS**（Jest） |
| 另一项仍调用现有导航回调 | **PASS**（Jest） |
| 触控区域 ≥ 48pt | **PASS**（Jest） |
| 末尾避让 = 按钮高 + 距带间距 + 余量，不含导航带高 | **PASS**（Jest） |
| `recent-leave-fab.test.ts` 显隐预期未改 | **PASS**（Jest，文件无 diff） |

## 改前／改后画面

隔离安装未拍前，下列截图目录：`shots/`。

| 画面 | 改前 | 改后 | 环境 |
| --- | --- | --- | --- |
| 最近 + 底带 + 留下 | NOT VERIFIED | NOT VERIFIED | 真机 / 模拟器均未在本轮拍到 |
| 回看 + 底带 + 留下 | NOT VERIFIED | NOT VERIFIED | 同上 |
| 空库（原「留下第一条」仍在，浮动按钮规则未加藏） | NOT VERIFIED | NOT VERIFIED | 同上 |
| iPad 左栏 | NOT VERIFIED | NOT VERIFIED | 同上 |

未把静态稿或 Jest 写成真机 PASS。

## 隔离走查清单

| # | 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- | --- |
| 1 | 最近长混合记录与最后一条（播放 / 阅读完整记录在按钮之上） | Jest 结构 | NOT VERIFIED | NOT VERIFIED |
| 2 | 回看连续阅读、分页、相邻日 | 未改逻辑 | NOT VERIFIED | NOT VERIFIED |
| 3 | 空库原有显示规则 | 未改空态 | NOT VERIFIED | NOT VERIFIED |
| 4 | 最近／回看切换后的阅读位置 | 未改来源 / 恢复 | NOT VERIFIED | NOT VERIFIED |
| 5 | 目录开合时按钮显隐 | 未改 catalog 规则 | NOT VERIFIED | NOT VERIFIED |
| 6 | 下滚 / 上滚 / 停止后的留下显隐 | Jest 原预期保留 | NOT VERIFIED | NOT VERIFIED |
| 7 | 短屏、横屏；iPad 左栏 | 布局单测含 rail 112 | NOT VERIFIED | NOT VERIFIED |
| 8 | 播放续播、留下保存返回、本机保护后台遮挡 | 未改这些路径 | NOT VERIFIED | NOT VERIFIED |

## 留下显隐行为核对

| 文件 | 相对 `origin/main` |
| --- | --- |
| `src/screens/recent-leave-fab.ts` | 无 diff |
| `useLeaveFabMotion` 函数体 | 与 `origin/main` 逐行相同 |
| `recent-leave-fab.test.ts` | 无 diff，预期行为未改 |

若某项视觉必须改行为，本 PR **不实施**该行为修改。本轮未遇到必须改行为的视觉项。

## 仍需真机验证

- 系统 `book.open` 在目标 iOS 上的实际字形（类型包未收录该名）。
- 最后一条播放 /「阅读完整记录」滚到浮动按钮之上是否够用。
- 回看继续加载、重试、相邻日是否被按钮挡住。
- 目录开合后按钮显隐与改前是否一致。
- 横屏短屏、iPad 左栏与正文右边距对齐。
- VoiceOver：名称 + 已选中；图标不重复朗读。
- 向下 / 向上 / 停止滚动后的留下出现与消失。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `9d15a1648ab6725e212a472580faf15def055949`（#59）。以当时 `gh api` 为准，不是永恒基线。 |
| 实现 SHA | `443a7569b39090f7b355c087ac17c02801098eb3` |
| PR head | 推送后与实现 SHA 相同，若有文档补记再更新 |
