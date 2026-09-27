# 「最近」视觉走查帧

PR #32 / `ios/recent-visual`。范围仍只改「最近」展示层。
走查机：iPhone 16 Simulator / iOS 18.6。本轮 JS 由已装 Dev Client + Metro 8081 载入，未重新 `expo run:ios`。
媒体是本机库里 #27 走查留下的记录，没有改 Moment / Asset。

Liuz17（iPhone 17 Pro / iOS 26.2）本轮 **连不上**（Core Device 超时），画面与听音均 **NOT VERIFIED**。

## 符号范围

播放／暂停／再听一次的 ▶❚❚↺ 只由「最近」传入 `markedActions`。`MomentAudio` 默认仍是纯文字。

| 页面 | 结果 | 证据 |
| --- | --- | --- |
| 最近 | **PASS** | `shots/iphone16-recent-play-target.png`：`▶ 播放` + `看这条 ›` |
| 详情 | **PASS** | `shots/iphone16-detail-mix-play.png`：同一控件只有「播放」，无符号 |
| 留下草稿条 / 回看 | **NOT VERIFIED** | 未打开这两页；二者未传 `markedActions`，与详情同默认 |

## iPhone 16 / iOS 18.6 · 运行中 App

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 同日 72pt 细线 | **PASS** | `shots/iphone16-rule-gap-crop.png`、`shots/iphone16-recent-play-target.png`。线在「看这条」与下一条正文之间，短、左缘、不是卡片描边。 |
| 细线是否贴住下一条 | **PASS** | 同上。线下方到「图加声走查」有一段留白，不像贴在下一句上。 |
| 符号 + 文字 | **PASS** | `shots/iphone16-recent-play-target.png`：`▶ 播放`；`看这条 ›`。符号不单独出现。 |
| 缺失媒体 | **PASS** | `shots/iphone16-recent-missing.png`：整句「这张照片暂时找不到了，但这条记录还在。」后是「看这条」和同日下一条。 |
| 三图长记录 | **PASS** | `shots/iphone16-recent-glyphs.png`：真页面「三张照片走查」，首张全宽，后续图起头可见。 |
| 最大字号换行 | **PASS** | `shots/iphone16-xxxl-home.png`、`shots/iphone16-xxxl-scroll2.png`、`shots/iphone16-xxxl-actions.png`、`shots/iphone16-xxxl-sound.png`。日期轨已收起；「缺失竖图走查」「发生于…」「一段声音 · 3秒」「▶ 播放」「看这条 ›」换行可读，不互相重叠。XXXL 下细线相对字号更轻，但仍不贴下一条标题。 |
| 横屏 | **NOT VERIFIED** | 本轮未转屏 |
| iPad | **NOT VERIFIED** | 未走 |
| Liuz17 真机画面 | **NOT VERIFIED** | 设备配对但通道超时 |

## #30＋#31 集成听音（最终界面）

#32 未改播放状态机。A 暂停 → B 暂停 → 再听 A / 再听 B，以及后台返回，须在**最终界面**上听过才能记 PASS。

| 路径 | 结果 |
| --- | --- |
| iPhone 16 模拟器点播 | **NOT VERIFIED**。控件在（`▶ 播放`），合成点击后文案未变成「暂停」，与 #27 模拟器听音限制相同。不能凭此记续播 PASS。 |
| Liuz17 真机听音 | **NOT VERIFIED**。本轮未装上、未听。 |

因此 #30＋#31 合并后的 A→B→A **仍不能记 PASS**。
