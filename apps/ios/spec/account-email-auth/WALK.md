# 受控家庭测试账号登录走查

独立 PR #43，base `origin/main` `b1abc11`。只改 `apps/ios`。未叠 #41。未部署 `family.yunpura.com`，未迁移生产库，未创建生产测试账号，未打开家庭入口。

合并的是受控测试身份代码，**不是**双账号双设备或公网家庭验收。没有第二台设备时 `identityLoopAccepted` 继续为 **false**。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 未开。`LAMPY_TEST_ACCOUNT_LOGIN` 默认关闭。

## 最小契约

- HTTP：`POST /v1/auth/test-account` `{ login, password }` → 与 Apple 相同的 `{ userId, sessionToken, expiresAt }`
- 默认：`LAMPY_TEST_ACCOUNT_LOGIN` 未设时该端点 503 `TEST_ACCOUNT_LOGIN_CLOSED`；Apple 不受影响
- CLI：`npm run family-api:test-account -- create|disable <login>`。只检查 schema 14–16 已在，不执行迁移。`npm run` 用仅 owner 可访问的 `FAMILY_TEST_ACCOUNT_PASSWORD_FILE`；直接跑 CJS 也可用 `FAMILY_TEST_ACCOUNT_PASSWORD_FD` 或隐藏 TTY
- 迁移：14 `family_accounts` 可空 `apple_subject`；15 `family_test_credentials`；16 `family_auth_rate_limits`
- 限速：每登录名 15 分钟 8 次，独立提交，失败事务回滚不得抹掉计数
- 关开关：受保护请求在独立已提交事务里撤销测试会话后再 401；重开开关后旧 token 不能恢复。CLI disable 是另一条独立事务，需分别验证

## 本轮核对（2026-09-29）

实现 head 当时为 `5426c0961782ecc19ec0fc633dc47e76cb7ebdb8`（CLI 边界 `6619cd4`）。目标 `main`，与当时 `origin/main` `b1abc11` 一致，`MERGEABLE`。

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| 全量 Jest | **PASS** 105 suites / 570 tests |
| 改动 TS/TSX ESLint | **PASS** |
| `scripts/family-api-test-account.cjs` 单独 `eslint` | `__dirname` `no-undef`（CJS 启动脚本，默认 env 无 Node）。不记成本轮 lint 通过 |
| 全量 `expo lint` 的 `leave.tsx` / `share/[id].tsx` | 原有错误，**不是**本轮通过 |
| `git diff --check origin/main...HEAD` | **PASS** |
| diff 仅 `apps/ios` | **PASS** |
| 公开邮箱注册／验证／重设 API | **无**（`POST /v1/auth/email/register` 仍为未知路由 400） |
| 仓库内密码 / token / 测试者资料 | **无**（隔离库密码文件在 `/tmp`，未提交） |

## 隔离库 CLI（`/tmp/lampy-43-close.*`，非生产）

先对目标文件 `npm run family-api:migrate`。下列 create/disable **不是**两台设备，也不是公网家庭。

| 步骤 | 结果 |
| --- | --- |
| 未迁移库 `npm run family-api:test-account -- create` | **PASS** 拒绝：提示先 `family-api:migrate`，exit 1，未写 14–16 |
| 已迁移 + `0644` 密码文件 create | **PASS** 拒绝：`group- or world-accessible`，exit 1，未建账号 |
| 已迁移 + `0600` `npm run` create / disable | **PASS** `usr_f8f22b97b182a759a60bab6d91f2b73a` |
| 已迁移 + CJS `FAMILY_TEST_ACCOUNT_PASSWORD_FD=3` create / disable | **PASS** `usr_1b5b8115e1eeaa49993b72705a59831c` |

## SQLite 行为（Jest 真实文件，非公网）

| 步骤 | 结果 |
| --- | --- |
| 登录限速独立提交，失败事务回滚不抹计数 | **PASS** |
| 关开关 → 受保护请求 401 → 关库重开 → 重放旧 token 仍 401（Apple token 仍可用） | **PASS** |
| CLI disable 后关库重开，旧 token / 再登录失败 | **PASS** |

## 不算本切片验收

| 项 | 结果 |
| --- | --- |
| `identityLoopAccepted` | **false** |
| 第二台设备 / 双账号家庭闭环 | **NOT VERIFIED** |
| `family.yunpura.com` 部署本 PR / 生产 migrate / 生产 CLI create | **未做** |
| 家庭产品入口 | **关闭** |

合并前只读：`https://family.yunpura.com/health` 为 200，JSON **没有** `testAccountLogin`（仍是原进程）。`POST /v1/auth/test-account` 空体为 400 `Unknown family API route`。生产库未在本轮探测版本号以外的写入；未跑生产 migrate 或 CLI。

残留 review：非媒体 JSON 4KB 上限也会挡住过长分享正文。家庭入口关闭且本 PR 不部署，不把该项写成家庭验收，也不当作双设备 PASS。
