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
| 光罐日/月/年筛选 | `test/projection.test.js` |
| repository 保存后可再读 | `test/repository.test.js` |

## 未在 Node 中运行的页面回归

微信 `Page` / `wx.*` 无法在普通 Node 中完整启动。以下只做代码接线，不宣称 E2E 通过：

- 记录页点亮后回首页；
- 光罐点击与视图切换手势；
- 附近微光左滑与录音权限弹窗；
- 启动层动画。

对应自动化覆盖的是：记录用例通过 `activateMoment` + repository；首页/光罐通过 projection。
