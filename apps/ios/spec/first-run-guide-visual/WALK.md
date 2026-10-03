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

截图目录：`shots/`。隔离安装未拍前：

| 画面 | 改前 | 改后 | 环境 |
| --- | --- | --- | --- |
| 第一屏 | NOT VERIFIED | NOT VERIFIED | 未拍 |
| 第二屏 | NOT VERIFIED | NOT VERIFIED | 未拍 |
| 第三屏 | NOT VERIFIED | NOT VERIFIED | 未拍 |
| 短屏 / 横屏 / iPad | NOT VERIFIED | NOT VERIFIED | 未拍 |

静态稿或 Jest 不等于真机 / 模拟器 PASS。

## 隔离走查清单

| # | 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- | --- |
| 1 | 三屏画面与离线照片 | Jest 文案与 photo testID | NOT VERIFIED | NOT VERIFIED |
| 2 | 继续、返回、上滑 | Jest | NOT VERIFIED | NOT VERIFIED |
| 3 | 中途退出不完成，最后点击才完成 | Jest | NOT VERIFIED | NOT VERIFIED |
| 4 | 短屏、横屏、iPad | Jest 照片框 | NOT VERIFIED | NOT VERIFIED |
| 5 | Reduce Motion；动画中切后台 | Jest | NOT VERIFIED | NOT VERIFIED |
| 6 | VoiceOver 顺序与按钮标签 | 属性测试 | NOT VERIFIED | NOT VERIFIED |

未卸 Liuz17。不把旧模拟器 erase 当成清 Keychain，不改生产首次完成标记，不加重置入口。

## 与原型差异（已读附件）

已读本机 `Splash.tsx` / `index.css` / `App.tsx`。差异见 README。不是未找到附件。

## 仍需验证

- 可丢弃模拟器或隔离安装的三屏实拍。
- 短屏滚动后底部按钮可达。
- 原生 VoiceOver。
- 真机 Reduce Motion 与切后台。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `98e0fb6247ec672f916e7450bff0872847366a04`（#60 merge） |
| 实现 SHA | `7b93603d6247492dd0e4409cbc89b2062a14d4b4`（本地） |
| PR head | 推送后以 GitHub 为准 |
