# 阶段 B · 最近扫读 · 走查

基线：#50 merge `6f4f36ce30f256d44c0a530744d8504539b3fc14`  
实现分支：`ios/recent-reading`  
家庭 / AI：关。不改回看。不加最近分页。不覆盖、不重传 TestFlight。不碰 Liuz17。

夹具 F 只进可丢弃安装。本轮开发构建，后续分发另起 build number。

---

## 命令

在 `apps/ios`，实现 SHA 见本 PR head：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（recent-note / save-echo / moment / images / leave-nav / recent-life） |
| 全量 Jest | 132 suites / 687 tests PASS（基线 129 / 678；新增本轮测试） |
| 改动文件 lint | `index` / `recent-note` / `recent-moment` / `recent-save-echo` / `life-icons` / `moment-images`：无本轮 error。`leave.tsx` 仅既有 exhaustive-deps warning |
| `git diff --check` | PASS |

---

## 页面证据口径

静态稿、Jest **不是**运行 PASS。模拟器实际操作只能写「模拟器 PASS」，不能写「真机 PASS」。

| 层 | 结论 |
| --- | --- |
| 自动化 | PASS（上表） |
| 模拟器实际操作 / 隔离安装改前改后截图 | **NOT VERIFIED**。本轮未在可丢弃模拟器安装里走完夹具 F。现网改前外观仍以 `spec/recent-visual-round/` 已拍帧为参考，不得记成本轮模拟器 PASS |
| 真机 | **NOT VERIFIED**。未上物理机，也未写入 Liuz17 |

---

## 实现对照（供复审，不是运行 PASS）

- 短文完整；长文最多 6 行；仅 `onTextLayout` 行数 > 6 时出现「看这条，还有正文」
- 图：`shouldPairRecentImages`（非常大字号且列宽 ≥ 280）时复用 `detailImageBands`；否则纵排。缺失图不组带，顺序不变
- 感受色点、同日浅线、记录日 / 发生日、48pt「看这条」保留
- 播放与打开分开；clip 记忆未改
- 保存成功写 `justSavedMomentId`，不改事务 / 草稿清理 / `dismissTo('/')`
- 回声：加载成功、id 在列表、页面非后台后执行；Reduce Motion 直接 opacity 1；动画取消或切后台 `setValue(1)`
