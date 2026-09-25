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

本机可以：单实例生产形态 listen、卷上 SQLite 迁移 / 重启读取 / 备份恢复、生产拒绝测试 token、audience 与 `app.json` bundle id 一致、家庭服务故障时个人 Moment / 照片 / 录音 / 回看仍可用。

本环境没有：托管 HTTPS、托管持久卷、已确认的 Apple Developer 能力、两名真实测试账号、真机会话恢复与断网待撤销。这些标 NOT VERIFIED。测试 token 没有用来代替。

## 实际环境（盘点）

| 项 | 实际 |
| --- | --- |
| `LAMPY_FAMILY_API_MODE` | UNSET |
| `LAMPY_FAMILY_DATABASE_PATH` | UNSET |
| `LAMPY_APPLE_CLIENT_ID` | UNSET（验收 listen 回退 `app.json` 的 `app.lampy.ios`） |
| `LAMPY_FAMILY_API_TEST_TOKENS` | UNSET |
| `EXPO_PUBLIC_FAMILY_API_BASE_URL` | UNSET（首页家庭入口不出现） |
| 真实 Apple identity token | 未提供 |
| 公网 / 托管 HTTPS | 无 |
| 托管卷 / 部署权限 | 无 Docker / fly / eas 目标 |
| `apps/ios/app.json` | `bundleIdentifier=app.lampy.ios`，`usesAppleSignIn=true`，`expo-apple-authentication` |
| 本地 `ios/Lampy/Lampy.entitlements` | 存在且为空（该目录 gitignore；Apple 能力未确认） |
| Apple JWKS `https://appleid.apple.com/auth/keys` | HTTP 200，3 keys |

未打印、未提交、未编造任何密钥。

## 检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 盘点（只报 SET/UNSET） | PASS | `npm run family-identity:inventory` |
| Apple JWKS 可达 | PASS | HTTP 200，3 keys |
| iOS bundle + plugin | PASS | `app.lampy.ios` / Sign in with Apple |
| audience 与 bundle 一致 | PASS | 来源 `app.json` |
| 原生 Apple entitlement | NOT VERIFIED | 本地生成文件为空；开发者后台未核 |
| 部署模板 | PASS | `src/family-api/deploy/` |
| 公网 HTTPS 服务 | NOT VERIFIED | 未配置 URL |
| 托管持久卷 | NOT VERIFIED | 无部署目标 |
| 本机单实例 listen | PASS | 临时卷 + production mode；不是托管部署 |
| 卷上迁移 | PASS | migrations=7 |
| 生产拒绝测试 token | PASS | 启动 exit ≠ 0 |
| 非 JWT 被拒 | PASS | `POST /v1/auth/apple` → 401 `APPLE_TOKEN_INVALID` |
| 重启后读 SQLite | PASS | 停进程再听，migrations 仍为 7 |
| 备份恢复 | PASS | 停进程拷贝后恢复再听 |
| 真实 Apple 登录 | NOT VERIFIED | 无真实 identity token |
| 两账号邀请 / 加入 / 撤销 | NOT VERIFIED | 无两名独立测试账号 |
| App 重启会话恢复 | NOT VERIFIED | 需要真机 |
| 断网退出待撤销重试 | NOT VERIFIED | 需要真机 |
| 家庭故障时个人库仍可用 | PASS | `family-personal-isolation` + image / audio / lookback 测试 |
| 家庭入口未对真实用户打开 | PASS | `EXPO_PUBLIC_FAMILY_API_BASE_URL` 未设 |

`identityLoopAccepted=false`。`openToRealUsers=false`。

## 命令

```text
git fetch origin main
git rev-parse origin/main
# d198a7c68f29e13490032822ca3739b76f5bf849

cd apps/ios
npm run family-identity:inventory
npm run family-identity:accept
```

再跑验收时，把真实 token 只放在本机 shell：

```bash
# 不要把下面两行写进仓库或日志
# LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A=...
# LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B=...
# LAMPY_FAMILY_ACCEPT_PUBLIC_URL=https://...
npm run family-identity:accept
```

不是三部分 JWT 的值会被拒绝。

## 未做

Moment 分享、媒体对象、家庭时间线、向真实用户开放 `/family` 入口。
