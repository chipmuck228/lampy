# 验证记录

2026-10-11：基线 `3e0c9e2`，独立分支 `ios/account-identity-model`。

## 自动化

- `npx tsc --noEmit`：PASS。
- `npx jest --runInBand src/family-api`：23 suites / 158 tests PASS。
- 改动文件 ESLint：PASS（无 error）。
- `git diff --check`：PASS。

新测试覆盖：真实临时 SQLite 从 27 升到 28，原账号／哈希／停用状态／会话／昵称／家庭／成员／媒体／分享保持；同邮箱不合并；重复迁移；关闭重开；损坏身份回滚；memory／SQLite 的幂等、跨账号冲突、同 provider 替换拒绝、缺失账号拒绝、并发争抢及事务失败不留新账号。既有家庭 API 测试继续覆盖认证、限流、CLI、邀请、成员与分享。

未运行全 App Jest，不能称全量 App PASS。环境 Node 24.19.0／Linux，不代替公网主机 Node 22 验收。

## 初始验证边界

初次提交时公网数据库升级与设备回归未验证；后续用户执行的结果见下节。开发侧未直接操作设备或服务器。无新增原生依赖，本片未重编 App。

Apple 入口／绑定、邮件链接、Google、微信、账号删除均未在本片实现。


## 公网迁移与 Build 7 真机回归 — 2026-10-11（Asia/Shanghai）

用户执行并报告；开发侧未直接连接服务器或设备。隔离服务 family-test.yunpura.com，部署实现 SHA：`dd3520ae31c94d5dd70da399c7bc19a46c8bd918`。用户确认数据库迁移版本 **28**、缺少受控身份映射 **0**。公网 /health HTTP 200，controlledEmailAccounts/publicTestLogin 开启，emailRegistration/testAccountLogin 关闭。

设备使用既有 TestFlight **0.1.0 (7)**；本片仅升级 API，不能将服务器 SHA 当成 App 运行 SHA。本次设备型号／iOS 未重新提供，App 安装后源码 SHA 未独立读取。

| 操作 | 结果 |
| --- | --- |
| 已登录冷启动：原会话、家庭、角色与历史状态 | PASS（用户报告） |
| 设置资料：原昵称 | PASS（用户报告） |
| 原家庭分享与声音进度，返回不自动播 | PASS（用户报告） |
| 退出后原邮箱密码登录：原账号／原家庭，无重复账号 | PASS（用户报告） |
| 换账号：家庭与资料隔离 | PASS（用户报告） |
| 修改昵称、重开保留 | PASS（用户报告） |
| 创建家庭、邀请另一账号加入 | PASS（用户报告） |
| 新分享与撤回，撤回后不可读 | PASS（用户报告） |
| 本机保护后台返回：认证期间遮挡 | PASS（用户报告） |
| 个人记录与生活册保留 | PASS（用户报告） |
| 无新增 Apple／公开注册入口 | PASS（用户报告） |

副本迁移测试、备份恢复演练、服务再次重启后的专项检查没有在本次最终反馈单独确认，不扩大记为 PASS。Apple 实际登录／绑定、系统 VoiceOver、公开注册和账号删除不在本片验收范围。此次回填仅文档，不重新运行或声称新增自动化结果。
