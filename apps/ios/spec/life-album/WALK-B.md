# 生活册阶段 B · 本机册子与收集

从 GitHub `main` `0ab1c3c5d45256f4ed8a09b22732c1059654f30d`（#63 普通 merge，tree 与审阅 head `ad5e9f8` 相同）新开独立分支 `ios/life-album-local`。不在 #63 分支继续实现。不复制旧回看分支。

静态样本仍**不是**运行 PASS。本阶段不做排版、预览、PDF、付费、搜索、AI、家庭或同步。不上传 TestFlight，不写 Liuz17 个人库。

## Migration

| Version | 表 |
| --- | --- |
| 10 | `life_albums` |
| 11 | `life_album_entries` |
| 12 | `life_album_entries_album_order` |

未改 1–9。

## 源码审阅后的五处修复

1. 管理页条目由 ViewModel 提供原文片段、已知日期、媒体提示，不生成摘要。
2. `applyView` 区分首次读取与操作刷新，封面 / 调序 / 保存册名不再覆盖未保存开篇。
3. 回看切册时立即清掉旧 `collectAlbum` / `collectedIds` / busy；操作要求已加载册 `id` 等于当前 `collect`。覆盖 A→B、A→B→A、迟到写入。
4. 选册弹层有限高滚动、键盘避让、会话序号；取消后迟到保存不能关掉新弹层。
5. 管理页封面 / 调序 / 删除等同时使用 `disabled` 与入口校验。

## 回看收集状态同步

回看重新聚焦时把两件事分开：生活册状态只更新收入标识，不重建阅读树；回看数据仍重新读取最新记录，并保留当前范围、分页、展开与位置。收入刷新与收入／撤回共用 `shouldApplyLookbackCollectResult`（目标册 + 世代），旧读取不能覆盖较新的写入。切册仍立即清空。不能靠跳过 `loadBook` 来保位置。

报告中的「render 到 layout effect 一帧窗口」目前不足以认定为真实竞态，未再堆叠修复。

页面测试覆盖：回看收集 → 详情收入 → 返回显示已收下 → 点一次即可撤回；迟到的空读取不能盖掉刚写入的「已收下」；打开回看 → 留下新记录 → 返回仍读到新条且保留当天、分页与目录展开；空回看 → 第一条记录 → 返回不再停在空状态。

## 本轮检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（册持久化、条目辨认、回看切册、回看重聚焦刷新收入状态、迟到读取不盖写入、打开回看后新记录返回可见、空回看第一条返回可见、弹层迟到关闭、管理草稿、详情菜单、目录隐藏入口） |
| 全量 Jest | PASS，165 suites / 867 tests |
| 改动文件 lint | 无新增 error |
| `git diff --check` | PASS |
| 隔离库 Jest | PASS（关文件再开、删册留 Moment） |
| 真机 / 模拟器实页 | 隔离机 `Lampy-life-album-b-isol` `C43C2E99-3404-46ED-94E4-5F9E69503E2C`。已通过路径不重复走。本轮运行 SHA `8b87ea590e0f0f9d134260a351d91249525b06d8`（Metro 8087 热重载后重开）。**开篇保存 + 杀进程重开 PASS**：在《秋天》管理页写入开篇 `Autumnn` / `dim the lamp`，点「保存开篇」后 `life_albums.opening` 与 `updated_at=2026-10-04T05:23:06.209Z` 已落库；terminate 后重开同一页，库与页面仍是这段开篇。**确认删册 NOT VERIFIED**：本轮未点到确认（重开后 Expo inspect 条挡住底部，AX 路径失效）。**多册＋键盘取消 NOT VERIFIED**。**含声音收集／目录／详情 NOT VERIFIED**（本隔离机仍无声音条，本轮未新录）。**本机保护遮挡 NOT VERIFIED**。未碰 Liuz17、其他隔离机 |
| VoiceOver | **NOT VERIFIED** |
| 本机保护实页 | **NOT VERIFIED**（设置页可见「未开启」，开关未打开，未走遮挡） |
| TestFlight | 未上传 |
| Liuz17 个人库 | 未读写 |
| 阶段 C–E | 未开始 |

## 尚未验证 / 剩余风险

- 开篇保存并重开已在 `8b87ea5` 走过
- 确认删册仍未点到（inspect 条 + 重开后 AX 树变了）
- 键盘升起且册子很多时，取消是否仍可达
- 含声音的收集／目录／详情暂停续播（本隔离机仍无声音条）
- 本机保护开关与遮挡
- 真机收集进出后的播放进度（分页与目录展开已有回看重聚焦补测）
- `router.setParams({ collect: undefined })` 在 Expo 实机是否真正摘掉 query
- 短屏 / 横屏 / iPad 实页
- VoiceOver
- 报告中的「render 到 layout effect 一帧窗口」未再堆叠修复
