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

## 本轮检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest | PASS（册持久化、收集参数、回看收集、详情菜单、目录隐藏入口） |
| 全量 Jest | PASS，161 suites / 849 tests |
| 改动文件 lint | 无新增 error。`use-cases.ts` 的 `import/first` 是原有 `export type` 插在 import 中间的基线警告 |
| `git diff --check` | PASS |
| 隔离库 Jest | PASS（关文件再开、删册留 Moment） |
| 真机 / 模拟器实页 | **NOT VERIFIED**（有可用模拟器但未装隔离 App） |
| VoiceOver | **NOT VERIFIED** |
| 本机保护实页 | **NOT VERIFIED**（未改认证世代 / 遮挡 / Keychain；册名走现有遮挡） |
| TestFlight | 未上传 |
| Liuz17 个人库 | 未读写 |

## 尚未验证 / 剩余风险

- 进入/退出收集模式后的真机分页、展开、滚动、播放进度
- 目录开合暂停与不自动续播（Jest 已覆盖，真机未走）
- 详情菜单收入与取消的真机走查
- `router.setParams({ collect: undefined })` 在 Expo 实机是否真正摘掉 query
- 短屏 / 横屏 / iPad 实页
