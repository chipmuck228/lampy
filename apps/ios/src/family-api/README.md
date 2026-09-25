# Lampy family API（F1：身份与成员）

仓库在本切片合并时 **没有** 已部署的公网服务、家庭数据库或生产 Apple 密钥。本目录是可测试的服务端模块，不是已上线后端。

## 方案

- 进程内命令：`createFamilyCommands`（账户、会话、家庭、成员、邀请）。
- HTTP：`dispatchFamilyApi`；本地监听：`listen.ts`。
- 存储：内存。重启即丢。生产需要另选持久库（本轮未做）。
- Apple：`createAppleJwksVerifier` 按 iss / aud / exp / sub / RS256 校验。`listen.ts` 在 `LAMPY_FAMILY_API_MODE=production` 时走 Apple JWKS。测试用 `createMapAppleVerifier`，不得当作生产成员。
- 邮箱不当主键。登录成功不创建 Membership。

## 配置清单（均需真实值，禁止编造）

| 变量 | 何时需要 |
| --- | --- |
| `LAMPY_FAMILY_API_MODE=test` | 本地审阅。必须同时设 `LAMPY_FAMILY_API_TEST_TOKENS` |
| `LAMPY_FAMILY_API_TEST_TOKENS` | `token:appleSubject` 逗号分隔。仅测试 |
| `LAMPY_FAMILY_API_MODE=production` | 真实验证 Apple identity token |
| `LAMPY_APPLE_CLIENT_ID` | production 模式必填（Services ID / Bundle ID） |
| `LAMPY_FAMILY_API_PORT` | 默认 `8787` |
| `LAMPY_FAMILY_API_HOST` | 默认 `127.0.0.1` |
| iOS `EXPO_PUBLIC_FAMILY_API_BASE_URL` | 客户端指向上述服务。未配置则视为不可达，不展示成员 |

Apple 私钥、Key ID、Team ID、生产 Session 密钥：**本仓库不提供，也不写入。** 未配置则生产模式不能诚实地启动。

## 本地启动（测试模式）

```bash
cd apps/ios
LAMPY_FAMILY_API_MODE=test \
LAMPY_FAMILY_API_TEST_TOKENS='review-token:apple.review.sub' \
npm run family-api
```

入口是 `scripts/family-api.cjs`（用已有 `typescript` 转译本目录）。没有公网进程、没有持久库。

`GET /health` 只表示本进程在听，不表示已部署或已通过 Apple。

## 客户端路径

`createFamilyUseCases` → `createFamilyApiClient` → `POST/GET /v1/...`。无 Session 不调用成员接口。`getMembership` 只在 **200 且 body.family 非空** 时为 `ready`。失败或不可达为 `unauthenticated` / `unconfirmed`，成员列表为空。不接家庭页（避免未验证成功时展示假家庭）。

## 本轮不做

Moment 分享、媒体上传、家庭时间线、接收快照、创建者移交、删除账号、持久数据库、真机 Sign in with Apple。
