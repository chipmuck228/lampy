# 生活册阶段 A · 查看与检查

基线本地 `origin/main` `e1afff0`。只改 spec。未跑 Metro，未装模拟器，未碰个人库。

已普通合并为 #63 → `0ab1c3c5d45256f4ed8a09b22732c1059654f30d`（parents `e1afff0` + 审阅 head `ad5e9f829697092b95668bceed9ea27b44764d1c`）。静态样本仍**不是**运行 PASS。阶段 B 见 `WALK-B.md`。

## 查看样本

在仓库里打开：

```text
apps/ios/spec/life-album/sample/index.html
```

浏览器从封面翻到收尾（按钮或左右方向键）。这是静态稿，**不是**运行 PASS。验收项在 `SAMPLES.md`，不在纸页上。

同屏状态：`storyboard.html`。

## 本轮检查

| 项 | 结果 |
| --- | --- |
| 运行代码 | 未改 `apps/ios/src`、微信、家庭、AI、TestFlight |
| 支付 / PDF 依赖 / StoreKit | 未新增 |
| 夹具是否写成用户生活 | 封面横幅与册名标明示例 |
| 整册是否可读、无验收说明混入 | 见 `SAMPLES.md` 册外审阅 |
| 图像来源 | `sample/media/SOURCE.md`，原创几何 SVG |
| 声音 | 仅占位文案 |
| 真机 / 模拟器 | **NOT VERIFIED**（本轮不做） |
| `git fetch origin main` | 失败：连不上 `github.com:443`。继续以本地 `e1afff0` |

未解决：远程 main 若已前移，实现前须再 fetch 并移动本设计分支。导出时是否允许用户排除单张图，第一版推荐不允许。阶段 E 付费未审。
