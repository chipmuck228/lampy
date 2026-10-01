# Lampy iOS spec

| 文件 | 内容 |
| --- | --- |
| `LAMPY_APP_PRODUCT_DESIGN_GUIDE.md` | 产品与体验基准 |
| `ios-navigation-account/` | 导航与未来账户入口方案（设计稿，未改运行代码） |
| `PHASE_0_DOMAIN_AUDIT.md` | 领域 / Service / Projection / Repository 复用表 |
| `PHASE_0_IMPLEMENTATION_PLAN.md` | 按独立 PR 拆分；PR-1 必须是纯文字个人闭环 |
| `PHASE_0_UNIMPLEMENTED.md` | 尚未真实存在的能力 |
| `PHASE_0_VERIFICATION.md` | 本轮命令与结果 |
| `FAMILY_CAPABILITY_AUDIT.md` | 家庭能力：产品已决定 vs 仓库已实现 |
| `FAMILY_DOMAIN_MODEL.md` | Family / Membership / 接收快照是家庭缓存 |
| `FAMILY_ACCESS_AND_SNAPSHOT.md` | 读取矩阵；退出后 App 内不可读接收快照 |
| `FAMILY_COMMANDS_AND_FAILURES.md` | 命令、失败码、幂等；F1 与未交付分开 |
| `FAMILY_IMPLEMENTATION_SLICES.md` | F0–F6；本轮仅 F1 |
| `lookback-book/` | 回看三案对照：A main 跳转、B #36 年页展开、C′ 时间书页。设计稿，不改运行代码 |
| `figma-visual-authority/` | **下一轮唯一设计依据**（Figma 视觉 ＋ 用户取舍 ＋ #50 契约）。只改说明，不写运行代码 |
| `recent-lookback-reading/` | #50 回看同页阅读与最近扫读的行为底稿。视觉 / 入口以 `figma-visual-authority/` 为准 |
| `personal-visual-details/` | 感受色点、回看日期行、首次三屏。运行中实现 |
| `testflight-beta-1/` | 第一份 TestFlight 预发布准备。不上传、不邀请 |
| `lookback-expand/` | #35 当时的年页展开契约。产品效力见 `lookback-book/`；#36 是 B 的备选实现 |
| `adr/` | `0001`–`0006`。`0006` 已接受：身份、成员、快照矛盾结论 |
