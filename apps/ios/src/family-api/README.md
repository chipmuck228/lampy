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

## 单实例部署（Node + 持久 SQLite 卷）

只支持 **一个 Node 进程** 写这块库。listen 共用一条 SQLite 连接，事务在进程内排队。两个进程打开同一文件不是 production ready：`BEGIN IMMEDIATE` 会重试，但不能替代单写者，也没有跨进程故障转移。

1. 准备持久卷，例如 `/var/lib/lampy/family`。这个目录必须在容器重启后还在。
2. 把数据库文件放在卷上，不要放在容器可写层：
   `LAMPY_FAMILY_DATABASE_PATH=/var/lib/lampy/family/family.db`
3. 迁移：
   ```bash
   cd apps/ios
   LAMPY_FAMILY_DATABASE_PATH=/var/lib/lampy/family/family.db npm run family-api:migrate
   ```
4. 启动前确认文件在卷上：
   ```bash
   python3 -c "import os; p=os.environ['LAMPY_FAMILY_DATABASE_PATH']; print(os.path.realpath(p)); print(os.path.exists(p))"
   ```
5. 启动：
   ```bash
   LAMPY_FAMILY_API_MODE=production \
   LAMPY_FAMILY_DATABASE_PATH=/var/lib/lampy/family/family.db \
   LAMPY_APPLE_CLIENT_ID=<真实 iOS bundle id> \
   LAMPY_FAMILY_API_HOST=127.0.0.1 \
   LAMPY_FAMILY_API_PORT=8787 \
   npm run family-api
   ```
6. 前面用本机反向代理做 HTTPS。客户端 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 必须是 `https://`，或仅用于本机/局域网调试的 `http://127.0.0.1` / 私网地址。公网 `http://` 会被客户端拒绝，会话令牌不会发出去。
7. 端口占用、缺路径、缺 Apple client、生产环境出现测试 token、迁移失败：进程退出，不得听端口。

重启后账号、成员、邀请和幂等行应仍在。用测试 token 或内存库做的重启不能当作这项通过。

## 备份与恢复

SQLite 使用 WAL。备份前先停进程或做 checkpoint，然后拷贝主文件和旁路文件：

```bash
# 停进程后
cp /var/lib/lampy/family/family.db /backup/family.db
test -f /var/lib/lampy/family/family.db-wal && cp /var/lib/lampy/family/family.db-wal /backup/
test -f /var/lib/lampy/family/family.db-shm && cp /var/lib/lampy/family/family.db-shm /backup/
```

恢复：停进程，把备份写回同一卷路径，再启动。未停进程时拷贝主文件可能读到不完整的 WAL。没有自动远程备份。

## 启动失败与数据库故障

| 情况 | 行为 |
| --- | --- |
| 生产缺路径 / 缺 Apple client / 有测试 token | 拒绝启动 |
| 迁移失败 | 拒绝听端口 |
| 端口已被占用 | listen 失败，进程退出 |
| 事务 COMMIT 失败 | 回滚，不留下半写入的家庭 |
| 多实例抢同一文件 | 不视为可上线 |

## 会话边界

- 会话令牌只放 iOS Keychain，请求用 `Authorization: Bearer`。
- `POST /v1/auth/sign-out` 删除服务端这一条会话。
- 同一 Lampy 账号再次 Apple 登录成功后，服务端在同一事务里撤销该账号的旧会话。验证失败或事务失败不撤原有效会话。其他账号不受影响。
- 用户点退出后，本机立刻停止展示家庭内容并清掉可用会话。这只表示「本机已退出」。
- 服务端撤销未确认时，待撤销 token 只进 Keychain（`lampy.family.pending-revoke.v1`），不写日志、普通 SQLite 或公开配置。只有服务端确认撤销、该令牌已失效，或待撤销记录过期，才清掉它。500 等未确认错误会留下记录以便重试。写入 Keychain 失败时本机会话不删，页面仍视为登着。恢复网络或下次进入家庭页会安全重试；同一账号重新登录由服务端清旧会话。
- 过期或已撤销的令牌读成员为 401，客户端清 Keychain，并再次提供 Apple 登录。

## 部署前清单

- [ ] 单实例 + 持久卷，`LAMPY_FAMILY_DATABASE_PATH` 的 realpath 在卷上
- [ ] 已跑迁移；生产未设置 `LAMPY_FAMILY_API_TEST_TOKENS`
- [ ] `LAMPY_APPLE_CLIENT_ID` 是真实 bundle id
- [ ] 公网只走 HTTPS；iOS `EXPO_PUBLIC_FAMILY_API_BASE_URL` 指向该 HTTPS
- [ ] 已做停进程备份/恢复演练
- [ ] 两名真实 Apple 账号、两台设备走通登录→建家→邀请→加入→移除/退出→重启
- [ ] 未完成上一项时，不得对真实用户开放家庭功能

## 客户端路径

`createFamilyUseCases` → `createFamilyApiClient` → `POST/GET /v1/...`。会话在 iOS Keychain（`expo-secure-store`）。`getMembership` 只在 **200 且 body.family 非空** 时为 `ready`。失败或不可达为 `unauthenticated` / `unconfirmed`，成员列表为空。进入家庭页会先收起成员；只有资格查询失败才把已确认的成员清掉。邀请列表失败不会当成失去家庭。交错刷新只采用最新一代结果。

## 真实环境验收

部署模板在 `deploy/`。可独立跑的盘点与验收：

```bash
cd apps/ios
npm run family-identity:inventory
npm run family-identity:accept
```

脚本不打印令牌、邀请码或个人信息。没有真实 Apple token、公网 HTTPS 授权 URL 或托管卷探测时，对应项标 **NOT VERIFIED**。不会用测试 token、本机 `127.0.0.1` 或私网 HTTP 代替部署闭环，也不会解散账号里已有的未知家庭。退出码 0 只表示没有 FAIL；身份闭环看 `identityLoopAccepted`。结果见 `spec/FAMILY_IDENTITY_REAL_ACCEPT.md`。未再审阅不得对真实用户开放家庭入口。

## 本轮不做

Moment 分享、媒体上传、家庭时间线、接收快照、创建者移交、删除账号、微信领域修改。规格里的 F2 仍是媒体对象，不是本目录范围。
