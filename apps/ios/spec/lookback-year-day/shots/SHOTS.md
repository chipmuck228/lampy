# 回看年页 / 日页实拍

改前对照用 #24 合入后、本轮之前的月页走查图。未写 **PASS** 的项不得用 Jest 冒充。

| 文件 | 含义 | 结果 |
| --- | --- | --- |
| `../lookback-month/shots/iphone16-lookback-year.png` | 改前 · 十二个等权月份 | 对照 |
| `iphone16-year.png` | 改后 · iPhone 16 / 393pt / iOS 18.6 三列 + 列表 | PASS |
| `iphone16-year-xxxl.png` | 改后 · XXXL 不画三列 | PASS |
| `../lookback-month/shots/iphone16-lookback-day.png` | 改前 · 条目重复整段日期 | 对照 |
| `iphone16-day.png` | 改后 · 共享标题，日期精度不写时刻 | PASS |
| `iphone16-detail.png` | 精确 ID 详情 | PASS |
| `iphone16-day-back.png` | 返回仍在 9月24日 | PASS |
| `iphone16-day-xxxl.png` | XXXL 日页 | PASS |
| `iphone16-day-xxxl-end.png` | XXXL 可滚到条目（本库该日只有一条） | PASS |

## 未走查

| 项 | 状态 |
| --- | --- |
| 横屏 | **NOT VERIFIED** |
| iPad | **NOT VERIFIED** |
| 密集年 / 同日多条 / 三张照片 真页面 | **NOT VERIFIED**（本库 2026 只有 9 月一天一条） |
| iOS 26.2 真机 Liuz17 | **NOT VERIFIED** |
