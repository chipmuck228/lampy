# Lampy iOS spec

| 文件 | 内容 |
| --- | --- |
| `LAMPY_APP_PRODUCT_DESIGN_GUIDE.md` | 产品与体验基准 |
| `ios-navigation-account/` | 导航与未来账户入口方案（设计稿，未改运行代码） |
| `PHASE_0_DOMAIN_AUDIT.md` | 领域 / Service / Projection / Repository 复用表 |
| `PHASE_0_IMPLEMENTATION_PLAN.md` | 按独立 PR 拆分；PR-1 必须是纯文字个人闭环 |
| `PHASE_0_UNIMPLEMENTED.md` | 尚未真实存在的能力 |
| `PHASE_0_VERIFICATION.md` | 本轮命令与结果 |
| `family-account-multi-b/` | 阶段 B 账号与多家庭基础；门控保持关闭，运行边界见 WALK |
| `family-invite-share-design/` | 家庭邀请与分享新版阶段 A：多家庭、7 天单名额、历史分享、离开/转交/30 天清理；纯设计，入口关闭，公开注册须先实现账号删除 |
| `FAMILY_CAPABILITY_AUDIT.md` | 家庭能力：产品已决定 vs 仓库已实现 |
| `FAMILY_DOMAIN_MODEL.md` | Family / Membership / 接收快照是家庭缓存 |
| `FAMILY_ACCESS_AND_SNAPSHOT.md` | 读取矩阵；退出后 App 内不可读接收快照 |
| `FAMILY_COMMANDS_AND_FAILURES.md` | 命令、失败码、幂等；F1 与未交付分开 |
| `FAMILY_IMPLEMENTATION_SLICES.md` | F0–F6；本轮仅 F1 |
| `lookback-book/` | 回看三案对照：A main 跳转、B #36 年页展开、C′ 时间书页。设计稿，不改运行代码 |
| `recent-lookback-reading/` | 最近扫读与回看停留。阶段 A 设计对照（#50 已合）。Figma Make 视觉取舍见 `figma-make-supplement.md`，不塞进 #51，不开始阶段 C |
| `recent-reading-b/` | 阶段 B「最近」实现走查。回看仍不动 |
| `recent-visual-refinement/` | #54 最近第一轮视觉。从 main 新开，不续写 #53 |
| `recent-photo-reveal-impl/` | #56 最近照片显现实现走查。真机未观察到效果，已静态退路；不改 #55 spec |
| `account-settings-reading/` | 本机设置改版。附件源码缺失；只换展示，不重写本机保护 |
| `personal-visual-details/` | 感受色点、回看日期行、首次三屏。运行中实现 |
| `testflight-beta-1/` | 第一份 TestFlight 预发布准备。不上传、不邀请 |
| `lookback-expand/` | #35 当时的年页展开契约。产品效力见 `lookback-book/`；#36 是 B 的备选实现 |
| `life-album/` | 生活册。阶段 A 设计 #63。阶段 B 本机册子 `WALK-B.md`。阶段 C 排版探测与预览 `WALK-C.md`。不开始 D–E |
| `adr/` | `0001`–`0006`。`0006` 已接受：身份、成员、快照矛盾结论 |
| `family-dissolve-cleanup-e3/` | E3解散、立即收权、30天清理与隔离验收；家庭正式入口仍关闭 |
