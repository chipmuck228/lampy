# 家庭身份 API 部署（单实例）

本目录只提供配置模板。公网主机、证书、Apple 开发者账号和测试用户 **不在仓库里**，不得编造。

规格 F2 是媒体对象。这里不部署 Moment 分享、媒体对象或家庭时间线。

## 先决条件

1. 一台只跑 **一个** Node 进程的受控主机。
2. 一块重启后仍在的卷，例如 `/var/lib/lampy/family`。
3. Apple Developer 里该 iOS App 已打开 Sign in with Apple。Services ID / audience 必须等于 iOS `bundleIdentifier`（仓库里是 `app.lampy.ios`）。`npx expo prebuild --platform ios` 之后检查 `ios/Lampy/Lampy.entitlements` 含 `com.apple.developer.applesignin`。空 entitlements 不能当真实 Apple 登录已就绪。
4. 前面的 HTTPS 反向代理。公网 `http://` 会被客户端拒绝。
5. 两名独立测试 Apple 账号。没有这两名账号时，身份闭环标 **NOT VERIFIED**，不得用测试 token 代替。

没有主机权限或真实账号时：把模板拷到主机侧填值，跑 `npm run family-identity:accept`，把真实登录 / 邀请 / 双机项标为 NOT VERIFIED。

## 步骤

1. 把 `env.example` 拷到仓库外，例如 `/etc/lampy/family-api.env`，写入真实 `LAMPY_APPLE_CLIENT_ID` 和卷上的数据库路径。不要设置 `LAMPY_FAMILY_API_TEST_TOKENS`。
2. 卷上建目录并收紧权限。
3. 从 `apps/ios` 跑迁移：
   ```bash
   LAMPY_FAMILY_DATABASE_PATH=/var/lib/lampy/family/family.db npm run family-api:migrate
   ```
4. 确认 `realpath` 落在持久卷上，而不是容器可写层。
5. 安装 `family-api.service`（或等价的单进程监督），`EnvironmentFile` 指向仓库外的 env。
6. 用 `Caddyfile` 或等价配置终止 TLS，反代到 `127.0.0.1:8787`。
7. iOS 只在审阅通过后设置 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 为该 `https://` 地址。未审阅不得对真实用户开放家庭入口。
8. 备份：停进程或 `wal_checkpoint` 后拷贝 `family.db`、`family.db-wal`、`family.db-shm`。恢复时先停进程再写回同一路径。

## 验收脚本

在 `apps/ios`：

```bash
npm run family-identity:inventory
npm run family-identity:accept
```

可选环境变量（只在本机 shell 里设，不要写进仓库或日志）：

| 变量 | 用途 |
| --- | --- |
| `LAMPY_FAMILY_ACCEPT_VOLUME` | 本机验收用的持久目录。未设则用临时目录 |
| `LAMPY_FAMILY_ACCEPT_PUBLIC_URL` | **授权测试服务** 的 URL。未设则部署环境身份项为 NOT VERIFIED。不得指向验收脚本刚拉起的 `127.0.0.1` |
| `LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH` | 托管卷上的 SQLite 文件。供本机可见的卷或主机上的 `volume-probe` 使用 |
| `LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT` | 托管卷根目录。数据库 `realpath` 必须落在此根下且同一 device |
| `LAMPY_FAMILY_ACCEPT_VOLUME_PROBE` | `volume-probe` 写出的 JSON。验收脚本读它，不把本机临时卷当成托管卷 |
| `LAMPY_FAMILY_ACCEPT_VOLUME_AFTER_RESTART` | 设为 `1` 表示这次 probe 发生在家庭 API 进程重启之后 |
| `LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A` | 测试用户 A 的真实 Apple identity token |
| `LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B` | 测试用户 B 的真实 Apple identity token |

脚本不会打印这些值。不是三部分 JWT 的 token 会被拒绝，以免把测试 token 当成真实验收。

本机 `127.0.0.1` 上的登录 / 邀请 / 加入 / 创建者移除 / 成员退出，与授权部署服务上的同一组操作是两套结果。只有后者加上托管卷探测均为 PASS，`identityLoopAccepted` 才为 true。退出码 0 只表示没有 FAIL，自动化要读 `identityLoopAccepted`。需要把「未验收」当成失败时用 `npm run family-identity:accept:require`（exit 2）。

托管卷探测（在主机上）：

```bash
LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH=/var/lib/lampy/family/family.db \
LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT=/var/lib/lampy/family \
LAMPY_FAMILY_ACCEPT_VOLUME_PROBE=/tmp/family-volume-probe.json \
npm run family-identity:volume-probe
# 重启唯一的 family-api 进程
LAMPY_FAMILY_ACCEPT_VOLUME_AFTER_RESTART=1 \
LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH=/var/lib/lampy/family/family.db \
LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT=/var/lib/lampy/family \
LAMPY_FAMILY_ACCEPT_VOLUME_PROBE=/tmp/family-volume-probe.json \
npm run family-identity:volume-probe -- --after-restart
```
