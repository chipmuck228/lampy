# 最近页多段声音位置

> 范围：只改 `apps/ios`。「最近」共用一个原生播放器。切 uri 时按 Asset ID 记住暂停位置，不要把 A 写成 idle@0，也不要把 A 的进度显示在 B 上。
> 基线：`origin/main` @ `69cdb55`。
> 设备：Liuz17，iPhone 17 Pro（iPhone18,1），UDID `00008150-0016696E1EBA401C`，iOS 26.2。
> 独立于 #29（录音/播放会话走查）。#29 保持 OPEN，未合并。

## 原因

「最近」原先一个 `useSoundPlayer` + `playingId`。不是当前 `playingId` 的条目被写成 `idle`、`currentTimeMs: 0`。切到 B 时共享播放器 `load(B)` 会卸掉 A。A 的真实暂停位置没有按 Asset ID 保存。

## 走查（Liuz17 / iOS 26.2）

| # | 路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 播放 A → 中途暂停 → 播放 B → 看 A 的状态和进度 | **测试覆盖** | A 保持已暂停和暂停秒数；B 用自己的进度。本轮无法在真机听音，**NOT VERIFIED**。 |
| 2 | A → B → 再播 A | **测试覆盖** | 重载 A 后 seek 到记住的位置。真机听音 **NOT VERIFIED**。 |
| 3 | B 播放中切后台再回来 | **测试覆盖** | B 按记住的暂停位置；A 仍是自己的暂停。真机听音 **NOT VERIFIED**。 |
| 4 | 离开最近再返回 | **测试覆盖** | 会话内按 Asset ID 记住。真机听音 **NOT VERIFIED**。 |
| 5 | 媒体缺失或定位失败 | **测试覆盖** | 可再试一次；失败不把 A 的秒数写到 B。真机听音 **NOT VERIFIED**。 |

Liuz17 已配对 available。本环境不能操作 App 听音，听音路径一律不记 PASS。

## 检查

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（clip memory / recent clip hook / use-sound-player / expo-audio / recent-life / audio-use-cases） | 59 passed |
| eslint on changed files | PASS |
| `git diff --check` | PASS |
