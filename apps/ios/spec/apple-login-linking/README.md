# Apple 登录与明确关联（内部测试）

基线：#107 普通合并后的 main `9c1887eb5e7aee5e0278f62577761414afce961f`。

## 产品与身份规则

- 家庭登录页保留受控邮箱密码，服务端声明 `appleLogin: true` 且设备支持时显示官方 Apple「继续」按钮。登录完成复用原邀请返回，不自动接受邀请。
- 首次 Apple 登录创建稳定 Lampy userId；再次登录按 Apple subject 找到同一账号。不按真实邮箱或 Hide My Email 合并，不请求邮箱／姓名 scope，不覆盖昵称。
- 设置 → 我的资料内明确确认「关联Apple账号」。当前会话决定目标账号；关联只添加身份，不改变 userId、家庭、昵称、分享或本机记录。
- 同一 Apple 身份只能关联一账号；当前账号已有另一 Apple 身份也拒绝。冲突不合并、不转移。已关联显示状态；本片不提供解除关联。
- 系统授权可能使 iOS 短暂 inactive，页面保留请求，但内容仍遵从原本机保护。只有 active 且已解锁才提交授权结果；真正 background、失焦、退出或账号更换使迟到请求失效。
- 取消发生在服务器已接受关联之后不能回滚远端写入；迟到回调不会导航、改本地身份或覆盖新的请求。未开始的完成请求不再发送，迟到登录产生的独立会话会尝试撤销。

## 服务端与迁移 29

追加 `family_apple_challenges`；1–28 不改。服务端使用 Node CSPRNG 生成独立 challengeId 与 nonce；5 分钟有效，成功／失败验证前均一次性认领，失败需重新发起授权。关联 challenge 绑定 userId 和当前 sessionToken，JWT 验证前后均核对存活会话。启动新版本服务／迁移脚本会应用 29。

新增：
- `POST /v2/auth/apple/challenge`：intent=`login`／`link`，link 需要 Bearer。
- `POST /v2/auth/apple/complete`：challengeId＋identityToken。
- `GET /v2/me/apple`：仅返回当前账号 linked 状态，不返回 Apple subject／邮箱。

JWKS RS256、issuer、audience、expiry、subject 与 nonce 校验。JWKS 网络请求 10 秒超时。challenge 每 peer 每分钟最多 10 个，沿用公网认证并发／body／可信代理限制；不输出 token／nonce 日志。

公共受控服务只放行运营者配发的启用密码身份，另在 Apple 门控开启时放行已验证的 Apple 身份。已停用的受控账号不能通过其关联 Apple 绕过停用。旧 `/v1/auth/apple` 在 production 明确关闭，不能绕过 nonce；仅隔离 test 模式保留旧测试路径。

## 门控与部署（本 PR 不部署）

`LAMPY_APPLE_LOGIN_ENABLED` 缺省关闭。现有服务和 Build 7 不自动出现 Apple 入口。先停服务并备份匹配代码、env、SQLite（含 WAL）与媒体，再更新代码和迁移；检查版本 29。原 controlled-password 映射、会话和资料不应改变。

仅在 family-test 隔离服务环境中设置：

```sh
LAMPY_APPLE_LOGIN_ENABLED=1
LAMPY_APPLE_CLIENT_ID=app.lampy.ios
```

保留现有公网受控登录、127.0.0.1 绑定、可信 Caddy proxy、HTTPS 和 durable database 配置。重启后 health 才声明 appleLogin=true。不开放 legacy test token、邮箱注册或开发诊断。

iOS 已有 expo-apple-authentication 与 usesAppleSignIn；核对 Apple Developer 的 app.lampy.ios 已开启 Sign In with Apple，Team B283NY984J，签名 entitlement `com.apple.developer.applesignin`。Linux 本轮无法核对实际开发者后台／签名包。沿用仓库 Release 兼容补丁和 family-internal Archive 流程，在 Mac 新构建后验收；旧 Build 7 没有本片 UI，不能代替新构建验收。

回滚须恢复相匹配代码和备份库。迁移后有新写入时不要直接恢复旧库丢失资料。单纯关闭门控会阻止新 Apple 登录，不能等同账号删除。

## 边界与后续

不做邮件链接、Google、微信、公开邮箱注册、解除关联、账号删除、正式上传或部署。Apple 撤销授权的服务端通知、refresh token／授权码交换、账号删除时撤销令牌仍是后续发布闭环，不能声称已有。当前 Lampy session 有服务端有效期；本片不宣称用户在 Apple 设置撤销授权能即时撤销所有既有 Lampy 会话。公开支持账号创建前须完成账号删除与相应 Apple 令牌撤销。

依据：Expo AppleAuthentication nonce 原样传入原生；Apple 官方要求验证 identity token 且核对请求 nonce。查阅 2026-10-11：
- https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple
- https://developer.apple.com/documentation/signinwithapple/receiving-a-users-identity-token
