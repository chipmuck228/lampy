# 邮箱验证码登录（B1 邮箱部分）

本阶段在 PR139 的身份底座上实现 iOS/Android 共用的邮箱验证码：发送、验证、首次昵称、再次登录、绑定、重新认证、更换、退出和删除账号。手机短信、微信、Google、Android Apple 网页授权与 Android 家庭入口仍待后续实施。

## 使用与身份规则

“设置 → 登录与找回”仅在客户端明确开启、地址安全且服务端健康检查声明开放后可用。服务暂不可用时允许重试，不把网络错误当成未登录。iOS 家庭邀请可选择邮箱登录，完成后返回原邀请，由用户确认加入。

老用户先使用原来的 Apple/受控账号登录，再关联邮箱，才能继续使用原 userId 和家庭。独立邮箱登录不按 Apple 邮箱、受控账号邮箱或昵称合并。已被另一个账号占用的邮箱会报冲突。邮箱采用去首尾空白、NFC 和小写规范化，不合并 Gmail 点号或加号别名。

更换邮箱需要近期认证（5 分钟内）和新邮箱验证码；超时先验证当前邮箱。更换成功撤销其他设备会话。删除账号需要独立用途的验证码、明确确认，且必须先处理仍有其他成员的自建家庭。Apple 关联账号还需在 Apple 账号设置中停止使用 Lampy 登录。退出/删除云端账号不删除本机个人记录；登录也不自动上传或备份个人记录。

验证码为随机六位数字、5 分钟有效、最多五次错误、一次使用，按用途/邮箱/会话隔离。服务端仅存 HMAC 摘要。默认每邮箱 60 秒一次、每小时五次，每来源每小时 20 次、验证每 15 分钟 50 次，全局每天 200 封。发送失败也计入预算；失败的重发保留上一个有效验证码。SMTP 接受不代表邮件已进收件箱。成功发送的新挑战才替换旧挑战。

切换到邮件 App 后可继续输入；验证提交期间切后台或锁屏会隐藏内容并要求重新确认账号。不会将离开页面或切换账号后的响应提交给新账号。

## 服务端配置

配置只放服务端环境文件，禁止写入 EXPO_PUBLIC_*、Git 或客户端包：

```sh
LAMPY_EMAIL_CODE_ENABLED=1
LAMPY_EMAIL_CODE_SECRET=<至少32字节的随机服务端秘密>
LAMPY_SMTP_HOST=smtp.example.com
LAMPY_SMTP_PORT=465
LAMPY_SMTP_USER=<服务商用户名>
LAMPY_SMTP_PASSWORD=<服务商密码或授权码>
LAMPY_EMAIL_FROM=accounts@example.com
LAMPY_EMAIL_CODE_DAILY_LIMIT=200
```

可用 `openssl rand -hex 32` 生成秘密，独立保存，服务重启时保持一致；轮换后未用验证码失效。只支持 465 隐式 TLS 或 587 强制 STARTTLS，校验证书，不开放明文 SMTP。服务商需要支持应用发信；先完成发件域验证、SPF/DKIM/DMARC 并在测试环境验证中英文投递和垃圾邮件情况。不要开启 SMTP debug 或记录验证码/授权码。

服务默认按连接来源限流，不信任任意转发头。只有现有可信反向代理覆盖来源头且 API 只绑定 127.0.0.1 时才考虑 `LAMPY_EMAIL_CODE_TRUST_LOOPBACK_PROXY=1`；代理必须覆盖 `X-Lampy-Client-IP`，不能沿用客户端提供的值；部署监听设置见 `src/family-api/listen.ts`。不要为了限流打开公网直连的转发头信任。

部署前备份数据库及媒体，先在测试副本运行现有 `npm run family-api:migrate`。新增迁移 35 保存验证码挑战；依赖阶段 A 的迁移 34。旧身份、账号和家庭关系不重写。首次启动先保持关闭，迁移和 SMTP 验收后再打开。请求时及现有 cleanup 命令清理过期挑战；删除/冻结清理对应绑定挑战。按维护周期清理，并非到期瞬间物理删除。旧二进制不能在未评估的情况下回退写入新 schema。

接口：`POST /v2/auth/email-code/request`、`POST /v2/auth/email-code/verify`、`GET /v2/me/email-code`；健康检查新增 `emailCodeLogin`。登录请求不带既有 Bearer；其他用途必须绑定当前有效会话。

## 客户端开发与发布

示例地址必须替换成实际测试 API，并与 iOS 家庭配置指向同一后端；使用不同后端会产生不同账号库。本机调试私网 HTTP 可用，正式发行必须 HTTPS。

```sh
cd apps/ios
export EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED=1
export EXPO_PUBLIC_ACCOUNT_API_BASE_URL=https://your-test-api.example.com
```

Android 继续使用 `npm run android:prebuild`、`npm run android:release`（本机 JDK21 与 Android SDK）。personal 构建保留显式开启的上述两项配置，家庭/付费仍关闭。改变公共配置后重新打包 Release；旧 APK 不会自动获得入口。

iOS 开发沿用现有模拟器/真机流程。现有发布脚本默认重置邮箱开关，避免开发环境误入 TestFlight。只有在服务验收后，显式设置 `LAMPY_EMAIL_CODE_RELEASE_URL=https://your-api.example.com` 再运行原来的归档命令才会开启。若归档 profile 已有家庭 API 地址，该地址必须一致，否则中止。没有修改 Bundle ID、签名、Expo 版本或原生目录结构。

## 验收

自动化覆盖内存/SQLite 一致性、文件数据库重启及双连接领取、SMTP 失败/延迟/乱序、限流预算、过期/错误/重放、绑定冲突与不自动合并、冻结账号、换绑、注销、跨账号异步响应、邀请回跳、锁屏和后台恢复、发布默认关闭。

真实环境仍需：两端真实邮箱投递、错误/过期/重发、首次昵称、退出后同 userId 登录、老 Apple 账号绑定邮箱后跨端进入原账号、更换邮箱后旧地址不可登录原账号、重启后保留会话、邀请登录后显式确认加入，以及无网络/服务关闭的提示。Android 家庭入口未开放，跨端账号验证不等于家庭功能验收。

本次开发未配置真实 SMTP、未发送真实邮件、未部署或迁移生产库，未进行设备与 TestFlight 验收。
