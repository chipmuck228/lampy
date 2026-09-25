# 家庭身份真实环境验收

日期：2026-09-25。从 `origin/main` 独立开始，不是 PR #10 旧分支。规格 F2 是媒体对象；本轮不实现 Moment 分享、媒体对象或家庭时间线。

令牌、邀请码、个人信息不写入本文件。

## 基线

| 项 | 值 |
| --- | --- |
| 起点 `origin/main` | `d198a7c68f29e13490032822ca3739b76f5bf849`（PR #10 merge） |
| 本任务分支 | `ios/family-identity-real-accept` |
| 本轮提交 | 见该分支 HEAD |

`d198a7c` 已核对。未从 `ios/family-phase-3b-audit` 继续。

## 结论

**家庭身份闭环未验收。不得对真实用户开放家庭入口。**

`identityLoopAccepted=false`。退出码 0 只表示没有 FAIL（盘点 / 本机 harness 成功）。自动化读 `apps/ios/.family-identity-accept.report.json` 里的 `identityLoopAccepted`，不能只看退出码。需要把未验收当成失败时用 `npm run family-identity:accept:require`（exit 2）。

本机可以：单实例生产形态 listen、卷上 SQLite 迁移 / 重启读取 / 备份恢复、生产拒绝测试 token、audience 与 `app.json` bundle id 一致、家庭服务故障时个人 Moment / 照片 / 录音 / 回看仍可用。

本机 `127.0.0.1` 上的邀请 / 加入 / 创建者移除 / 成员退出 **不是** 部署环境闭环。部署环境登录与跨账号流程、托管卷探测、授权 HTTPS 服务仍为 NOT VERIFIED。测试 token 没有用来代替。

## 实际环境（盘点）

| 项 | 实际 |
| --- | --- |
| `LAMPY_FAMILY_API_MODE` | UNSET |
| `LAMPY_FAMILY_DATABASE_PATH` | UNSET |
| `LAMPY_APPLE_CLIENT_ID` | UNSET（本机 listen 回退 `app.json` 的 `app.lampy.ios`） |
| `LAMPY_FAMILY_API_TEST_TOKENS` | UNSET |
| `EXPO_PUBLIC_FAMILY_API_BASE_URL` | UNSET（首页家庭入口不出现） |
| `LAMPY_FAMILY_ACCEPT_PUBLIC_URL` | UNSET |
| `LAMPY_FAMILY_ACCEPT_HOSTED_*` / `VOLUME_PROBE` | UNSET |
| 真实 Apple identity token | 未提供 |
| `apps/ios/app.json` | `bundleIdentifier=app.lampy.ios`，`usesAppleSignIn=true`，`expo-apple-authentication` |
| 本地 `ios/Lampy/Lampy.entitlements` | 存在且为空（该目录 gitignore；Apple 能力未确认） |
| Apple JWKS `https://appleid.apple.com/auth/keys` | HTTP 200，3 keys |

未打印、未提交、未编造任何密钥。

## 检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 验收契约（本机/部署拆分、托管卷探测） | PASS | `npm run family-identity:accept-test` |
| 盘点（只报 SET/UNSET） | PASS | `npm run family-identity:inventory` |
| Apple JWKS 可达 | PASS | HTTP 200，3 keys |
| iOS bundle + plugin | PASS | `app.lampy.ios` / Sign in with Apple |
| audience 与 bundle 一致 | PASS | 来源 `app.json` |
| 原生 Apple entitlement | NOT VERIFIED | 本地生成文件为空；开发者后台未核 |
| 部署模板 | PASS | `src/family-api/deploy/` |
| 授权部署服务 `/health` | NOT VERIFIED | `LAMPY_FAMILY_ACCEPT_PUBLIC_URL` 未设 |
| 托管持久卷 | NOT VERIFIED | 无 probe JSON / 无主机卷路径；不是写死，具备探测后可为 PASS |
| 本机单实例 listen | PASS | 临时卷 + production mode；不是托管部署 |
| 本机卷上迁移 / 重启 / 备份恢复 | PASS | migrations=7 |
| 生产拒绝测试 token | PASS | 启动 exit ≠ 0 |
| 本机非 JWT 被拒 | PASS | `POST /v1/auth/apple` → 401 `APPLE_TOKEN_INVALID` |
| 本机真实 Apple 登录 | NOT VERIFIED | 无真实 identity token |
| 本机邀请 / 加入 / 创建者移除 / 成员退出 | NOT VERIFIED | 无两名独立测试账号 |
| 部署服务真实 Apple 登录 | NOT VERIFIED | 无授权测试服务 URL |
| 部署服务邀请 / 加入 / 创建者移除 / 成员退出 | NOT VERIFIED | 不得用本机 127.0.0.1 结果代替 |
| App 重启会话恢复 | NOT VERIFIED | 需要真机 |
| 断网退出待撤销重试 | NOT VERIFIED | 需要真机 |
| 家庭故障时个人库仍可用 | PASS | `family-personal-isolation` + image / audio / lookback 测试 |
| 家庭入口未对真实用户打开 | PASS | `EXPO_PUBLIC_FAMILY_API_BASE_URL` 未设 |

`localIdentityLoopPassed=false`。`deployedIdentityLoopPassed=false`。`identityLoopAccepted=false`。`openToRealUsers=false`。

## 托管卷如何变为 PASS

在主机上对真实库路径跑 `npm run family-identity:volume-probe`：确认数据库 `realpath` 落在卷根、同一 device、文件系统不是 tmpfs/overlay、迁移行仍在、同卷拷贝能打开。然后在探针外重启唯一的 family-api 进程，并用服务管理器或 pid/journal **自行确认进程已换**。再带 `--after-restart` 跑一次，只核卷上 marker 与迁移数仍在。marker 和该标志不是进程重启证明。把写出的 JSON 通过 `LAMPY_FAMILY_ACCEPT_VOLUME_PROBE` 交给验收脚本。缺路径/迁移/备份证据则 NOT VERIFIED 或 FAIL。

部署走查不会退出或解散账号里已有的未知家庭；发现已有家庭即停止。双方成员查询必须是 200 且 `family: null`，否则立即停止。本轮家庭在邀请/移除等中途失败时也会尝试 dissolve；清理未确认则走查失败，并报告遗留家庭需人工处理。`public_https_service` 只接受公网 `https://`，本机与私网 HTTP/HTTPS 不能让该项通过。

## 命令

```text
git fetch origin main
git rev-parse origin/main
# d198a7c68f29e13490032822ca3739b76f5bf849

cd apps/ios
npm run family-identity:inventory
npm run family-identity:accept
# identityLoopAccepted 必须为 false 时，自动化不要把 exit 0 当成闭环通过
```

再跑部署环境验收时，只在本机 shell 设：

```bash
# 不要把这些值写进仓库或日志
# LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A=...
# LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B=...
# LAMPY_FAMILY_ACCEPT_PUBLIC_URL=https://...
# LAMPY_FAMILY_ACCEPT_VOLUME_PROBE=/path/to/probe.json
npm run family-identity:accept
```

不是三部分 JWT 的值会被拒绝。本机临时 listen 上的通过不会把 `deployed_*` 或 `identityLoopAccepted` 标为 true。

## 未做

Moment 分享、媒体对象、家庭时间线、向真实用户开放 `/family` 入口。
