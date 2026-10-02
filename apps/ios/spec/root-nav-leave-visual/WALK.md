# 最近／回看底带与「＋ 留下」视觉 · 走查

Base：当时 `origin/main`（#59 merge）。分支 `ios/root-nav-leave-visual`。只改本轮 `apps/ios`。家庭入口关闭。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

附件底带图 `image(20261002-154758).png` **未找到**，按文字规格实现。

实现 SHA、PR head 见文末「版本」；合并前再核远端。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（leave-fab 均匀底与滚动/目录显隐、recent-leave-fab 原预期、catalog 实页开合、底带） | **PASS** |
| 本轮 ESLint `leave-fab.tsx` / `leave-fab.test.tsx` | **PASS** 0 errors |
| `git diff --check -- apps/ios` | **PASS** |
| `git diff` `recent-leave-fab.ts` / `recent-leave-fab.test.ts` | 空 |

## 自动化（Jest）

| 项 | 结果 |
| --- | --- |
| 两页底带顺序均为 最近 \| 回看 | **PASS**（Jest） |
| 当前项 `selected`，点击不调用 `onOther` | **PASS**（Jest） |
| 另一项仍调用现有导航回调 | **PASS**（Jest） |
| 触控区域 ≥ 48pt | **PASS**（Jest） |
| 末尾避让 = 按钮高 + 距带间距 + 余量，不含导航带高 | **PASS**（Jest） |
| `recent-leave-fab.test.ts` 显隐预期未改 | **PASS**（Jest，文件无 diff） |
| 滚动隐藏：外壳不叠第二层静态 `opacity: 0`；不可点、无障碍隐藏 | **PASS**（Jest 属性） |
| 目录强制隐藏：可见 → 打开目录 → 整颗立刻到 0 → 关闭目录后恢复；不改滚动 opacity | **PASS**（Jest 组件 + 回看实页） |
| 无三段高光层；底为 `paperDeep`，字为 `sage` | **PASS**（Jest 属性） |

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
| 5 | 目录开合时按钮显隐 | Jest 实页：可见 → 开目录立刻藏 → 关目录恢复 | NOT VERIFIED | NOT VERIFIED（未明确测目录） |
| 6 | 下滚 / 上滚 / 停止后的留下显隐 | Jest 原预期保留 | NOT VERIFIED | **PASS**（报告：持续下滚整颗消失，停 / 上滚按原规则回来） |
| 7 | 短屏、横屏；iPad 左栏 | 布局单测含 rail 112 | NOT VERIFIED | NOT VERIFIED |
| 8 | 播放续播、留下保存返回、本机保护后台遮挡 | 未改这些路径 | NOT VERIFIED | NOT VERIFIED |

## 留下显隐行为核对

| 文件 | 相对本轮开始 `3c9ce30` / `origin/main` |
| --- | --- |
| `src/screens/recent-leave-fab.ts` | 无 diff |
| `useLeaveFabMotion` 函数体 | 无行为改动 |
| `recent-leave-fab.test.ts` | 无 diff，预期行为未改 |

两种隐藏分开：滚动仍用原来的 380ms 淡出，参数未改。目录打开时外层立刻到 0，并禁用点击 / VoiceOver，不写滚动 `opacity` / `shift`，因此不影响滚动恢复动画。真机滚动显隐 **PASS**（报告）。真机目录开合 **NOT VERIFIED**，不把滚动 PASS 扩过去。

## 运行环境

| 项 | 值 |
| --- | --- |
| Metro | `192.168.31.139:8085`，`lampy-root-nav-leave`，`ios/root-nav-leave-visual` |
| 原生安装版本 | **未确认** |
| 设备已加载 JS SHA | **未确认**（8085 日志有本机保护与「已有个人记录」，未隔离、未截图、未跟手势） |
| 是否第二套按钮 / 旧版残留 | 源码每页一份 `LeaveFab`。运行中是否叠了旧包 **未确认** |

隔离安装、模拟器画面、真机目录开合、VoiceOver：**NOT VERIFIED**。真机滚动显隐按报告记 **PASS**。未卸 Liuz17，未往个人库写夹具。

## 仍需真机验证

- 回看：按钮可见 → 打开目录 → 整颗立刻消失且不可点 → 关闭目录后是否按滚动状态回来。此项未测，不沿用滚动 PASS。
- 可见态是否均匀米色、没有三段色带；在纸底和照片上是否可辨。
- 回看 `book` 字形、VoiceOver 当前项、末条避让。
- 隐藏态 VoiceOver 不可聚焦。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `9d15a1648ab6725e212a472580faf15def055949`（#59）。当时 `gh api`，不是永恒基线。 |
| 本轮开始远端 head | `90542fb7816b209da375bceeffea7fc85a73342d` |
| 实现 SHA | `e80811bed192bf6c998a6ed7fd15f9b00527d2bf`（本地） |
| PR head | 推送后以 GitHub 为准 |
