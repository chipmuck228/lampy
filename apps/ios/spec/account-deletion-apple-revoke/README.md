# 账号删除与 Apple 撤销：第一片授权基础

基线：main c6cad6d7e9b6c2fc350929921d0a987200192678（#108 merge）。本片从独立分支实现，门控默认关闭；没有部署公网、上传 TestFlight 或删除任何用户。

## 已实现

- Apple challenge 固定本次是否要求 authorizationCode；开启门控后原生授权返回的 code 与 identityToken 一次提交。客户端沿用邀请返回、当前账号、前台资格与本机保护；无 code 持久化或日志。
- 服务器先验证 nonce／身份／绑定冲突，再向 Apple HTTPS `/auth/token` 交换一次性 code，再验证返回 token 的 subject／nonce。交换失败不创建账号、不改变绑定；迟到交换不能绑定已失效会话。
- refresh token 用 AES-256-GCM 加密；AAD 绑定 clientId、keyVersion、userId、subject 与指纹。HMAC 指纹仅用于同一 token 去重；不同授权产生的 token 全部保留，后续删除任务可逐一撤销，不依赖“撤销一枚等于全部撤销”的假设。
- 迁移 30：challenge 的 grant_required 与 family_apple_grants。历史迁移 1–29 不改。启动时开启 capture 会检查已有密文能否解密，错密钥拒绝启动，不覆盖数据。
- 撤销适配器调用 `/auth/revoke`，200 视为成功；网络／非200错误脱敏抛出。只有适配器，没有公开撤销接口、账号删除端点、后台持久任务或删除按钮。

## 部署前置条件（本轮尚未执行）

服务端配置：

| 配置 | 内容 |
| --- | --- |
| LAMPY_APPLE_GRANT_CAPTURE | 默认未设置／0；准备完成后才用 1 |
| LAMPY_FAMILY_API_MODE | production |
| LAMPY_APPLE_LOGIN_ENABLED / LAMPY_PUBLIC_TEST_LOGIN | 本片要求均为 1，仍是内部受控环境 |
| LAMPY_APPLE_CLIENT_ID | app.lampy.ios |
| LAMPY_APPLE_TEAM_ID | B283NY984J |
| LAMPY_APPLE_KEY_ID | Developer 中已为 Lampy 配置 Sign in with Apple 的真实 Key ID |
| LAMPY_APPLE_PRIVATE_KEY_PATH | 服务用户可读的 .p8 文件绝对路径 |
| LAMPY_APPLE_GRANT_KEY_PATH | 32 字节随机 AES 密钥的 base64 文件绝对路径 |
| LAMPY_APPLE_GRANT_KEY_VERSION | 默认 v1；不能靠改版本完成轮换 |

两种密钥只存服务器受保护文件，0600 或受控组0640。不可提交 git、放 EXPO_PUBLIC、复制进应用包或发送到聊天。加密密钥与数据库备份必须配套保管；不得重新生成密钥覆盖既有文件。本片没有密钥轮换／旧密钥环。

部署前停服务并一致备份代码、数据库和密钥；迁移30后使用匹配新代码。旧29代码 challenge INSERT 列数不同，不能直接回滚代码继续写新库；回滚需匹配的代码和数据库备份并评估部署后新增数据，不覆盖用户新数据。

**先发布本片客户端，再开启 capture。** 默认关闭时 Build8/9 保持原登录；开启后旧包不提交 code，将返回更新／重新授权错误，不能声称门控开启后旧客户端兼容。门控只适用于新建 challenge；关闭时已出生的要求 code 的请求失败并须重试。旧 challenge 最长5分钟仍按出生资格执行。

已有账号不会自动补 refresh token；下次明确授权才收集。health.appleGrantCapture 仅表示配置可用，不证明真实 Apple 接口成功。真实 .p8／授权码交换／撤销须用可丢弃 Apple 测试身份核验，不能撤销主测试员的有效授权来代替。

## 下一片

见 [删除契约](DELETION-CONTRACT.md)。本片不是可发布账号删除能力；完成删除入口、立即访问失效、持久清理与 Apple 撤销闭环之前，不能扩大为正式开放账号创建。

## 官方依据

- [Apple TN3194：处理账号删除与撤销](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)：没有可撤销 token 也必须履行账号删除，不能阻塞删除。
- [Token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)：使用服务端 client secret；200 包括已失效令牌。
- [Token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)：授权码交换 refresh token。
