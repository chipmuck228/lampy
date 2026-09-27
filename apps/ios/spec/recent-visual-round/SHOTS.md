# 「最近」视觉走查帧

PR #32 / `ios/recent-visual`。范围仍只改「最近」展示层。
收尾核对：head `74fbe43`，base `origin/main` @ `469b7c5`（最新）。未沿用 #30 合并前听音。

## 本轮安装

| 项 | 值 |
| --- | --- |
| JS / 构建 SHA | `74fbe43`（Dev Client + Metro 8081，未重新 `expo run:ios`） |
| iPhone 16 Simulator | iOS 18.6 · UDID `5A7769A7-45B7-4A6E-8C17-938F6618BD56` |
| Liuz17 | iPhone 17 Pro / iOS 26.2 · 已 `devicectl` 启动 `app.lampy.ios`（pid 2832），屏幕亮、竖屏。本机无法点控件、无法听筒 |

媒体仍是本机库里 #27 走查留下的记录。家庭入口、照片权限、Moment/Asset、播放器状态语义未改。

## 1. 运行中进度轨（#32 最新 JS）

| 路径 | 仅声音 | 图＋声 |
| --- | --- | --- |
| idle：无空轨 | **PASS**（本轮 `shots/iphone16-closeout-idle-voice.png`：紧凑标题，「一段声音 · 3秒」与「▶ 播放」之间无线） | **PASS**（本轮 `shots/iphone16-closeout-idle-mix.png`：有「当时的声音」，meta 与播放之间无线） |
| 点播放：听到声音、进入播放态、进度前进 | **NOT VERIFIED** | **NOT VERIFIED** |
| 点暂停：停声、轨与位置保留 | **NOT VERIFIED** | **NOT VERIFIED** |
| 再播：从暂停点续 | **NOT VERIFIED** | **NOT VERIFIED** |
| 播完：真实结束、无空轨当分隔线 | **NOT VERIFIED** | **NOT VERIFIED** |

阻碍：模拟器合成点击会落到「看这条」或无法进入「暂停」；此处听不到扬声器。Liuz17 已打开 App，但没有 HID / 听音通道。Jest 与模拟点击不代替听音。

常规字号下「▶ 播放」与「看这条 ›」本轮 idle 画面不遮挡、不串行。最大字号本轮未重走，沿用既有 XXXL 帧，播放态 XXXL **NOT VERIFIED**。

## 符号与详情

| 页面 | 结果 | 证据 |
| --- | --- | --- |
| 最近 | idle **PASS** | 上表 closeout 帧 |
| 详情 | 符号未漏：**PASS**（既有 `iphone16-detail-mix-play.png`） | 本轮未重开详情 |
| 留下 / 回看 | **NOT VERIFIED** | 未打开 |

## 其它画面

| 场景 | 结果 |
| --- | --- |
| 同日 72pt 细线只在两条之间 | **PASS**（closeout 图＋声 / 仅声音均可见短线在「看这条」与下一条之间） |
| 横屏 | **NOT VERIFIED** |
| iPad | **NOT VERIFIED** |
| 外接音频 | **NOT VERIFIED** |
| Liuz17 真机画面 / 听音 | **NOT VERIFIED**（已启动，未操作、未听） |

## 2. #30＋#31＋#32 同一安装集成听音

| 路径 | 结果 |
| --- | --- |
| A 暂停 → B 暂停 → 再播 A → 再播 B | **NOT VERIFIED**。未听到各自录音，未见各自暂停点续播。不用 #30 合并前真机、Jest 或模拟点击记 PASS。 |
| B 播放中切后台再返回 | **NOT VERIFIED** |

## 3. 检查（本轮实跑）

在 `apps/ios`、head `74fbe43`：

- `npx tsc --noEmit`：**PASS**
- 全量 Jest：**465 passed / 78 suites**
- 改动文件 eslint：**PASS**
- `git diff --check`：**PASS**（工作区无已暂存/未暂存的 `apps/ios` 源码改动）

PR 相对最新 `origin/main` **MERGEABLE**。Bugbot 旧评（`80280e5`）：「看这条」撑高已在后续提交去掉；`▶` 在 idle 实拍里是低强调三角，未当本轮阻塞。

## 下一次可执行的走查

在 Liuz17（或能听的真机）打开已连 Metro 的 Lampy，确认 bundle 为 `74fbe43` 或更新 head：

1. 「最近」找一条仅声音、一条图＋声：idle → 播放（听）→ 暂停（听停）→ 再播（听续）→ 听完；拍 idle / 播放 / 暂停。
2. 同一安装做 A→B→A / 再播 B，再在 B 播放中切后台返回。
3. 两组都听到并观察后再把对应行改 PASS 或 FAIL；未听完不要改写成 PASS。
