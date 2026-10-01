# 最近第一轮视觉走查

实现分支 `ios/recent-visual-refinement`（PR #54 OPEN），从当时 `origin/main`（#51 固定字号已合入，`4e64f4c`）新开。**没有**从 #53 回看分支继续。

只改 Presentation：最近页眉、同日分隔、原位展开、底带两项、浮动留下、空态文案。未改 Moment / Asset / 保存 / 草稿 / 播放器 / 本机保护 / 家庭 / AI / 日期行为 / 回看阅读逻辑。

## 本机命令

在 `apps/ios`：

- `npx tsc --noEmit`
- 相关 Jest：最近 home / moment / note / nav / hierarchy
- 改动文件 `eslint`
- `git diff --check`

未重传 TestFlight。未向 Liuz17 写夹具。

## 真机（Liuz17）

全部 **NOT VERIFIED**：

- 眉题「LAMPY · 生活记录」+「最近」+ 齿轮
- 同日浅分隔沿正文列宽
- 展开正文紧跟文字，再图 / 声 / 感受 / 阅读完整记录
- 底带只有最近 / 回看；右下「＋ 留下」不挡末条
- 空态两段文案
- 固定字号
