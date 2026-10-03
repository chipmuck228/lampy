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

## 本轮检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（册持久化、条目辨认、回看切册、弹层迟到关闭、管理草稿、详情菜单、目录隐藏入口） |
| 全量 Jest | PASS，164 suites / 862 tests |
| 改动文件 lint | 无新增 error |
| `git diff --check` | PASS |
| 隔离库 Jest | PASS（关文件再开、删册留 Moment） |
| 真机 / 模拟器实页 | **部分环境 PASS，流程 NOT VERIFIED**。新建隔离机 `Lampy-life-album-b-isol` `C43C2E99-3404-46ED-94E4-5F9E69503E2C`（iPhone 17 Pro / iOS 26.5），空容器，Dev Client + 本分支 Metro `8087`。JS 已装上（`iOS Bundled`）。走到引导末屏与留下页。本环境无 HID（无 cliclick / idb，System Events 点击 -25204），未能点完「新建→收集→撤回→详情收入→管理→重开→移出／删册」。未碰 Liuz17、`Lampy-recent-b-isol`、`Lampy-guide-isol` |
| VoiceOver | **NOT VERIFIED** |
| 本机保护实页 | **NOT VERIFIED**（未改认证世代 / 遮挡 / Keychain；册名走现有遮挡） |
| TestFlight | 未上传 |
| Liuz17 个人库 | 未读写 |
| 阶段 C–E | 未开始 |

## 尚未验证 / 剩余风险

- 隔离机已开着、Metro 在 `8087`。继续走查：在 Simulator 里点留下一句话，再走设置「我的生活册」
- 进入/退出收集模式后的分页、展开、滚动、播放进度
- 目录开合暂停与不自动续播（Jest 已覆盖，真机未走）
- `router.setParams({ collect: undefined })` 在 Expo 实机是否真正摘掉 query
- 短屏 / 横屏 / iPad 实页
