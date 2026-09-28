# 回看展开 · 实现走查

设备：iPhone 16 模拟器 · iOS 18.6 · Dev Client `app.lampy.ios` · Metro 8081。
安装里 2026 年 9 月有 14 条日精度（27 日 11 + 28 日 3），**没有**「日子未确认」月。
横屏、iPad、VoiceOver：**#34 未验证**，本轮不算通过。

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 年页展开有记录的 9 月 | **PASS** | 不进月历。`9月 · 有14条记录` 下直接是 27 日、28 日。见 `shots/iphone16-year-expand.png` |
| 月份行 N 含日精度之和 | **PASS** | 11+3=14，与年页 `count` 一致 |
| 空月不可点 | **PASS** | 1–8、10–12 安静，无展开 |
| 月深链（Lampy 已在跑）`lampy:///lookback/2026/09` | **PASS** | 落到年页且 9 月已开，不是月历 |
| 冷启动月深链再按返回 | **未走完** | `terminate` 后 `lampy://` 被 Expo Go 抢走；本机 `osascript` / HID 点「返回原来的位置」无辅助访问，点不到 |
| 日页返回后仍展开、滚动仍在 | **未走完** | 同上，点不进 27 日、也点不了返回 |
| 只有月精度的月 | **未走** | 此安装没有仅 `occurredAtPrecision=month` 的月 |
| 展开读取失败 → 再试成功 | Jest | 运行中未造失败 |
| 横屏 / iPad / VoiceOver | **NOT VERIFIED** | 沿用 #34 |

Jest `lookback`：46 passed。**不等于**上表未走完的页面项。
