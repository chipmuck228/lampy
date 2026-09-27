# 「最近」视觉走查帧

PR #32 / `ios/recent-visual`。范围仍只改「最近」展示层。
走查机：iPhone 16 Simulator / iOS 18.6。本轮 JS 由已装 Dev Client + Metro 8081 载入，未重新 `expo run:ios`。
媒体是本机库里 #27 走查留下的记录，没有改 Moment / Asset。

Liuz17（iPhone 17 Pro / iOS 26.2）本轮 **连不上**（Core Device 超时），画面与听音均 **NOT VERIFIED**。

## 符号范围

播放／暂停／再听一次的 ▶❚❚↺ 只由「最近」传入 `markedActions`。`MomentAudio` 默认仍是纯文字。

| 页面 | 结果 | 证据 |
| --- | --- | --- |
| 最近 | **PASS** | `shots/iphone16-idle-mix.png`：`▶ 播放` + `看这条 ›` |
| 详情 | **PASS** | `shots/iphone16-detail-mix-play.png`：同一控件只有「播放」，无符号 |
| 留下草稿条 / 回看 | **NOT VERIFIED** | 未打开这两页；二者未传 `markedActions`，与详情同默认 |

## 「看这条 ›」

外层 `Pressable` ≥ 48pt；文字与 `›` 同一行、同一字号行高，文字不再用 `minHeight: 48` 撑高。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 常规字号 | **PASS** | `shots/iphone16-open-regular-crop.png`、`shots/iphone16-idle-mix.png`。`›` 与「看这条」同一行视觉居中，不再落在右下角。 |
| AX XXXL | **PASS** | `shots/iphone16-open-xxxl.png`。大字号下仍同行；「一段声音 · 3秒」自然换行，无裁切。 |

## 空进度轨与同日短线

「最近」idle 不画空轨。真正播放／暂停且有进度后才画 3pt、青色、通栏的 heard 轨，与 72pt 浅发丝同日线区分。详情默认仍画 scene 轨。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 图＋声 idle | **PASS** | `shots/iphone16-idle-mix.png`、`shots/iphone16-idle-mix-crop.png`。「一段声音 · 3秒」与「▶ 播放」之间无线。 |
| 仅声音 idle | **PASS** | `shots/iphone16-idle-voice.png`。meta 与播放之间无线；同日短线只出现在两条记录之间。 |
| 播放／暂停进度 | **NOT VERIFIED** | 运行中 App 未点到「暂停」态。Jest 覆盖 heard 轨样式与百分比。 |
| 同日 72pt 细线 | **PASS** | `shots/iphone16-idle-mix.png`、`shots/iphone16-rule-gap-crop.png`。线在「看这条」与下一条正文之间，不贴住下一句。 |
| 缺失媒体 | **PASS** | `shots/iphone16-recent-missing.png` |
| 三图长记录 | **PASS** | `shots/iphone16-recent-glyphs.png` |
| 最大字号换行 | **PASS** | `shots/iphone16-xxxl-home.png`、`shots/iphone16-xxxl-scroll2.png`、`shots/iphone16-open-xxxl.png` |
| 横屏 | **NOT VERIFIED** | 本轮未转屏 |
| iPad | **NOT VERIFIED** | 未走 |
| Liuz17 真机画面 | **NOT VERIFIED** | 设备配对但通道超时 |

## #30＋#31 集成听音（最终界面）

#32 未改播放状态机。A 暂停 → B 暂停 → 再听 A / 再听 B，以及后台返回，须在**最终界面**上听过才能记 PASS。

| 路径 | 结果 |
| --- | --- |
| iPhone 16 模拟器点播 | **NOT VERIFIED**。合成点击落到「看这条」进了详情，未听到、未见「暂停」。不能凭 Jest 记续播 PASS。 |
| Liuz17 真机听音 | **NOT VERIFIED**。本轮未装上、未听。 |

因此 #30＋#31 合并后的 A→B→A **仍不能记 PASS**。
