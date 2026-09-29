# 邮箱注册／登录（与 Apple 并列）

独立切片，基线 **`origin/main`（含 #42）**。只改 `apps/ios`。不叠 #41。不改微信代码。不开放家庭正式入口。`identityLoopAccepted` 保持 false。

Apple 与邮箱都在 `family.yunpura.com` 身份服务验证后签发同一种 Lampy 会话。家庭 API 的 `userId`、成员资格和授权规则不因登录来源分叉。

## 不做

- 按邮箱字符串（含 Apple 私密转发）自动合并账号
- 账号绑定
- 用删除本机个人 Moment 冒充服务端删号
- 生产库 / 生产 env / DNS 变更
- 把 mock 邮件或本机 HTTP 写成公网 PASS
