# 阶段 A：统一身份与会话隔离

实现基于 main `8baf7f6`，保留个人记录和个人册闭环。没有升级 Expo、修改原生模块、iOS 签名/构建号或发布配置。

## 已实现

- 新增服务端迁移 **34**：身份主键扩展为 provider + namespace + subject，保留 legacy 命名空间的 Apple/受控密码身份。预留微信、Google、手机号验证码、邮箱验证码类型；单纯存储支持不授予登录能力。
- 同一账号在同一 provider/namespace 中只允许一个身份；跨账号绑定、同范围替换由内存和 SQLite 同时拒绝。没有按相同邮箱、昵称或第三方 subject 跨命名空间自动合并账号。
- 既有 userId、家庭关系、作者归属、分享、个人记录和会话 token 均不重写；新迁移可重复执行，失败整体回滚。内存仓储现在也在事务失败时回滚，避免部分写入与 SQLite 语义不一致。
- 独立账号状态 active/suspended；冻结撤销全部会话与待完成的 Apple 账号挑战，认证与家庭/媒体访问检查账号状态。重新启用不复活旧会话。原有受控密码禁用规则继续生效，不允许从关联 Apple 绕过。
- 新登录的服务端会话记录认证时间与认证身份。更改登录方式需要最近五分钟认证；旧会话仍可正常访问家庭，但没有近期认证证明，需重新登录才能改绑定。
- Apple 绑定继续使用一次性 nonce 挑战，并在绑定提交前检查当前会话的近期认证与其原凭证仍存在。供后续适配器使用的 attachVerifiedLoginIdentity 是**服务端内部函数**，不是客户端可传“已验证”标记的接口。
- 受保护的登录方式列表和解绑命令：不返回原始 subject；保留至少一个当前可用的登录方式；必须通过将要保留的凭证近期登录。解绑同步处理旧 Apple 字段或旧密码记录，并撤销其他设备会话。不可用的新渠道不计作备用方式。
- 系统安全存储的同一 KV 实例共享递增身份代次和写队列；提供原子账号快照。服务端会话元数据不写入客户端登录配置，长凭证仍由 SecureStore 保存。
- 生产家庭 HTTP 传输统一检查账号/会话/代次，在身份变化时中止旧请求；即使底层网络不响应 abort，也丢弃迟到结果。覆盖 JSON、上传及媒体字节；旧会话撤销请求单独放行，不能借此读取旧账号数据。
- 家庭历史、家庭册和安全操作的账号检查加入身份代次，防止 A → B → A 后旧任务被重新认可。普通分享任务固定最初账号，迟到上传不会恢复旧状态；待处理操作继续按 userId 隔离，身份不确定时保留原幂等键，不转交另一账号重试。
- 登录提交与退出登录串行化，防止慢退出清掉新账号。旧账号的迟到 401 不清除新账号会话。旧接收任务在账号变化后不提交可见结果，并隔离该旧账号任务对应的缓存。

## 默认关闭的管理接口

服务端 `LAMPY_LOGIN_MANAGEMENT_ENABLED=1` 才允许：

- `GET /v2/me/login-methods`
- `POST /v2/me/login-methods/unlink`，请求 `{provider, namespace?}`

默认不设置此环境变量，返回 FORBIDDEN。本阶段没有 App 管理界面；需要管理测试时通过测试环境调用接口。用于解绑的保留渠道还必须按原有开关启用。`REAUTHENTICATION_REQUIRED` 表示应重新使用将保留的方式登录，`LAST_LOGIN_METHOD` 表示不能解绑最后一种可用方式。

账号冻结方法 `FamilyTx.setAccountStatus` 仅是服务端可信内部能力，本 PR 不增加公开冻结/解冻 API，也不把管理员权限交给客户端。没有公开微信、Google、短信、邮件验证码登录或注册路由。

## 验证与部署

```bash
cd apps/ios
npm ci
npx tsc --noEmit
npx jest --runInBand src/family-api src/application/family src/application/test-account-use-cases.test.ts src/infrastructure/secure-family-session.test.ts src/infrastructure/family-session-transport.test.ts src/infrastructure/family-http-client.test.ts src/screens/family-email-account-screen.test.tsx
npm run test:android
```

新增测试覆盖：旧数据库迁移/损坏回滚、身份命名空间与冲突、两个 SQLite 连接竞争同一身份、重开数据库后的状态保全、近期认证、最后凭证保护、解绑旧登录路径、并发解绑、冻结与恢复、默认渠道关闭；客户端覆盖迟到 JSON/上传/媒体、ABA 切换、401、共享 SecureStore 写队列与并发退出/登录。

服务端部署前备份已有 SQLite 数据库和媒体目录，并验证副本迁移。原有服务启动器会运行 applyFamilyApiSchema；也可在维护窗口使用项目的 `npm run family-api:migrate`。准备新的服务端代码时，必须把迁移 34 与仓储代码一起交付，不能只替换客户端。此 PR 未操作线上数据库、未重启线上服务、未上传 TestFlight。

后续阶段 B 负责真实渠道证明、验证码发送/校验、账号管理页面及完整找回流程；本阶段不提供“凭昵称/家庭成员恢复账号”、恢复码或自动账号合并。中国/海外两端真实 SDK、系统回跳、双设备切换和真实网络验收仍需阶段 B/C 完成，测试替身不能替代。
