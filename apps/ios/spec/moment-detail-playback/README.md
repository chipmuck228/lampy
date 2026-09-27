# Moment 详情：声音播放状态

> 范围：只改 `apps/ios` 的播放状态同步。独立分支，不叠 #27 之后的提交。
> 基线：`origin/main` @ `281be25`（#27 merge）。
> 走查：iPhone 16 / iOS 18.6 模拟器，Leave 录下的 `asset_1790491824126_37kfxj5d.m4a`（AAC，约 2.67 秒）。

不改录音文件、Moment/Asset 数据、缺失声音占位、个人记录和回看语义。家庭、Splash、其他页面不改。

## 根因

`useSoundPlayer.play()` 在原生 `play()` 返回后立刻 `getStatus()`。expo-audio 的 `play()` 是同步点火，此时 `currentStatus.playing` 仍是 `false`，适配器把它映射成 `idle`。同步计时器只在 React 状态为 `playing` 时启动，于是页面停在「未播放」。

同一条路径里，每次点「播放」都会 `load(uri)` 并 `release` + 重建播放器，暂停后再播会从头开始。

播完后如果错过一次性的 `didJustFinish`，`startRequested` 仍为 true，状态会回到 `preparing`，8 秒后被误判为失败。

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
| 实际听到声音 | 进程在播放中打开了该 m4a；本环境听不到模拟器扬声器 | — | **NOT VERIFIED**（不能把 Jest 或 lsof 当成听感 PASS） |
| 后台停止 | 未单独切后台 | — | **NOT VERIFIED** |
| iOS 26.2 真机 | 已连接设备是 iPhone 13 / 18.7.3；无 26.2 | — | **NOT VERIFIED** |

帧：`shots/iphone16-idle.png`、`iphone16-playing.png`、`iphone16-paused.png`、`iphone16-resume.png`、`iphone16-finished.png`、`iphone16-replay.png`。

原生：本 PR 只改 JS。走查用已安装的 Expo Dev Client + Metro reload，没有重新 `expo run:ios`。
