# 感受点缀、回看日期行、首次三屏 · 走查

Base：`origin/main` `e7580e33f01429d9945ee2d8a2b5a3980b3c4e92`（#47 merge）。  
分支 `ios/personal-visual-details`。只改 `apps/ios`。家庭入口关闭。未卸 Liuz17，未清个人库。  
运行代码测试 SHA：`b9dfdbc5f3fb5d65221fa1c44f1b3e8668ad87d4`（上滑 / Reduce Motion 隔离机 + 之后真机抽查所跑的 JS）。其后若只有走查/PR 文档提交，不改这个对应关系。

横屏 / iPad / VoiceOver 未听音，记 **NOT VERIFIED**。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| 重新生成 Expo typed routes（`.expo/types/router.d.ts`，gitignore） | 生成后含 `/account-diagnostics` |
| `npx tsc --noEmit` | **PASS**（上一轮 FAIL 是本机缺少生成类型，不是 `account-screen` 代码错误） |
| 相关 Jest（含分页规则、`first-run-guide-motion`、`settleFirstRunMotion`） | **PASS** |
| 本轮 ESLint | **PASS** 0 errors |
| `git diff --check -- apps/ios` | **PASS** |

## 首次引导为什么被跳过

上一轮在 **擦除后的** iPhone 17 Pro（`E5013DFB`）上看到空「最近」，当时无法区分三种 skip。本轮在 Gate 打了 `[first-run] reason`：

| 安装 | Metro | 含义 |
| --- | --- | --- |
| 擦除后的旧模拟器 `E5013DFB` | `completed: true`，`hasPersonalRecords: false`，`recordsUnknown: false` | **旧完成标记还在 Keychain**。擦除 App 数据 / `erase` 清不掉 `lampy.first-run.v1` |
| 已有记录的模拟器 `4D4C1816` | `completed: true`，`hasPersonalRecords: true` | 完成标记 + 已有记录 |
| **新建** `Lampy-guide-isol`（`DEB86847`，iOS 26.5） | `needed`，`completed: false`，空库 | 三屏出现（上一轮「继续」） |
| **新建** `Lampy-guide-swipe`（`380CE848`，iOS 26.5） | `needed`，`completed: false`，空库 | 本轮上滑 / 最大字号 / Reduce Motion 走完三屏 |

不是读库失败。Liuz17 未重置。

## 隔离安装上的三屏（`Lampy-guide-isol`）

| 项 | 结果 |
| --- | --- |
| 第1屏构图 +「继续」 | **PASS**（`shots/after-guide-1.png`） |
| 第2屏构图 +「继续」 | **PASS**（`shots/after-guide-2.png`） |
| 第3屏 + 动画中切 Safari 再回 Lampy，场景完整可见 | **PASS**（`shots/after-guide-3-bg.png`） |
| 中途退出（未点「留下瞬间」就杀掉再开） | **PASS**（仍 `needed`，引导还在；`after-guide-reduce.png` / mid-exit 同屏 1/3） |
| Reduce Motion 开启后内容直接可见 | **PASS**（上一轮第一屏 `after-guide-reduce.png`；本轮走完三屏见下） |
| 最后一步「留下瞬间」才完成；再开不重播 | **PASS**（去留下页；再开空最近，`completed: true`；`after-guide-finish.png`、`after-guide-no-replay.png`） |
| 上滑翻页（默认字号，三屏） | **PASS**（`Lampy-guide-swipe`；`after-guide-swipe-1/2/3.png`。末屏再上滑仍停在 3/3，未完成） |
| 最大字号：正文先滚，到底再翻页 | **PASS**（短滑仍 1/3 并露出后文，`after-guide-swipe-max-scroll.png`；再上滑到 2/3，`after-guide-swipe-max-page.png`） |
| Reduce Motion 走完翻页，无位移动画 | **PASS**（`after-guide-reduce-1/2/3.png`；翻页后场景与文案立刻完整，无半透明/错位残留） |

## 回看 / 最近（示意库，非 Liuz17）

| 项 | 结果 |
| --- | --- |
| 日期行 `18日` / `周五` / 浅底 `2条` | **PASS**（`shots/after-lookback-date-row.png`） |
| 未确认入口独立 | **PASS**（`shots/after-unconfirmed.png`） |
| 最大字号日期行 | **PASS**（`accessibility-extra-extra-extra-large` 可见 `18日`、`2条`，折行未裁字；Dev Tools 挡了一部分） |
| 摘录 → 详情 → 返回 | **PASS**（详情 `门口的风` / `高兴` 无色点；返回可见同日两条。书页摘录条被 Dev Tools 挡住，以详情/日页为准） |
| 最近色点 / 未选 / 未知旧词 | **PASS**（上一轮示意库，本轮未改存储） |
| 播放 / 本机保护 | 模拟器未复验；真机见下 |
| 横屏 / iPad / VoiceOver | **NOT VERIFIED** |
| Liuz17 | **PASS**（见下；未卸、未清库、未重置引导） |

## 真机 Liuz17

不要卸、不要清库、不要重置首次引导。本轮 **未重置**。持有人已在该机跑完抽查，对应 JS 仍是 `b9dfdbc`。

| 项 | 结果 |
| --- | --- |
| 最近：已选感受有色点，未选无点，详情无色点 | **PASS** |
| 回看：日期行、摘录 → 详情 → 返回 | **PASS** |
| 回看：最大字号无裁切 | **PASS** |
| 播放走一次，无回归 | **PASS** |
| 本机保护走一次，无回归 | **PASS** |
| 横屏 / iPad / VoiceOver | **NOT VERIFIED** |

三屏请用 **新建** 模拟器或新设备，不要擦旧模拟器指望 Keychain 会清。
