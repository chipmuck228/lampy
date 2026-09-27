# Splash → 最近 实拍

设备：iPhone 16 Simulator / 393pt / iOS 18.6。方案 `lampy`，包名 `app.lampy.ios`。
构建：`npx expo prebuild --platform ios` 后 `npx expo run:ios --device "iPhone 16"`。**改 `app.json` / `splash-icon.png` 必须重新 prebuild 并安装**，只刷新 JS 换不了系统 Launch Screen。
右上角齿轮是 Expo Dev Client，不是产品 UI。

未写 **PASS** 的项不得用 Jest 冒充页面。

| 文件 | 含义 | 结果 |
| --- | --- | --- |
| `iphone16-native-splash.png` | 冷启动原生 Launch：暖纸 `#F3F0E9` + 墨色 A | PASS |
| `iphone16-js-brand.png` | JS 品牌层同一底色、同一标识 | PASS |
| `iphone16-fade-over-recent.png` | 淡出中：「最近」、日期、正文已在最终位置，标识变淡 | PASS |
| `iphone16-recent-settled.png` | 淡出后有记录的首页 | PASS |
| `iphone16-resume.png` | 经 Safari 后台再打开，不重播品牌层 | PASS |
| `iphone16-lookback.png` | 进入回看 | PASS |
| `iphone16-return-from-lookback.png` | 返回「最近」，不重播品牌层 | PASS |
| `iphone16-reduce-motion-cut.png` | Reduce Motion：就绪后直接是首页，没有半透明 A 叠在正文上 | PASS |
| `iphone16-empty-home.png` | 卸装重装后的首次空库 | PASS |

## 状态

| 项 | 结果 |
| --- | --- |
| 冷启动（原生 → JS 品牌 → 淡出） | PASS。录屏逐帧。 |
| 热启动 / 后台恢复 | PASS。进程仍在时不重播。 |
| 从其他页返回 | PASS。回看 → 返回原来的位置。 |
| 首次空库 | PASS。卸装后重装。 |
| 已有记录 | PASS。 |
| 读取失败 | Jest：错误句在首页出现后可卸品牌层，不编造记录。模拟器未注入坏库。 |
| `getRecentLife` 永不返回 | Jest：4s 超时后无需触摸卸层；再挂载不重播。晚到的读取仍更新首页。 |
| 触摸跳过品牌层 | Jest。 |
| 首页先就绪、Reduce Motion 稍后为 true | Jest：等偏好，不提前 consume；为 true 后立刻卸。 |
| Reduce Motion 查询失败 | Jest：无动画卸层。 |
| 首页就绪但偏好一直不返回 | Jest：4s 超时仍卸层，不无限遮挡。 |
| Reduce Motion | PASS。`defaults write com.apple.Accessibility ReduceMotionEnabled`。 |
| Expo Dev Client 拉包 | 开发包可能短暂出现白底 “Downloading 100%”。Release 没有 Dev Client。产品 Launch Screen 与 JS 首帧均为纸色，未叠第二套 Logo。 |
| 横屏 / iPad Launch Screen | **NOT VERIFIED** |
| iOS 26.2 真机 | **NOT VERIFIED** |

检查：`npx tsc --noEmit`、Jest 393、`npx expo lint`（本轮无新增 error；`share/[id].tsx` 两处 error 是 main 原有）、`git diff --check`、`npx expo run:ios` Build Succeeded。
