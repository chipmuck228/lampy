# 录音 / 播放会话切换走查

> 范围：只验收 `apps/ios` 里录音会话与播放会话的切换。发现可复现缺陷才改代码。
> 基线：`origin/main` @ `69cdb55`（#28 merge）。
> 设备：Liuz17，iPhone 17 Pro（iPhone18,1），UDID `00008150-0016696E1EBA401C`，iOS 26.2。
> 不改详情 UI、家庭功能、Moment/Asset 语义。

#28 已把录音模式限制在录音期间，播放前等待 `PLAYBACK_AUDIO_MODE`（`allowsRecording: false`，`shouldRouteThroughEarpiece: false`）。不靠调音量，也不覆盖用户已选的蓝牙或有线输出。

真机复现并修复后，用户在 Liuz17 / iOS 26.2 上复测通过。

## 走查条件

Lampy `0.1.0`（`app.lampy.ios`），Expo Dev Client + Metro reload。外接音频未接。Jest 不替代真机听音。

## 走查（Liuz17 / iOS 26.2）

| # | 路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 录音 A → 保存 → 详情扬声器播放 → 返回「留下」→ 录音 B → 保存并播放，两段内容各自正确 | **NOT VERIFIED** | 本轮未单独记 A / B 听音对照。 |
| 2a | 首页播放中切后台再回来，从同一位置继续 | **PASS** | 修复前只能从头播。后台改为暂停并保住进度。 |
| 2b | 录音中切后台 → 提示打断 → 重录 → 预览和首页都能播 | **PASS** | 修复前重录能录但播不了。打断后释放录音器。 |
| 2c | 播放 → 暂停 → 再点播放，第一次续播就显示正在播放 | **PASS** | 修复前声音已续、文案仍是「已暂停」。 |
| 2d | 录音或重录中切后台再回来：打断文案 + 一段声音 / 播放 | **PASS** | 修复前误显示「已播完 / 再听一次」。 |
| 2e | 点播放 → load / 模式切换未完成 → 切后台 → 异步完成 | **测试覆盖** | 后台取消未完成的 play，不点火；回前台不自动播，须再点播放。未单独真机走。 |
| 3 | 蓝牙或有线输出跟系统路由 | **NOT VERIFIED** | 本次没有外接设备。 |
| 4 | 关闭并重开 App，A、B 的记录和声音仍可读取 | **NOT VERIFIED** | 本次没有单独记杀进程再开。 |

## 真机缺陷报告

| 问题 | 复现 | 原因 | 修复 |
| --- | --- | --- | --- |
| 打断后重录播不了 | 留下录音 → 切后台 → 重录 → 预览和首页无声 | 打断后原生 `AudioRecorder` 未 release，占住播放会话 | 停止/打断后 release；系统已停住的会话也收走文件并恢复播放模式 |
| 首页后台后只能从头播 | 最近页播放 → 切后台再回来 | 后台走 `stop()` + 拆播放器，进度归零 | 后台只暂停并保住位置，再点播放从同一秒继续 |
| 暂停后再播文案不对 | 播放 → 暂停 → 再点播放 | `heardPlaying` 未清，第一次续播被当成中途停止 | 暂停/再 play 清掉该标记，先 preparing 再 playing |
| 打断后显示已播完 | 录音或重录中切后台再回来 | 预览 `stop()` 标成 finished，新草稿仍绑着旧状态 | `stop()` 回到未播放；点过播放前草稿一律按 idle |

## 检查

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（expo-audio / use-sound-player / leave-audio / audio-use-cases / draft-preview） | 60 passed |
| `npx expo lint` | 本轮无新增 error；`share/[id].tsx` L42、L83 是 main 原有 |
| `git diff --check` | PASS |
