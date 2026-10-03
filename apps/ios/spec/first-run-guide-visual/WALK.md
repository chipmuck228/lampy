# 首次使用三屏引导 · 走查

Base：合并 #60 后的 `origin/main`。分支 `ios/first-run-guide-visual`。只改本轮 `apps/ios`。未卸 Liuz17，未清个人库，未覆盖 TestFlight。

审阅起点：`53d7358ae0ee617f178a25fd6b98e5eb70dfa4ce`。当时远端已多一笔隔离走查 `50d05b43785cac5039b5c33d8444e8702b2da1ca`。本轮修测量与安全区，叠在该 head 上。实现 SHA、PR head 见文末「版本」。

## 命令

在 `apps/ios`：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（本轮 first-run 源文件） | **PASS**（无 first-run TS 错）。工作树里未跟踪的 `apps/ios/app/` 副本仍会让全量 tsc 报找不到 `../screens/*`，不是本轮改动 |
| 相关 Jest（first-run 决策、Gate、Guide、Scene、motion、layout、scroll、library、store） | **PASS** 28 |
| 本轮 ESLint | **PASS** 0 errors |
| `git diff --check`（本轮改动文件） | **PASS** |

## 自动化（Jest）

| 项 | 结果 |
| --- | --- |
| 空库未完成才展示；已有记录 / 读库失败 / 已完成跳过 | **PASS**（Jest） |
| 前两屏继续不写完成；最后「留下瞬间」才 finish | **PASS**（Jest） |
| 写入失败不标记完成 | **PASS**（Jest） |
| 返回上一屏 | **PASS**（Jest） |
| 长正文按屏幕 ID 记住高度；返回已读屏即使没有新测量仍可滚、未到底不翻页 | **PASS**（Jest） |
| 上滑进入下一屏后用目标屏测量决定能否继续滚 | **PASS**（Jest） |
| 未测完不当成「正文不需要滚动」 | **PASS**（Jest） |
| 尺寸变化才失效测量；分页偏移按页高对齐 | **PASS**（Jest） |
| 左右安全区非零、短横屏、旋转停在第二屏 | **PASS**（Jest） |
| 长正文未到底不上滑翻页；最后一屏上滑不完成 | **PASS**（Jest） |
| 只在 AppState=active 且未开 Reduce Motion 时启动页动画 | **PASS**（Jest） |
| Reduce Motion 静态完整显示 | **PASS**（Jest） |
| 动画中切后台仍停在当前页，不完成 | **PASS**（Jest） |
| 快速翻页不完成、不丢页 | **PASS**（Jest） |
| 无「不必翻找」「进入 Lampy」「自己的生活记录」 | **PASS**（Jest） |

## 改前／改后画面

截图目录：`shots/`。

| 画面 | 改前 | 改后 | 环境 |
| --- | --- | --- | --- |
| 第一屏 | 未拍旧引导 | `iphone16-screen1.png` | Lampy-pr61-fix · iPhone 16 / iOS 18.6 |
| 第二屏 | 未拍旧引导 | `iphone16-screen2.png` | 同上 |
| 第三屏 | 未拍旧引导 | `iphone16-screen3.png` | 上一轮 isol 实拍，文案与照片未改 |
| 留下瞬间之后 | — | `iphone16-after-finish.png` | 上一轮 isol；落到留下页 |
| 切后台 | — | `iphone16-background-home.png` / `iphone16-after-background.png` | Home 后仍停第一屏，未完成 |
| 第二屏横屏 | — | `iphone16-landscape-screen2.png` | 当时进度还是「2/3」，叠了 Expo Inspect overlay |
| 短屏竖屏 | — | `se3-screen1.png` | Lampy-pr61-se · iPhone SE 3 / iOS 18.6 |
| 短屏横屏 | — | `se3-landscape.png` | simctl 截图像素是竖幅，画面本身是横屏第一屏 |

Jest 不等于真机 PASS。

## 隔离走查清单

| # | 项 | 自动化 | 模拟器 | 真机 |
| --- | --- | --- | --- | --- |
| 1 | 三屏画面与离线照片 | Jest 文案与 photo testID | **PASS**（iPhone 16 一二屏本轮；第三屏沿用 isol） | NOT VERIFIED |
| 2 | 继续、返回、上滑 | Jest | 继续 **PASS**（一度打到第二屏）；上一屏点按未打中，未记 PASS；上滑未走 | NOT VERIFIED |
| 3 | 中途退出不完成，最后点击才完成 | Jest | Home 后再开仍第一屏 **PASS**；本轮 HID 随后失效，未再点「留下瞬间」。完成后不重播沿用 isol | NOT VERIFIED |
| 4 | 短屏、横屏、旋转停在第二屏 | Jest | SE 竖屏 **PASS**（标题换行、页宽未溢出）；SE 横屏有实拍；iPhone 16 第二屏旋转仍 2/3 **PASS**（overlay 在）。短屏长正文滚动：当前定稿文案在 SE 竖屏未超出，**未看到内滚** | NOT VERIFIED |
| 5 | Reduce Motion；动画中切后台 | Jest | SE 开了 Reduce Motion 默认后第一屏完整静态；iPhone 16 Home 后再开仍第一屏、未完成。后台收到 RM 查询的实机时序 **NOT VERIFIED** | NOT VERIFIED |
| 6 | VoiceOver 顺序与按钮标签 | 属性测试 | NOT VERIFIED | NOT VERIFIED |

未卸 Liuz17。本轮新建 `Lampy-pr61-fix`（`B1047EC0-5634-48FF-B1BF-DBF2F4B38054`）与 `Lampy-pr61-se`（`911252DD-F91F-4397-90DB-A507DD0B00F7`）。Metro `127.0.0.1:8086`，不广播给真机。不把旧模拟器 erase 当成清 Keychain。

## 与原型差异（已读附件）

已读本机 `Splash.tsx` / `index.css` / `App.tsx`。差异见 README。不是未找到附件。

## 模拟器观察（本轮）

- 第一屏照片仍是窗框与暖光，第二屏大面积米色，第三屏植物叶片。裁切差异，不是缺图。
- iPhone SE 竖屏标题折成两行，footer「继续」仍在屏内。
- 第二屏旋转后仍停在第二屏，没有跳到第三屏或露出半页正文。当时进度还是数字「2/3」；本轮已改成短线段，该画面未重拍。
- 切后台再回来没有写成完成、没有重播到留下页。
- 点按「上一屏」本轮没打中。后半段 HID 点按不再进屏，不把失败写成产品缺陷。

本轮又按 Figma splash 改了字色、右侧留白、照片淡入、文案块淡入、短线段进度、顶栏「图标+Lampy」，并修正「一杯咖啡，一段午后。」。这些画面未重走模拟器，上表旧截图仍是改前数字进度。

## 仍需验证

- 新字色、短线段进度、淡入和顶栏标识的模拟器／真机观感。
- 模拟器返回、上滑、短屏长正文真正溢出时的内滚。
- 原生 VoiceOver。
- 真机 Reduce Motion 查询在后台返回、真机三屏（Liuz17 已有记录，不应为验收清库）。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 GitHub `main` | `98e0fb6247ec672f916e7450bff0872847366a04`（#60 merge） |
| 审阅起点 | `53d7358ae0ee617f178a25fd6b98e5eb70dfa4ce` |
| 本轮叠上的远端 | `50d05b43785cac5039b5c33d8444e8702b2da1ca` |
| 实现 SHA | 推送后以 GitHub 为准 |
| PR head | 推送后以 GitHub 为准 |
