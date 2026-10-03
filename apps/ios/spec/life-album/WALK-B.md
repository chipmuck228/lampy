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

回看重新聚焦时刷新当前册的收入状态。刷新与收入／撤回共用 `shouldApplyLookbackCollectResult`（目标册 + 世代），旧读取不能覆盖较新的写入。切册仍立即清空；同册刷新不丢当前标签、不重载阅读树、不重建播放器。已有阅读树时聚焦不再 `loadBook`。

报告中的「render 到 layout effect 一帧窗口」目前不足以认定为真实竞态，未再堆叠修复。

页面测试覆盖：回看收集 → 详情收入 → 返回显示已收下 → 点一次即可撤回；以及迟到的空读取不能盖掉刚写入的「已收下」。

运行 SHA：`7854446ad1ada75b7190ffbf9818fb3733da8982`。

## 本轮检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（册持久化、条目辨认、回看切册、回看重聚焦刷新收入状态、迟到读取不盖写入、弹层迟到关闭、管理草稿、详情菜单、目录隐藏入口） |
| 全量 Jest | PASS，164 suites / 865 tests |
| 改动文件 lint | 无新增 error |
| `git diff --check` | PASS |
| 隔离库 Jest | PASS（关文件再开、删册留 Moment） |
| 真机 / 模拟器实页 | 隔离机 `Lampy-life-album-b-isol` `C43C2E99-3404-46ED-94E4-5F9E69503E2C`，SHA `7854446ad1ada75b7190ffbf9818fb3733da8982`。**同步路径 PASS**（不重复走）。**新建 / 收入 / 撤回 PASS**：`开始收进` 建册并进入收集，点「收进这一册」写入、再点撤回，条目 1→0。再收入两条后管理。**改名 / 封面 / 调序 / 移出 PASS**：册名改为「秋天」并保存；点候选照片 `cover_kind=image`；下移后 `sort_order` 对调；移出封面条后回到 `words`，两条 Moment 仍在。**未保存输入 PASS**：册名打成「秋天」后先点封面，输入仍在，再保存成功。**杀进程重开 PASS**：terminate 后重开，册与两条收入仍在。**删册部分**：确认框出现「只删这一册，不删原来的记录。」，确认键未点到，册仍在。**弹层**：十二册时列表可滚，取消钉在滚动外可见；键盘升起后取消是否仍可达 **NOT VERIFIED**（点到「新建一册」关掉了弹层）。**目录开合 PASS**：展开 10 月、再收起，阅读还在，目录开时隐藏册入口与留下。**详情返回**已在同步路径走过。**播放 NOT VERIFIED**（这两条没有声音）。未碰 Liuz17、其他隔离机 |
| VoiceOver | **NOT VERIFIED** |
| 本机保护实页 | **NOT VERIFIED**（设置页可见「未开启」，开关未打开，未走遮挡） |
| TestFlight | 未上传 |
| Liuz17 个人库 | 未读写 |
| 阶段 C–E | 未开始 |

## 尚未验证 / 剩余风险

- 键盘升起且册子很多时，取消是否仍可达（多册可滚、取消已钉在滚动外，键盘态未走完）
- 开篇输入框未能稳定写入，未单独验收保存开篇
- 删册确认键未点到
- 播放（本隔离机这两条没有声音）
- 本机保护开关与遮挡
- 收集进出后的分页、展开、播放进度
- `router.setParams({ collect: undefined })` 在 Expo 实机是否真正摘掉 query
- 短屏 / 横屏 / iPad 实页
- VoiceOver
- 报告中的「render 到 layout effect 一帧窗口」未再堆叠修复
