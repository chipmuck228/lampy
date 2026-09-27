# 回看月页实拍

未写 **PASS** 的项不得用 Jest 冒充设备走查。

| 文件 | 设备 | 结果 |
| --- | --- | --- |
| `iphone16-lookback-years.png` | iPhone 16 · 393pt · iOS 18.6 | PASS：回看年列表，时间未确认独立 |
| `iphone16-lookback-year.png` | 同上 | PASS：年页说明「不会把记录时间当成发生时间」 |
| `iphone16-lookback-month.png` | 同上 | PASS：七列月历 + 「有记录的日子」 |
| `iphone16-lookback-day.png` | 同上 | PASS：列表进入 9月24日 |
| `iphone16-lookback-detail.png` | 同上 | PASS：该条详情 |
| `iphone16-lookback-month-back.png` | 同上 | PASS：返回月页，月历与列表仍在 |
| `iphone16-lookback-month-xxxl.png` | 同上 · XXXL | PASS：够宽仍不画七列，只留列表 |
| `se3-375-lookback-month.png` | iPhone SE 3 · 375pt · iOS 18.6 | PASS：375−48=327≥308，仍画七列；不按「SE」机型藏月历 |

## 未走查

| 项 | 状态 |
| --- | --- |
| 320pt 窗（iPhone SE 1 / 5s） | **NOT VERIFIED**：当前运行时 iOS 18.6 / 26.3 / 26.5 无法创建该机型。Jest 覆盖 320→列表，不能代替页面。 |
| 横屏 | **NOT VERIFIED** |
| iPad | **NOT VERIFIED** |
| 密集月份 | **NOT VERIFIED**（本库 2026-09 只有一天） |
| iOS 26.2 真机 Liuz17 | **NOT VERIFIED** |
