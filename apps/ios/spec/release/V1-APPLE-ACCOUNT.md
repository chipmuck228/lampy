# 1.0.0：Apple 正式账号与删除验收

本 PR 基于 #122 的 `appstore-v1` 配置，保持所有付费、导出及打印验收关闭。不接入 Resend，不按邮箱自动合并身份。

## 用户流程

- 家庭页面、邀请登录和设置「我的资料」均可进入正式 Apple 登录；不依赖诊断或受控测试邮箱开关。
- 登录时复用服务端一次性 nonce challenge；同一 Apple subject 回到同一 Lampy 用户。用户可修改家庭昵称、退出本机。
- 设置 → 我的资料 → 删除账号：说明影响、二次确认、重新进行当前 Apple 身份授权。取消或身份不匹配不删除。
- 当前创建者仍管理有其他成员的活跃家庭时，明确提示先转交或解散，不代替用户选择继任者。
- 删除在数据库事务中清除账号、登录身份、所有会话、昵称、本人全部分享（含撤回记录）、媒体元数据、相关回执、家庭成员关系与个人关联数据。保留其他人的分享；现有家庭册移除本人分享和对应封面引用并提升 revision。
- 仅剩本人管理的家庭关闭；空家庭移除，含历史成员分享的家庭交给既有家庭清理流程。已解散家庭仍执行其既有清理规则，本人的分享即时删除。
- 本机私人 moments、个人册不变。本机家庭缓存隔离与清理复用已有退出机制。其他设备下次请求时旧会话失效；不能宣称远程擦除其他设备上已复制或已交付的内容。
- 同一 Apple 账号再次登录创建新 Lampy 用户 ID，不恢复原家庭身份或内容。

## Apple 撤销与媒体清理

删除时优先使用本次授权 code 换取 token，核验响应身份及 nonce 后调用 Apple `/auth/revoke`。签名密钥只在服务器读取。code、refresh token 和 client secret 不写数据库或日志。

Apple 撤销失败、缺少 code 或未配置密钥时，Lampy 账号仍删除，界面明确提示到系统「通过 Apple 登录」停止使用 Lampy；不能把网络失败当成撤销成功。真实撤销成功须真机与 Apple 服务验收，自动测试中的模拟响应不算该项通过。

媒体行在事务中删除，同时将 storage key 加入独立持久化清理队列。立即尝试删文件；失败不恢复 API 读取权限，重启及 `family-api:cleanup` 会重试。队列不保留账号 ID、原文或 Apple token。每轮最多处理 100 个文件；部署必须安排定时清理并监测失败退出。数据库 DELETE 和文件删除不等于对磁盘、系统快照或外部副本的取证级擦除。

## 服务端部署准备

本 PR 新增 migration **32**：扩展 Apple challenge 的删除意图，并新增账号媒体清理队列；不修改既有 1–31 迁移。

服务端正式配置应关闭测试登录，开启 Apple 与免费家庭功能，并继续关闭购买和导出：

```dotenv
LAMPY_FAMILY_API_MODE=production
LAMPY_FAMILY_API_HOST=127.0.0.1
LAMPY_APPLE_CLIENT_ID=app.lampy.ios
LAMPY_APPLE_LOGIN_ENABLED=1
LAMPY_APPLE_TRUST_LOOPBACK_PROXY=1
LAMPY_PUBLIC_TEST_LOGIN=0
LAMPY_TEST_ACCOUNT_LOGIN=0
LAMPY_CONTROLLED_EMAIL_ACCOUNTS=0
LAMPY_FAMILY_HISTORY_ENABLED=1
LAMPY_FAMILY_ALBUMS_ENABLED=1
LAMPY_UNIFIED_PURCHASES=0
LAMPY_FAMILY_ALBUM_EXPORT_ENABLED=0

LAMPY_APPLE_SIGNIN_TEAM_ID=B283NY984J
LAMPY_APPLE_SIGNIN_KEY_ID=<Sign in with Apple key ID>
LAMPY_APPLE_SIGNIN_KEY_FILE=<服务器 p8 文件绝对路径>
```

p8 来自 Apple Developer → Certificates, Identifiers & Profiles → Keys 中启用 Sign in with Apple 的密钥；它不是 App Store Connect 购买密钥。只保存在服务器代码目录以外、服务用户可读的文件中。部分密钥参数缺失会阻止服务启动；全部未设置则只能走明确的手动撤销兜底，上线前仍须完成自动撤销验收。

生产候选配置目标为 `https://family.yunpura.com`，需部署该域名的 API、HTTPS 与邀请关联文件。现有 `family-test.yunpura.com` 测试服务的运行结果不代表正式域名就绪。正式与测试服务应使用各自的数据目录和环境文件。

反向代理必须覆盖 `X-Lampy-Client-IP` 为真实连接来源，不能透传用户提交的值；API 仅绑定 127.0.0.1。所有认证请求（含删除）现在均有并发准入和请求体超时保护。开启可信 Apple 代理时缺少可信头返回 403。

上传本 PR 对应代码后，在目标服务的用户、工作目录、环境文件下执行：

```sh
npm run family-api:migrate
npm run family-api:cleanup
```

再重启对应 systemd 服务，检查 `/health` 至少包含 `appleLogin:true`、`accountDeletion:true`、家庭能力开启及购买／导出关闭。删除流程依赖新服务；旧 health 没有 `accountDeletion` 时正式账号页面会关闭并提示稍后重试。

定时使用同样服务用户和环境运行 `npm run family-api:cleanup`，建议每小时至少一次。文件删除失败会保留队列并返回失败状态；部署验收要模拟一次失败重试。现有服务路径及 Node 可执行文件须从实际 unit / MainPID 核对，不假设 `/usr/bin/npm` 存在。

## Mac 构建与人工验收

按 `V1-SCOPE.md` 的 `--appstore-v1 --prepare` 生成工程，再用 Xcode 编译。账号联调需要目标 API 已部署 migration 32。

| 场景 | 通过标准 |
| --- | --- |
| 无账号冷启动 | 私人记录可用；家庭及设置只有 Apple 登录，无邮箱密码、测试或购买入口 |
| 首次 Apple 登录 | 创建账号，可设置昵称并创建家庭；没有自动加入收到的邀请 |
| 再次登录 | 返回同一身份、昵称及家庭；Apple 隐藏邮箱可用 |
| 邀请 | 登录后回到原邀请，仍需用户确认加入 |
| 取消、后台、保护 | 取消不创建／删除；失焦或锁定的授权结果不触发新请求；无内容泄露 |
| 退出 | 只退出本机，私人记录仍在，再登录正常 |
| 删除确认取消 | 账号、会话与分享均不变 |
| 身份不匹配 | 用另一 Apple 账号授权不能删除当前账号 |
| 创建者 | 有其他成员时提示先转交／解散；处理后可继续删除 |
| 普通成员删除 | 本人分享与媒体不可再读，家人分享保留；家庭册移除相关条目和封面 |
| 所有设备 | 删除后旧 token 不再读取家庭；本机私人记录和个人册仍可阅读 |
| Apple 撤销 | 正常路径服务端返回 revoked；失败路径显示手动撤销提示，账号仍已删除 |
| 清理失败 | 媒体 API 立即失效；维护任务／重启重试后文件及队列清空 |
| 重新注册 | 获得新 Lampy 身份，不恢复旧家庭或已删除内容 |
| 发布范围 | 家庭预览可用；购买、个人／家庭导出及打印验收仍无入口 |

真实 Apple 登录、撤销、服务器配置、Mac 重编及设备验收待用户执行。本 PR 的自动测试不能替代这些证据。
