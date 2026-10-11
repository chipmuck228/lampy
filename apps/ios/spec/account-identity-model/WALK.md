# 验证记录

2026-10-11：基线 `3e0c9e2`，独立分支 `ios/account-identity-model`。

## 自动化

- `npx tsc --noEmit`：PASS。
- `npx jest --runInBand src/family-api`：23 suites / 158 tests PASS。
- 改动文件 ESLint：PASS（无 error）。
- `git diff --check`：PASS。

新测试覆盖：真实临时 SQLite 从 27 升到 28，原账号／哈希／停用状态／会话／昵称／家庭／成员／媒体／分享保持；同邮箱不合并；重复迁移；关闭重开；损坏身份回滚；memory／SQLite 的幂等、跨账号冲突、同 provider 替换拒绝、缺失账号拒绝、并发争抢及事务失败不留新账号。既有家庭 API 测试继续覆盖认证、限流、CLI、邀请、成员与分享。

未运行全 App Jest，不能称全量 App PASS。环境 Node 24.19.0／Linux，不代替公网主机 Node 22 验收。

## 尚未验证

公网数据库升级、现有运营账号与会话迁移后实读、模拟器／真机回归：NOT VERIFIED。未读写 Liuz17 或服务器。无新增原生依赖，不要求仅为这片重编 App，但服务器部署必须先迁移并核对。

Apple 入口／绑定、邮件链接、Google、微信、账号删除均未在本片实现。
