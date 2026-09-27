# 详情走查帧

PR #27 / `ios/moment-detail-hierarchy`。基线 `origin/main` @ `f9416d9`。
走查机：iPhone 16 Simulator / iOS 18.6。媒体均由「留下」写入本地库；缺失竖图是删掉已保存 Asset 的文件、保留带宽高的 Asset 行，没有改 Moment JSON。

Splash 横屏、iPad、iOS 26.2 真机仍 **NOT VERIFIED**（#26，不因本 PR 的 Jest 改判）。

## 改前

| 文件 | 判定 |
| --- | --- |
| `before/text-only.png` | 对照：日期小字、无精度、等权清单 |
| `before/text-fallback.png` | 对照：回退日期句 |

## iPhone 16 / iOS 18.6 · 运行中 App

| 场景 | 判定 | 证据 | 路径 |
| --- | --- | --- | --- |
| 纯文字 | **PASS** | `after/iphone16-text-only.png` | 留下「门口的风」→ `moment_1790488767470_ztjm0i77` |
| 单图（900×1200 可读） | **PASS** | `after/iphone16-one-image.png` | 留下「单图走查」+ 相册竖图 |
| 两张竖图（900×1200 + 720×1080） | **PASS** | `after/iphone16-two-portraits.png` | 留下「两张竖图走查」；并排、各守比例 |
| 三图（900×1200 + 720×1080 + 800×1100） | **PASS** | `after/iphone16-three-images.png`、`after/iphone16-three-images-end.png` | 留下「三张照片走查」；首张全宽，后两张并排；滚到「你留下的记录 / 分享给家里」，返回钉住 |
| 仅声音 | **PASS** | `after/iphone16-sound-only.png` | 留下录音 3 秒，无字；场景标题、时长、发丝、播放 |
| 图 + 声 | **PASS** | `after/iphone16-image-and-sound.png`、`after/iphone16-image-and-sound-end.png` | 留下「图与声走查」先录音再选竖图；滚到播放与分享 |
| 可读竖图 + 带尺寸缺失竖图 | **PASS** | `after/iphone16-missing-portrait-pair.png`、`after/iphone16-missing-portrait-pair-end.png` | 留下「缺失竖图走查」两张竖图后删除第二张文件；纵排，整句「这张照片暂时找不到了，但这条记录还在。」 |
| 长文滚到末尾 | **PASS** | `after/iphone16-long-text.png`、`after/iphone16-long-text-end.png` | 长句 + 一张可读竖图；返回钉住，末行来源/分享可见 |
| 长文与三图同一条 | **NOT VERIFIED** | — | 未留下「长文+三图」组合；三图与长文分两条走查 |
| 最大字号（AX XXXL） | **PASS** | `after/iphone16-xxxl-text.png`、`after/iphone16-xxxl-missing.png`、`after/iphone16-xxxl-missing-end.png`、`after/iphone16-xxxl-sound.png` | `simctl ui content_size accessibility-extra-extra-extra-large` 后冷启动；日期/占位/播放/来源/分享换行可读，不互相重叠。走查后已复位 `large` |
| 最近 → 精确 ID → 返回 | **PASS** | `after/iphone16-from-recent.png`、`after/iphone16-back-to-recent.png` | 点「缺失竖图走查」→ 详情 →「返回原来的位置」回到「最近」 |
| 回看日页 → 精确 ID → 返回 | **PASS** | `after/iphone16-from-lookback.png`、`after/iphone16-back-to-lookback-day.png` | 回看 → 2026 → 9 月 → 9 月 27 日 →「门口的风」→ 返回日页 |
| 播放中状态 | **NOT VERIFIED** | `after/iphone16-sound-playing.png` | 点了「播放，3秒」，文案仍是「未播放」；模拟器未见到暂停/进度。控件在，失败占位未误触发 |
| Moment 不存在 | **PASS** | `after/iphone16-missing.png` | `lampy://moment/moment_does_not_exist` |
| 读失败再试 | **NOT VERIFIED** | — | 未注入坏库 |
| 未知 Asset | **NOT VERIFIED** | — | 未构造未知类型行 |
| 横屏详情 | **NOT VERIFIED** | — | 本轮未转屏 |
| iPad 详情 | **NOT VERIFIED** | — | 未走 |
| iOS 26.2 真机 | **NOT VERIFIED** | — | 未走 |
| Splash 横屏 / iPad / iOS 26.2 | **NOT VERIFIED** | #26 | 不因本 PR Jest 改判 |

`after/iphone16-recent-before-open.png`：走查用「最近」上下文。

## 检查

见 PR 描述。本轮未重新 `expo run:ios`（沿用已装 Dev Client + Metro 8081）。
