# 回看适配与性能验收

独立实现 PR，基线 `origin/main` @ `96b03f1`（#38 merge）。不改家庭入口、不改个人 Moment / `occurredAtPrecision` / 最近按 `recordedAt` 分组。不先重构 `getLookbackBook` / `getHistoryDay`。

本轮只验收并修**看见的问题**：

| 面 | 要看见什么 |
| --- | --- |
| 横屏 | 书页仍可读：年份、月份、展开日、摘录、底带。不另做一套页 |
| iPad | 同一套内容宽 / 侧栏规则，不是复制页面 |
| VoiceOver | 年、月、日、摘录、「看这条」能被读到、能点 |
| 稀疏月 | 只有一天的月：展开后只有日期行，点开见摘录，不铺安静格 |
| 远处换日实页 | 同一月里远离首屏的日期，点了之后新日期和摘录进视口 |
| 性能 | 多年密集库上量首次打开与选日耗时。数字写进走查。不够才考虑限量读取 |

横屏 / iPad 按窗口宽高判断，不按机型名。Jest ≠ 原生 PASS。iPad 实页和 VoiceOver 手势保持 **NOT VERIFIED**，不得用 Jest 改写成 PASS。

走查库必须是独立、可丢弃的 `lookback-adapt.db`（库内 `lookback_adapt_fixture` 身份）。脚本拒绝 `lampy.db`、非空库和身份不符的库，并且只 INSERT、不 UPDATE。不能用「不删除原记录」代替保护个人库。详见 `WALK.md`。

性能栏记录的是 **数据读取完成耗时**（`getLookbackBook` / `getHistoryDay` resolve），不是首帧可见；数字只代表当时那台模拟器及该夹具库。测量代码不进正式运行路径。
