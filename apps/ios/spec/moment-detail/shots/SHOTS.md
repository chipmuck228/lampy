# 详情走查帧

基线 `f9416d9`。本机走查：iPhone 16 / iOS 18.6。Splash 横屏、iPad、iOS 26.2 真机仍 **NOT VERIFIED**。

## 改前（现有走查，未重拍）

| 文件 | 状态 |
| --- | --- |
| `before/text-only.png` | 回看日页进详情：日期小字、无精度、等权清单 |
| `before/text-fallback.png` | #22/#23 走查：回退日期句，分享贴在来源下 |

## 改后 · iPhone 16 / iOS 18.6

| 文件 | 路径 |
| --- | --- |
| `after/iphone16-text-only.png` | 精确 ID 详情：日期进入点、大约是这一天、正文、来源、分享 |
| `after/iphone16-from-lookback.png` | 回看 年→月→日→门口的风 |
| `after/iphone16-back-to-lookback-day.png` | 返回原来的位置，回到 9月27日 |
| `after/iphone16-back-to-recent.png` | 从详情回到「最近」 |
| `after/iphone16-missing.png` | 不存在的 ID：找不到，不换成别的记录 |
| `after/iphone16-recent-before-open.png` | 走查用的「最近」上下文 |

`npx tsc --noEmit`、Jest 404、`npx expo lint`（本轮无新增 error；`share/[id].tsx` 两处 error 是 main 原有）、`git diff --check`。

## 本轮未在模拟器上走到的形态

由 Jest + `storyboard.html` 覆盖，真机/模拟器帧标 **NOT VERIFIED**：

- 单图 / 三图 / 仅声音 / 图+声
- 缺失媒体、未知媒体（可读竖图 + 带尺寸缺失竖图的提示完整性由 Jest 覆盖）
- 长内容滚到末行
- 最大字号
- 读失败再试（模拟器只走到了「找不到」）
- 横屏详情
- iPad 详情
- iOS 26.2 真机
- Splash 横屏 / iPad / iOS 26.2（沿用 #26）
