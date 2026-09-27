# Moment 详情：声音播放状态

> 范围：只改 `apps/ios` 的播放状态同步。独立分支，不叠 #27 之后的提交。
> 基线：`origin/main` @ `281be25`（#27 merge）。
> 走查：iPhone 16 / iOS 18.6 模拟器，Leave 录下的 `asset_1790491824126_37kfxj5d.m4a`（AAC，约 2.67 秒）。

不改录音文件、Moment/Asset 数据、缺失声音占位、个人记录和回看语义。家庭、Splash、其他页面不改。

## 根因

`useSoundPlayer.play()` 在原生 `play()` 返回后立刻 `getStatus()`。expo-audio 的 `play()` 是同步点火，此时 `currentStatus.playing` 仍是 `false`，适配器把它映射成 `idle`。同步计时器只在 React 状态为 `playing` 时启动，于是页面停在「未播放」。

同一条路径里，每次点「播放」都会 `load(uri)` 并 `release` + 重建播放器，暂停后再播会从头开始。

播完后如果错过一次性的 `didJustFinish`，`startRequested` 仍为 true，状态会回到 `preparing`，8 秒后被误判为失败。补完「曾 playing 即 finished」之后，中途停在 1 秒（无 `didJustFinish`）也会被误报「已播完」；现在只有位置接近总时长，或明确的结束事件，才报 finished。无法确认结束时保持暂停可继续，或失败可重试。原生把 1 秒位置归零后，后续 getStatus 仍保持同一次暂停，不会掉回「未播放」。再点播放时 seek 回约 1 秒再续播；seek 失败则进入可重试，不再显示一个并不存在的续播位置。

录音用 `allowsRecording: true`（iOS PlayAndRecord，默认听筒）。播放前必须等 `allowsRecording: false` 且 `shouldRouteThroughEarpiece: false` 的媒体会话生效；录音模式只在录音期间打开。不靠调音量，也不覆盖用户已选的蓝牙或有线输出。

## 走查（iPhone 16 / iOS 18.6）

| 状态 | 按钮 / 文案 | 进度 | 结果 |
| --- | --- | --- | --- |
| idle | 「播放，3秒」；「一段声音，3秒，未播放」 | 发丝空 | **PASS** |
| preparing | 本地文件启动太快，250ms 时已是 playing，未稳定拍到「正在准备」 | — | **NOT VERIFIED**（代码与测试覆盖；真机/模拟器上太短） |
| playing | 「暂停，3秒」；「正在播放，0秒，共3秒」→ 随后 1 秒、2 秒 | 发丝随时间前进 | **PASS** |
| paused | 「播放，3秒」；「已暂停，1秒，共3秒」 | 停在 1/3 | **PASS** |
| resume | 「暂停，3秒」；「正在播放，1秒，共3秒」 | 从 1 秒继续，没有回到 0 | **PASS** |
| finished | 「再听一次，3秒」；「已播完，共3秒」 | 满轨 | **PASS** |
| replay | 「暂停，3秒」；「正在播放，0秒，共3秒」 | 从头 | **PASS** |
| 离开详情 | 回到「最近」；不再显示播放中 | — | **PASS** |
| 实际有声音 | 用户在真机听到了 Leave 录制的回放 | — | **PASS** |
| 正确输出路由（修复前） | 声音从听筒播出，不是设备扬声器 | — | **FAIL** |
| 正确输出路由（修复后真机） | 待在设备扬声器 / 外接音频上听 | — | **NOT VERIFIED**（模拟器与 Jest 不能替代） |
| 外接音频系统路由 | 蓝牙或有线接入时跟系统走，不抢路由 | — | **NOT VERIFIED** |
| 录音后再录音 | 会话应回到录音模式 | — | **NOT VERIFIED** |
| 后台停止 | 未单独切后台 | — | **NOT VERIFIED** |
| iOS 26.2 真机 | 已连接 iPhone 13 / 18.7.3；无 26.2 | — | **NOT VERIFIED** |

帧：`shots/iphone16-idle.png`、`iphone16-playing.png`、`iphone16-paused.png`、`iphone16-resume.png`、`iphone16-finished.png`、`iphone16-replay.png`。

原生：本 PR 只改 JS。走查用已安装的 Expo Dev Client + Metro reload，没有重新 `expo run:ios`。
