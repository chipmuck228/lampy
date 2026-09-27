# 录音 / 播放会话切换走查

> 范围：只验收 `apps/ios` 里录音会话与播放会话的切换。发现可复现缺陷才改代码。
> 基线：`origin/main` @ `69cdb55`（#28 merge）。
> 设备：Liuz17，iPhone 17 Pro（iPhone18,1），UDID `00008150-0016696E1EBA401C`，iOS 26.2。
> 不改详情 UI、家庭功能、Moment/Asset 语义。

本轮没有改 JS。#28 已把录音模式限制在录音期间，播放前等待 `PLAYBACK_AUDIO_MODE`（`allowsRecording: false`，`shouldRouteThroughEarpiece: false`）。不靠调音量，也不覆盖用户已选的蓝牙或有线输出。

## 走查条件

Liuz17 已配对，屏幕亮着，Lampy `0.1.0`（`app.lampy.ios`）在跑。本机打不开 iPhone 镜像会话（停在「欢迎使用 iPhone 镜像」），也没有接到蓝牙或有线输出。Agent 不能点真机，也不能听。

因此下面四条都按**这一次正常路径**记结果。#28 在同一台机器上的扬声器听音 **PASS** 只作对照，不记成本次 PASS。机内已有的三条本地录音只说明旧数据还在，不代替本次的 A / B。

## 走查（Liuz17 / iOS 26.2）

| # | 路径 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 录音 A → 保存 → 详情扬声器播放 → 返回「留下」→ 录音 B → 保存并播放，两段内容各自正确 | **NOT VERIFIED** | 未能在真机走完录音 / 听音。#28 同机扬声器听音曾 PASS，不计入本表。 |
| 2a | 播放中切后台再回来：页面状态、不出现假「已播完」 | **NOT VERIFIED** | 未能切后台。 |
| 2b | 录音中切后台再回来：页面状态、录音文件和草稿保全，不出现假「已保存」 | **NOT VERIFIED** | 未能切后台。代码路径是打断录音、保留已录片段、不自动保存。 |
| 3 | 蓝牙或有线输出跟系统路由 | **NOT VERIFIED** | 本次没有外接设备。 |
| 4 | 关闭并重开 App，A、B 的记录和声音仍可读取 | **NOT VERIFIED** | 本次没有新录 A / B，也没有杀进程再开。 |

未复现缺陷，所以没有代码修复，也没有为未验收项补测试或假数据。

## 检查

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 相关 Jest（expo-audio / use-sound-player / leave-audio / audio-use-cases） | 48 passed |
| `npx expo lint` | 本轮无新增 error；`share/[id].tsx` L42、L83 是 main 原有 |
| `git diff --check` | PASS |

Jest 不替代真机听音或后台走查。
