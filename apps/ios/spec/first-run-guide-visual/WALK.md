# 首次使用三屏引导 · 走查

Base：合并 #60 后的 `origin/main`。分支 `ios/first-run-guide-visual`。只改本轮 `apps/ios`。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

实现 SHA、PR head 见文末「版本」。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 相关 Jest（first-run 决策、Gate、Guide、Scene、motion、library、store） | **PASS** 22 |
| 本轮 ESLint | **PASS** 0 errors |
| `git diff --check -- apps/ios` | **PASS** |

## 自动化（Jest）

| 项 | 结果 |
| --- | --- |
| 空库未完成才展示；已有记录 / 读库失败 / 已完成跳过 | **PASS**（Jest） |
| 前两屏继续不写完成；最后「留下瞬间」才 finish | **PASS**（Jest） |
| 写入失败不标记完成 | **PASS**（Jest） |
| 返回上一屏 | **PASS**（Jest） |
| 长正文未到底不上滑翻页；最后一屏上滑不完成 | **PASS**（Jest） |
| Reduce Motion 静态完整显示 | **PASS**（Jest） |
| 动画中切后台仍停在当前页，不完成 | **PASS**（Jest） |
| 快速翻页不完成、不丢页 | **PASS**（Jest） |
| 无「不必翻找」「进入 Lampy」「自己的生活记录」 | **PASS**（Jest） |

## 改前／改后画面

截图目录：`shots/`。本轮隔离模拟器：

| 画面 | 改前 | 改后 | 环境 |
| --- | --- | --- | --- |
| 第一屏 | 未拍旧引导 | `iphone16-screen1.png` | Lampy-pr61-isol · iPhone 16 / iOS 18.6 |
| 第二屏 | 未拍旧引导 | `iphone16-screen2.png` | 同上 |
| 第三屏 | 未拍旧引导 | `iphone16-screen3.png` | 同上 |
| 留下瞬间之后 | — | `iphone16-after-finish.png` | 落到留下页（现有 `leaveHref('recent')`） |
| 短屏 / 横屏 / iPad | NOT VERIFIED | NOT VERIFIED | 未拍 |

Jest 不等于真机 PASS。本轮模拟器只覆盖竖屏 iPhone 16。

## 隔离走查清单

| # | 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- | --- |
| 1 | 三屏画面与离线照片 | Jest 文案与 photo testID | **PASS**（竖屏 iPhone 16；见下差异） | NOT VERIFIED |
| 2 | 继续、返回、上滑 | Jest | 继续 **PASS**；返回点按未打中，未记 PASS；上滑未走 | NOT VERIFIED |
| 3 | 中途退出不完成，最后点击才完成 | Jest | 最后「留下瞬间」进留下页 **PASS**；中途退出未走 | NOT VERIFIED |
| 4 | 短屏、横屏、iPad | Jest 照片框 | NOT VERIFIED | NOT VERIFIED |
| 5 | Reduce Motion；动画中切后台 | Jest | NOT VERIFIED | NOT VERIFIED |
| 6 | VoiceOver 顺序与按钮标签 | 属性测试 | NOT VERIFIED | NOT VERIFIED |

未卸 Liuz17。模拟器是新建 `Lampy-pr61-isol`（UDID `0AE42459-1D9B-463E-A51E-3D56DC5CBF13`），Metro `127.0.0.1:8086`，不广播给真机。不把旧模拟器 erase 当成清 Keychain。

## 与原型差异（已读附件）

已读本机 `Splash.tsx` / `index.css` / `App.tsx`。差异见 README。不是未找到附件。

## 模拟器观察（本轮）

- 第一屏照片是窗框与暖光，不是整杯咖啡特写（`cover` 裁切）。
- 第二屏照片裁成大面积晨光米色，花朵几乎看不见。
- 第三屏是植物叶片，灯没进画面。
- 这些是裁切差异，不是运行时缺图。文案、进度、继续／留下瞬间与定稿一致。

## 仍需验证

- 模拟器返回、上滑、短屏、横屏、iPad。
- 原生 VoiceOver。
- 真机 Reduce Motion 与切后台。
- 真机三屏（Liuz17 已有记录，不应为验收清库）。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `98e0fb6247ec672f916e7450bff0872847366a04`（#60 merge） |
| 实现 SHA | `7b93603d6247492dd0e4409cbc89b2062a14d4b4`（本地） |
| PR head | `53d7358ae0ee617f178a25fd6b98e5eb70dfa4ce`（走查前远端） |
