# Phase 3B production-readiness audit

日期：2026-09-25。本文件只记录实际跑过的检查。mock、本地测试 token、编译通过都不算真实验收。

## 基线

| 项 | SHA / 链接 |
| --- | --- |
| 审计起点 `origin/main`（含 PR #9） | `fea7780377908ed1e3e9a931a42e95f092e1ab18` |
| PR #9 merge | https://github.com/chipmuck228/lampy/pull/9 |
| PR #9 head | `a52ea585b4351524bfba27260657197b955d3ffe` |
| 本审计提交 | `ios/family-phase-3b-audit`（见本轮 HEAD） |

`a52ea58` 是 `origin/main` 祖先。未重复合并。

## 结论

**现在不能让真实用户使用家庭功能。**

单实例 Node + 持久 SQLite 的启动、迁移、重启后文件仍在、生产拒绝测试 token、会话撤销、公网 HTTP 拒发令牌、家庭命令矩阵和刷新世代，在本机有独立检查。缺公网部署、缺真实 Apple 开发者配置、缺两名真实账号 / 两台设备走通。这些标 NOT VERIFIED，不得用 mock 冒充通过。

## 发现

| 严重程度 | 项 | 处理 |
| --- | --- | --- |
| 阻塞 | 退出登录只清 Keychain，服务端会话仍可用 | 本轮修复：`POST /v1/auth/sign-out` 删除该 token；客户端先撤销再清本地 |
| 阻塞 | 公网 `http://` 会带上 Bearer | 本轮修复：非本机/私网的 HTTP 在 fetch 前拒绝，令牌不发出 |
| 阻塞 | 交错刷新较早结果可盖住较新资格 | 本轮修复：刷新世代门闩，过期一代不写 UI |
| 中 | 每次写成功后的 refresh 先清空成员 | 本轮修复：只有重新确认资格时先藏成员；邀请列表失败保留已确认成员 |
| 中 | 端口占用时 listen Promise 挂起 | 本轮修复：`server` error 拒绝启动 |
| 中 | 同一账号再次 Apple 登录不撤旧会话 | 本轮修复：登录事务成功后撤销该账号旧会话 |
| 中 | 退出登录时服务不可达，服务端 token 仍有效直到过期 | 本轮修复：本机立即退出；待撤销只进 Keychain，恢复后重试或同账号再登录由服务端清理 |
| 阻塞（上线） | 无公网服务、无真实 Apple 双账号双设备 | NOT VERIFIED。清单见 family-api README |
| 阻塞（多实例） | 两进程写同一 SQLite 不是 production ready | 明确拒绝标 production ready |

未实现 Moment 分享、媒体上传、接收快照、家庭时间线。

## 实际命令与结果

```text
# PR #9
gh pr view 9  → OPEN, head a52ea58, base main, MERGEABLE, CLEAN, Bugbot SUCCESS
gh pr merge 9 --merge
merge SHA fea7780377908ed1e3e9a931a42e95f092e1ab18
git fetch origin main
git merge-base --is-ancestor a52ea58 origin/main  → yes
git checkout -B ios/family-phase-3b-audit origin/main

# 本机
cd apps/ios
npx tsc --noEmit
# exit 0

npx jest src/screens/family-screen.test.tsx \
  src/screens/family-refresh.test.ts \
  src/family-api/apple.test.ts \
  src/family-api/http.test.ts \
  src/family-api/commands.test.ts \
  src/family-api/runtime.test.ts \
  src/application/family-use-cases.test.ts \
  src/infrastructure/family-config.test.ts \
  src/family-api/listen.test.ts \
  src/family-api/sqlite-repository.test.ts \
  src/infrastructure/secure-family-session.test.ts \
  src/infrastructure/pending-family-operations.test.ts \
  src/application/use-cases.test.ts --no-coverage
# 13 suites, 72 tests, exit 0

# 卷上的 SQLite
VOL=/tmp/lampy-family-vol-YHPuBt
LAMPY_FAMILY_DATABASE_PATH=$VOL/family.db npm run family-api:migrate
# Applied family API migrations to /tmp/lampy-family-vol-YHPuBt/family.db
# realpath /private/tmp/lampy-family-vol-YHPuBt/family.db exists True size 69632

LAMPY_FAMILY_API_MODE=production ... LAMPY_FAMILY_API_TEST_TOKENS='review-token:apple.review.sub' npm run family-api
# refuse_exit=1
# LAMPY_FAMILY_API_TEST_TOKENS cannot be set in production.

LAMPY_FAMILY_API_MODE=production ... PORT=18787 npm run family-api
# GET /health → 200 {"ok":true,"slice":"identity-membership"}
# db still on volume /private/tmp/lampy-family-vol-YHPuBt/family.db
# 停进程后再起，/health 200，同一文件仍在，size 69632

env -u LAMPY_APPLE_CLIENT_ID LAMPY_FAMILY_API_MODE=production LAMPY_FAMILY_DATABASE_PATH=$VOL/family.db npm run family-api
# missing_apple_exit=1

# 会话收尾（本轮）
npx tsc --noEmit
# exit 0
npx expo lint
# 0 errors（既有 warning，与本轮无关）
git diff --check
# exit 0
# jest 会话/家庭页/SQLite/HTTP：见下方本轮测试
# iOS xcodebuild：仓库内无 ios/*.xcodeproj，未跑
```

本机 `/tmp` 卷只证明「配置的路径上确实有库文件，重启后还在」。它不是托管生产卷。

## PASS / FAIL / NOT VERIFIED

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 单实例启动 + 迁移 | PASS | migrate + production listen + `/health` 200 |
| 库文件落在配置路径 | PASS | realpath 在 `$VOL/family.db`，exists true |
| 进程重启后库文件仍在 | PASS | 二次 listen，同一 path/size |
| 重启后账号/成员/邀请/幂等仍在 | PASS | `sqlite-repository.test.ts` 关文件再开；备份拷贝恢复 |
| 并发不破坏一人一家、一次性邀请 | PASS | 同文件并发 accept / create+accept |
| 生产拒绝测试 token | PASS | runtime + 真实 `npm run family-api` exit 1 |
| 生产缺 Apple client 拒绝启动 | PASS | `npm run family-api` exit 1 |
| 端口占用拒绝启动 | PASS | `listen.test.ts` EADDRINUSE |
| 事务失败回滚 | PASS | COMMIT 失败后 membership 仍为空 |
| 多实例部署 | FAIL（不得标 ready） | 单连接排队 + 文件锁重试，无跨进程方案 |
| 托管持久卷 / 公网进程 | NOT VERIFIED | 无部署权限；只跑了本机 `/tmp` |
| 备份恢复演练（停进程拷贝） | PASS | 测试里 checkpoint + copy 后成员/邀请/幂等仍在 |
| 自动远程备份 | NOT VERIFIED | 未配置 |
| Apple iss/aud/sig/exp/sub（合成 JWT） | PASS | `apple.test.ts` |
| 真实 Apple identity token | NOT VERIFIED | 仓库无开发者密钥，无真 token |
| 生产 JWKS 联网验签 | NOT VERIFIED | 未用真实 token 打 `appleid.apple.com` |
| 测试 token 当生产成员 | PASS（拒绝） | 生产 listen 拒绝启动 |
| Keychain 会话存储（单元） | PASS | `secure-family-session.test.ts` |
| App 重启后 Keychain 恢复 | NOT VERIFIED | 未在模拟器/真机杀进程 |
| 退出登录撤服务端会话 | PASS | 在线：commands / HTTP / use-case / sqlite |
| 再次登录撤销同账号旧会话 | PASS | commands / HTTP / sqlite 回滚 |
| 验证失败不撤原会话 | PASS | commands.test |
| 断网退出：本机已退出 vs 远端未确认 | PASS | use-case + family-screen 文案 |
| 响应丢失后重试撤销 | PASS | use-case：服务端已删，客户端待撤销，重建后确认 |
| App 重启后待撤销仍在 Keychain | PASS | secure-family-session + use-case rebuilt |
| 跨账号不串待撤销 token | PASS | use-case 切换用户 |
| 过期/401 清本地并再给 Apple 登录 | PASS | use-case + family-screen 测试 |
| 账号切换不串 pending | PASS | `does not reuse another account pending key` |
| 公网 HTTP 不发会话 | PASS | `family-config.test.ts` fetch 未被调用 |
| 创建/邀请/接受/撤销/移除/退出/解散/读成员 | PASS | commands + use-case 矩阵（进程内 API） |
| 无权限/断网/服务错误不展示旧成员 | PASS | family-screen 再进入失败会藏成员 |
| 邀请列表失败保留已确认成员 | PASS | family-screen 测试 |
| 交错刷新不采用旧资格 | PASS | `family-refresh.test.ts` 世代门闩 |
| 未登录/服务不可达/退出家庭后个人 Moment 仍可用 | PASS | family-use-cases + use-cases；不改 `local-user` |
| 个人库上传 / 改写 local-user | PASS（未做） | 本轮无媒体上传，无 owner 重写 |
| 真机 Apple 双账号 | NOT VERIFIED | 无开发者账号与两台设备 |
| 跨设备邀请加入 | NOT VERIFIED | 同上 |
| 公网家庭服务 | NOT VERIFIED | 未部署 |

## 残余风险

- 待撤销 token 在断网期间仍存在于服务端，直到重试成功、同账号再登录、401，或超过会话 TTL。
- 再次登录只撤**该账号**旧会话。另一台已登录设备若是同一账号，会被新登录踢掉。
- 真实 Apple 令牌、双账号双设备、公网 HTTPS、托管持久卷仍是 NOT VERIFIED。

## 真实用户？

不可以。家庭入口在未配置 `EXPO_PUBLIC_FAMILY_API_BASE_URL` 时不出现；即便指向本机生产形态，没有真实 Apple token 也无法登录。把测试 token、合成 JWT 或内存库当成上线依据是错误的。
