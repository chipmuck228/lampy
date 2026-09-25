# Lampy family API（身份与成员）

本目录是可测试的服务端模块。公网进程、生产 Apple 密钥和托管数据库 **仍需单独部署**，未配置时不得宣称家庭闭环完成。

## 选型

生产存储用 **SQLite 文件**（WAL + `BEGIN IMMEDIATE` + 唯一约束），不是把内存数组写成 JSON。

- 部署成本：一个 Node 进程 + 一块持久卷。单实例即可。
- v1 一人一条有效成员：`family_memberships(user_id) WHERE status = 'active'` 部分唯一索引。以后要放开上限，另做迁移删这个索引。
- 邀请一次接受：`code` 唯一；接受用 `UPDATE ... WHERE status = 'pending'`，只有一行能改成功。
- 幂等：`(user_id, command, idempotency_key)` 主键。
- 测试仍可用内存实现。生产 listen 必须走 SQLite，并先跑迁移。

## 方案

- 命令：`createFamilyCommands`，只通过 `FamilyRepository` 读写。
- 内存：`createMemoryFamilyRepository`。
- 生产：`createSqliteFamilyRepository` + `applyFamilyApiSchema`。同一 SQLite 连接上的事务排队，避免 HTTP 共用连接时二次 BEGIN。
- HTTP：`dispatchFamilyApi`；监听：`listen.ts`。
- Apple：test 模式用 `createMapAppleVerifier`。production 用 JWKS 校验签名、issuer、audience、exp、sub。测试 token **不得**进入 production。
- 邮箱不当主键。登录成功不创建 Membership。

## 配置清单（均需真实值，禁止编造）

| 变量 | 何时需要 |
| --- | --- |
| `LAMPY_FAMILY_API_MODE=test` | 本地审阅。必须同时设 `LAMPY_FAMILY_API_TEST_TOKENS`。内存库，重启即丢 |
| `LAMPY_FAMILY_API_TEST_TOKENS` | `token:appleSubject` 逗号分隔。仅测试。production 出现则拒绝启动 |
| `LAMPY_FAMILY_API_MODE=production` | 必须同时具备 `LAMPY_FAMILY_DATABASE_PATH`、已应用迁移、`LAMPY_APPLE_CLIENT_ID` |
| `LAMPY_FAMILY_DATABASE_PATH` | 生产 SQLite 文件路径 |
| `LAMPY_APPLE_CLIENT_ID` | 生产 Apple audience（通常为 iOS bundle id） |
| `LAMPY_FAMILY_API_PORT` | 默认 `8787` |
| `LAMPY_FAMILY_API_HOST` | 默认 `127.0.0.1` |
| iOS `EXPO_PUBLIC_FAMILY_API_BASE_URL` | 客户端指向上述服务。未配置则视为不可达，不展示成员 |

Apple 私钥、Key ID、Team ID、生产 Session 密钥：**本仓库不提供，也不写入。**

## 迁移

```bash
cd apps/ios
LAMPY_FAMILY_DATABASE_PATH=./family.db npm run family-api:migrate
```

production listen 启动时也会再跑同一套迁移。失败则拒绝听端口。

## 本地启动

测试（内存，不能当真实家庭服务）：

```bash
cd apps/ios
LAMPY_FAMILY_API_MODE=test \
LAMPY_FAMILY_API_TEST_TOKENS='review-token:apple.review.sub' \
npm run family-api
```

生产形态（本机 SQLite + 真 Apple JWKS；仍不是已部署的公网服务）：

```bash
cd apps/ios
LAMPY_FAMILY_API_MODE=production \
LAMPY_FAMILY_DATABASE_PATH=./family.db \
LAMPY_APPLE_CLIENT_ID=app.lampy.ios \
npm run family-api
```

`GET /health` 只表示本进程在听，不表示公网已部署。

## 客户端路径

`createFamilyUseCases` → `createFamilyApiClient` → `POST/GET /v1/...`。会话在 iOS Keychain（`expo-secure-store`）。`getMembership` 只在 **200 且 body.family 非空** 时为 `ready`。失败或不可达为 `unauthenticated` / `unconfirmed`，成员列表为空。

## 本轮不做

Moment 分享、媒体上传、家庭时间线、接收快照、创建者移交、删除账号、微信领域修改。规格里的 F2 仍是媒体对象，不是本目录范围。
