# Moment 测试矩阵

## 自动化（node:test）

| 场景 | 位置 |
|---|---|
| 纯文字 Moment | `test/moment-commands.test.js` |
| 纯图片 / 纯录音 / 文字加媒体 | `test/moment-commands.test.js` |
| 空草稿 | `test/moment-commands.test.js` |
| 空 Moment 激活失败 | `test/moment-commands.test.js` |
| 精确时间 / 只有日期 / 时间未知 | `test/moment-commands.test.js` |
| 导入素材 | `test/moment-commands.test.js` |
| 收到的 Moment | `test/moment-commands.test.js` |
| 非 owner 编辑 | `test/moment-commands.test.js` |
| 非法状态转换 | `test/moment-commands.test.js` |
| 归档、回收站、恢复 | `test/moment-commands.test.js` |
| revision 递增 | `test/moment-commands.test.js` |
| V0 迁移字段映射 | `test/migration.test.js` |
| 重复执行迁移 | `test/migration.test.js` |
| 单条损坏不影响其它 | `test/migration.test.js` |
| `position` 不进入新模型 | `test/migration.test.js` |
| `isPassed` 不进入 Moment | `test/migration.test.js` |
| projection 确定性 | `test/projection.test.js` |
| 光罐日/月/年筛选 | `test/projection.test.js` / `test/calendar-boundary.test.js` |
| 自然日/月/年与时区边界 | `test/calendar-boundary.test.js` |
| repository 保存后可再读 | `test/repository.test.js` |
| 非法记录保存后仍在主存储 | `test/repository-data-preservation.test.js` |
| 非法记录不出现在 list | `test/repository-data-preservation.test.js` |
| quarantine 幂等 | `test/repository-data-preservation.test.js` |
| 删除合法记录不影响非法邻居 | `test/repository-data-preservation.test.js` |
| replaceAll 非法输入整体拒绝 | `test/repository-data-preservation.test.js` |
| Asset / Transmission 相同保全 | `test/repository-data-preservation.test.js` |
| 顶层集合非数组不得覆盖 | `test/repository-data-preservation.test.js` |
| 迁移 alreadyDone 与增量 lights | `test/migration-idempotency.test.js` |
| 自定义 ownerId 一致 | `test/migration-idempotency.test.js` |
| 精确 momentId 递灯 | `test/pass-moment.test.js` |
| 错误 id 不回退第一条 | `test/pass-moment.test.js` |
| 输入引用隔离 | `test/domain-reference-isolation.test.js` |
| Validator 完整契约 | `test/validator-contract.test.js` |
| 详情按精确 ID 读取 | `test/moment-detail-service.test.js` |
| 详情不回退到第一条 | `test/moment-detail-service.test.js` |
| 详情 Asset 精确解析与缺失降级 | `test/moment-detail-service.test.js` |
| 详情读取不改写 Moment / Asset | `test/moment-detail-service.test.js` |
| 详情 URL 编码 | `test/moment-detail-service.test.js` |
| 详情日期精度与时区 | `test/moment-detail-projection.test.js` |
| 详情来源文案与媒体状态 | `test/moment-detail-projection.test.js` |
| 详情输入不变性 | `test/moment-detail-projection.test.js` |

## 未在 Node 中运行的页面回归

微信 `Page` / `wx.*` 无法在普通 Node 中完整启动。以下只做代码接线，不宣称 E2E 通过：

- 记录页点亮后回首页；
- 首页 / 光罐进入 Moment 详情、图片预览、录音播放；
- 光罐点击与视图切换手势；
- 附近微光左滑与录音权限弹窗；
- 启动层动画。

对应自动化覆盖的是：记录用例通过 `activateMoment` + repository；首页/光罐通过 projection。
