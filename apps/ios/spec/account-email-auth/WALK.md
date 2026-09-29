# 邮箱注册／登录走查

独立 PR，基线 **`origin/main` `b1abc11`**（已含 #42）。未叠 #41。只改 `apps/ios`。PR 保持 OPEN。`identityLoopAccepted` 仍为 **false**。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 未开。

## SHA

| 端 | 值 |
| --- | --- |
| base `origin/main` | `b1abc11` |
| 本分支 head | `39c90e1` |

## 契约

- 无授权服务 URL：Apple 与邮箱服务端登录都不可用，并说明原因。
- 家庭产品入口仍只看 `EXPO_PUBLIC_FAMILY_ENTRY_OPEN`。
- 邮箱注册必须先验邮箱；未验证不得得到可访问家庭资源的会话。
- Apple 仍按稳定 Apple subject 查找用户。
- 同一种 Keychain 会话、恢复、退出、待撤销。
- 分别注册可能产生两个 Lampy 账号。本 PR 不做绑定。
- 个人 Moment / 照片 / 录音 / 回看留在设备。`ownerId=local-user` 不因切换家庭账号被改写。

## 删除账户

可执行：无有效家庭成员资格、且没有在**未解散**家庭里的分享时，删除会话、邮箱凭据、令牌和未再引用的媒体。

会拒绝：仍是创建者、仍是成员、或仍有活跃家庭里的分享。文案说明后果。不删除本机个人库。

因此 **邮箱注册默认关闭**（`account-delete-incomplete`）。创建者移交、分享/媒体完整回收另开切片。

## 密码与令牌

Argon2id 生产参数：`m=19456` KiB（19 MiB），`t=2`，`p=1`，`dkLen=32`。编码：`argon2id$m=…,t=…,p=…$salt$hash`。

验证令牌 24h、重设令牌 1h，随机 32 字节，一次性，库内只存 SHA-256。重设后撤销该用户全部会话。

## 邮件

测试注入内存 mailer。生产需要 SMTP 与发信域名。没有凭据时拒绝启用邮箱注册。不得把验证码写日志、画在页面，或用 mock 邮件声称生产已验证。

## 验收标记

| 项 | 结果 |
| --- | --- |
| tsc / lint / 相关与全量 Jest / `git diff --check` | tsc **PASS**。本切片改动的 eslint **PASS**。全量 Jest **558** 通过。`git diff --check` **PASS**。`expo lint` 仍有 leave/share 既有 error，本切片未改那些文件 |
| iOS 构建 | **NOT VERIFIED**（本机无已生成的 `ios/` 工程；未为这切片跑 prebuild/Xcode） |
| 真机邮箱登录 | **NOT VERIFIED** |
| 真实邮件收发 | **NOT VERIFIED** |
| 生产 HTTPS 邮箱 | **NOT VERIFIED**（本切片不改生产） |
| 第二账号 / 第二设备 | **NOT VERIFIED** |
| `identityLoopAccepted` | **false** |
