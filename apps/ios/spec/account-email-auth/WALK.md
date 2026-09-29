# 受控家庭测试账号登录走查

独立 PR，基线核对见交付报告。未叠 #41。只改 `apps/ios`。PR 保持 OPEN。`identityLoopAccepted` 仍为 **false**。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 未开。

## 最小契约

- HTTP：`POST /v1/auth/test-account` `{ login, password }` → 与 Apple 相同的 `{ userId, sessionToken, expiresAt }`
- 默认：`LAMPY_TEST_ACCOUNT_LOGIN` 未设时该端点 503 `TEST_ACCOUNT_LOGIN_CLOSED`；Apple 不受影响
- CLI：`npm run family-api:test-account -- create|disable <login>`，密码来自隐藏 TTY 或 `FAMILY_TEST_ACCOUNT_PASSWORD_FD`
- 迁移：14 `family_accounts` 可空 `apple_subject`；15 `family_test_credentials`；16 `family_auth_rate_limits`
- 限速：每登录名 15 分钟 8 次，独立提交，失败事务回滚不得抹掉计数

## 验收标记

- `identityLoopAccepted`：**false**
- 双设备：**NOT VERIFIED**（没有第二台设备）
- `family.yunpura.com` 部署：**未做**（本 PR 明确禁止）
