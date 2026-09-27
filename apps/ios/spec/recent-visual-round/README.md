# 「最近」视觉：同日边界与操作字形

> 范围：只改 `apps/ios`「最近」展示层和必要测试。
> 基线：`origin/main` @ `469b7c5`（#31 阅读层次 + #30 按 Asset ID 暂停已在同一 main）。
> 不改 Moment / Asset / 发生日期 / 个人保存 / 播放器状态机 / 家庭门控 / 照片权限。`identityLoopAccepted` 不变。家庭入口保持关闭。

依据：`LAMPY_APP_PRODUCT_DESIGN_GUIDE.md` §0、§10.2、§12–13；`ui-round-1` 的去 Card 与阅读宽度。

#30+#31 合并后的 A→B→A 真机听音仍 **NOT VERIFIED**，本轮不声称已回归。

## 对照两种同日分隔

对照稿：`storyboard.html`。

| 方案 | 做法 | 阅读效果 |
| --- | --- | --- |
| A. 只靠留白 | 日块 `gap` 40，同日条 `gap` 36，无线 | 纯文字同日清楚。混合记录（字／图／声／感受／看这条）变长后，下一条容易像同一段的续写。 |
| B. 同日短细线 | 仅在同日第 2 条及之后、正文列左缘画 72pt 浅线；不同日之间、首条前、末条后不加 | 同日条目有轻边界，仍不是表格行，也不是卡片描边。 |

**本轮选择 B。** 理由：#31 之后单条内部层次变多，只靠 36pt 留白不够分开两条生活；短线对齐正文列、不到页边，去掉后结构仍靠日期和留白成立（去 Card）。不用满宽线，避免列表表格感。

## 操作

- 播放／暂停／再听一次：简洁符号 **配文字**。只由「最近」传 `markedActions`；详情／留下／回看默认仍是纯文字。VoiceOver 仍读「播放，4秒」，符号 `accessible={false}`。
- 「看这条」保留文字，右侧低强调 `›` 与文字同一行居中。触达 48pt 在外层 `Pressable`，文字本身不再撑到 48pt。
- 「最近」idle 不画空进度轨。播放／暂停且有进度后画 3pt 青色通栏轨（`progressWhenHeard`），避免被看成 72pt 同日发丝线。详情默认行为不变。
- 播放与打开仍是两个控件，触达 ≥ 48pt。

## 走查

示意对照：`storyboard.html`。运行中 App 实拍：`SHOTS.md`。

| 状态 | 结果 |
| --- | --- |
| 同日两条纯文字 | Jest：第二条有 `recent-day-rule`，第一条没有 |
| 稀疏不同日 | Jest：新日第一条无线 |
| 文字＋照片＋声音＋感受 | Jest + iPhone 16 实拍：层次顺序仍在；短线在「看这条」与下一条正文之间，不贴住下一句 |
| 仅声音、媒体缺失 | Jest + iPhone 16 实拍：占位句与 `▶ 播放` 仍在 |
| 三图长记录真页面 | iPhone 16：**PASS**（`shots/iphone16-recent-glyphs.png`） |
| 最大字号换行 | iPhone 16：**PASS**（日期／占位／播放／看这条换行；细线不贴下一条） |
| 符号未漏到详情 | iPhone 16：**PASS**（详情「播放」无 ▶） |
| 「看这条 ›」同行居中 | iPhone 16 常规 + XXXL：**PASS** |
| idle 无空进度轨 | iPhone 16 图＋声 / 仅声音：**PASS** |
| 播放／暂停 heard 轨 | Jest：**PASS**；运行中 App：**NOT VERIFIED** |
| 横屏 | **NOT VERIFIED** |
| iPad | **NOT VERIFIED** |
| Liuz17 真机画面 | **NOT VERIFIED**（设备通道超时） |
| #30＋#31 A→B→A 最终界面听音 | **NOT VERIFIED**（模拟器未听成；真机未听） |
