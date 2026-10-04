# 生活册 · 阶段 C 走查

独立分支 `ios/life-album-layout-preview`。不续写 #64。不开始 D 正式导出、系统分享、付费、云端、家庭、AI 或搜索。不清理 Liuz17，不覆盖 TestFlight。隔离实拍不入库。

## 基线

| 项 | 值 |
| --- | --- |
| 起始 `origin/main` | `fa2096b6c4315dbe59ed010e0a73d1669173715e`（#64 普通合并） |
| 实现 head | 见本 PR |
| 原生模块 | `apps/ios/modules/lampy-album-layout`（`LampyAlbumLayout`：Core Text `measureText`、`AlbumPageView` 按 `baselineYPt` `CTLineDraw`、隔离 `writeProbePdf` 共用同一绘制） |
| JS 测量双 | `wrapByGlyphWidth` 仅 Jest；生产必须走 Core Text |
| 缓存 | 进程内 `Map`，指纹含册名 / 开篇 / 封面 / 顺序 / revision / 存在或可读 / 媒体可用性 / `album-a5-v1` |
| 字体 | 衬线 `Songti SC`（album-serif），UI `PingFang SC`（album-ui）。系统授权，**不可再分发嵌入** |
| Unicode | 全链路 `unicode-scalar`（code point），不是 UTF-16 |

## 技术选择

1. iOS Core Text `CTTypesetterSuggestLineBreak` 输出字形行宽、行高与 **Unicode scalar** 起止。
2. 最小 Expo Module，不升级 SDK。autolinking：`package.json` → `expo.autolinking.nativeModulesDir = ./modules`。
3. 字体与媒体本机处理；不下载字体、不调用网络排版。
4. 预览与 PDF 探针读同一份 `AlbumLayout` 的 `box` + `lines`。设备预览文字由 `AlbumPageView` 用 Core Text 在 **`baselineYPt`** 绘制，与 PDF 探针共用 `drawAlbumPage`。RN `Text` 仅在原生视图不可用（Jest）时占位，**不能**作为测量行已对齐的证据。
5. 页面在 `getUseCases()` 之前捕获独立 seq + signal；拿到 application 后先核对资格再 `beginAlbumLayout`；`cancelAlbumLayout(requestId)` 只作废所属请求。
6. 系统中文字体通常不能合法嵌入 PDF：探针固定 `fontsEmbedded: false`。在证明嵌入与逐框对照之前，PDF 同版标记 **NOT VERIFIED**。不能用「JSON 相同」声称渲染同版。

## 产品接入

- 管理页有收入后出现「看看这一册」→ `/albums/:id/preview`
- 空册只提示先收下，无无效预览入口
- 加载 / 失败重试 / 取消 / 来源指纹变化失败
- 封面到收尾翻页、页码、等比例整页、过小可放大后滚动（不重排）
- 声音点击才播，复用 Asset ID 播放器；翻页 / 离开 / 后台暂停
- 本机保护未解锁不读个人来源
- 页面不查 SQLite

## 检查

本机命令见 PR 正文。Jest 覆盖完整性、精度、缓存、取消、迟到结果、预览不自动播放。

## 真机 / 模拟器 / 原生

| 项 | 状态 |
| --- | --- |
| Jest / tsc / lint | 本 PR 跑 |
| Core Text 真机测量 | 隔离模拟器 `Lampy-guide-isol` 已再编入 `LampyAlbumLayout`（`measureText` + `AlbumPageView`/`writeProbePdf` 共用 `CTLineDraw(baselineYPt)`，Build Succeeded）。整册夹具走查与 PDF 同版仍待记 |
| 隔离夹具整册预览实拍 | **未验证**（WALK-C 设备 PASS 另记，不写 Liuz17） |
| 隔离 PDF 探针页对照 | **NOT VERIFIED**（系统字体不嵌入；预览/PDF 虽共用绘制函数，逐行逐框对照仍须实页） |

隔离走查清单（可丢弃安装，合成内容）：

1. 创建测试册 → 收入混合记录 → 看看这一册
2. 翻到末页 → 放大读长文 → 播放 / 暂停
3. 返回管理 → 改名或顺序 → 重新预览
4. 后台返回与本机保护

未完成上述真机项前，不得把阶段 C 标为设备 PASS。
