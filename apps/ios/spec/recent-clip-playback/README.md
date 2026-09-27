# 最近页多段声音位置

> 范围：只改 `apps/ios`。「最近」共用一个原生播放器。切 uri 时按 Asset ID 记住暂停位置，不要把 A 写成 idle@0，也不要把 A 的进度显示在 B 上。
> 基线：`origin/main` @ `09a2a9a`（#31 已合并）。从 #30 原提交独立接到这条 main，没有把两个开放分支互相叠加。
> 设备：Liuz17，iPhone 17 Pro（iPhone18,1），UDID `00008150-0016696E1EBA401C`，iOS 26.2。

## 原因

「最近」原先一个 `useSoundPlayer` + `playingId`。不是当前 `playingId` 的条目被写成 `idle`、`currentTimeMs: 0`。切到 B 时共享播放器 `load(B)` 会卸掉 A。A 的真实暂停位置没有按 Asset ID 保存。

## 走查（Liuz17 / iOS 26.2）

| # | 路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 播放 A → 中途暂停 → 播放 B → 看 A 的状态和进度 | **PASS** | 用户真机：A 保持已暂停和暂停秒数；B 用自己的进度。 |
| 2 | A 暂停 → B 暂停 → 再点 A → 再点 B | **PASS** | 用户真机：A 从暂停处继续；再点 B 时声音和进度都属于 B。 |
| 3 | 切后台再回来 | **PASS** | 用户真机：完全正常。 |
| 4 | 离开「最近」再进入 | **PASS** | 用户真机：完全正常。 |
| 5 | 媒体缺失或定位失败 | **测试覆盖** | 可再试一次；失败不把 A 的秒数写到 B。本轮未单独真机走。 |

用户在 Liuz17 / iOS 26.2 上、#31 合并前的 #30 构建复测 1–4 听音通过。

## 与 #31 同一基线后的集成回归

#31 只改「最近」展示层（阅读顺序、看这条／播放拆开）。本分支接到 `09a2a9a` 后，Jest 覆盖 A→B→A 记忆与层次卡片同在。

| 路径 | 结果 |
| --- | --- |
| A 暂停 → B 暂停 → 再播 A → 再播 B，进度各归 Asset ID | **NOT VERIFIED**（#31+#30 同一安装尚未在 Liuz17 重走） |
| 切后台再返回 | **NOT VERIFIED** |

## 检查

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（clip memory / recent clip hook / use-sound-player / expo-audio / recent-life / audio-use-cases） | 59 passed |
| eslint on changed files | PASS |
| `git diff --check` | PASS |
