# 录音 / 播放会话切换走查

> 范围：只验收 `apps/ios` 里录音会话与播放会话的切换。发现可复现缺陷才改代码。
> 基线：`origin/main` @ `69cdb55`（#28 merge）。
> 设备：Liuz17，iPhone 17 Pro（iPhone18,1），UDID `00008150-0016696E1EBA401C`，iOS 26.2。
> 不改详情 UI、家庭功能、Moment/Asset 语义。

#28 已把录音模式限制在录音期间，播放前等待 `PLAYBACK_AUDIO_MODE`（`allowsRecording: false`，`shouldRouteThroughEarpiece: false`）。不靠调音量，也不覆盖用户已选的蓝牙或有线输出。

真机复现后修了三处：打断后的录音器要 release，否则重录的文件播不出来；切后台只暂停并保住进度，不再 `stop()` 到 0、也不再拆掉播放器；暂停后再点播放，第一次续播不得把界面留在「已暂停」。

## 走查条件

Liuz17 已配对，屏幕亮着，Lampy `0.1.0`（`app.lampy.ios`）在跑。本机打不开 iPhone 镜像会话（停在「欢迎使用 iPhone 镜像」），也没有接到蓝牙或有线输出。Agent 不能点真机，也不能听。

用户在 Liuz17 上复现了 2a / 2b。下面按真机结果记。#28 同机扬声器听音 **PASS** 只作对照。

## 走查（Liuz17 / iOS 26.2）

| # | 路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 录音 A → 保存 → 详情扬声器播放 → 返回「留下」→ 录音 B → 保存并播放，两段内容各自正确 | **NOT VERIFIED** | 未在本轮完整走 A / B 听音。 |
| 2a | 首页播放中切后台再回来 | **FAIL** → 已修 | 真机：回来后只能从头播。后台改为暂停并保住进度，再点播放从同一位置继续。 |
| 2c | 播放 → 暂停 → 再点播放 | **FAIL** → 已修 | 真机：第一次续播已出声，文案仍是「已暂停」。暂停/再 play 不再沿用 heardPlaying，第一次续播先进入 preparing。 |
| 2b | 录音中切后台再回来，再重录后播放 | **FAIL** → 已修 | 真机：提示「录音被打断」后重录能录，但预览和首页都播不了。打断后释放录音器，系统已停住的会话也会收走文件再恢复播放会话。 |
| 3 | 蓝牙或有线输出跟系统路由 | **NOT VERIFIED** | 本次没有外接设备。 |
| 4 | 关闭并重开 App，A、B 的记录和声音仍可读取 | **NOT VERIFIED** | 本次没有新录 A / B 后杀进程。 |

## 检查

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（expo-audio / use-sound-player / leave-audio / audio-use-cases） | 53 passed |
| `npx expo lint` | 本轮无新增 error；`share/[id].tsx` L42、L83 是 main 原有 |
| `git diff --check` | PASS |

Jest 不替代真机听音或后台走查。
