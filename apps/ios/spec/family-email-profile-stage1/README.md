# 受控邮箱账号与 Profile：第一阶段

基线：main 13526b2690f05adcb3c5269aa163b78088178463（#99 merge）。独立分支 ios/family-email-profile，不复制旧家庭分支，不操作生产或 Liuz17。

## 用户契约

邮箱格式账号 + 密码 + 昵称创建后即登录。邮箱只作登录标识，不发送邮件、不声称验证所有权；trim/NFC/lowercase 后唯一。密码沿用10–128字符策略与Argon2id（生产参数19MiB / 2 / p1，测试显式快参数）。密码不入日志、profile或个人库。昵称NFC/trim、1–24个Unicode字符、可重复、禁止控制/换行；头像只能是系统默认图标。权限依赖userId，昵称/邮箱不替代身份。

沿用受控test_credentials存储和会话校验，旧CLI测试账号不被重命名或迁移；邮箱接口可登录已有邮箱格式受控账号。不存在邮箱验证、找回密码、账号删除、公开注册、付费或Apple/邮箱合并。相同邮箱的Apple身份保持独立。关闭LAMPY_TEST_ACCOUNT_LOGIN会阻止这些受控账号所有读/写会话；关闭新的邮箱入口开关只关闭新邮箱注册/登录路径，既有受控测试登录策略不变。

注册网络返回丢失/离开后可能已创建账号；服务端已完成的创建不自动回滚。再次创建提示已有账号，可用原密码登录，不重复创建。客户端失焦/后台/锁定后迟到登录不落本地会话、不会导航/自动加入；服务器新会话尽力只撤销自身，离线时由既有TTL到期。新旧提交锁按请求归属；身份提交串行，取消不能清掉后来账号。

## 开关与入口

服务端必须同时LAMPY_TEST_ACCOUNT_LOGIN=1和LAMPY_CONTROLLED_EMAIL_ACCOUNTS=1；health.controlledEmailAccounts是明确可用信号，未设置默认false。保留原测试登录/Apple路径。

客户端必须EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS=1、家庭入口开启、诊断允许、已解锁，再查询服务端开关。Release .env.production、release-public-env.sh及applyClosedReleasePublicEnv均强制关闭新开关；本切片不改家庭正式开放决策/identityLoopAccepted。

- /family-email-account：登录/创建账号页，纸色、系统字形、现有48pt/键盘避让可滚外壳。家庭未登录入口和开发诊断提供入口。
- /family-profile：自己头像/昵称编辑，仅查询/me，不可用提交userId修改别人。家庭页登录后和开发诊断可进入。旧账号无profile时空昵称等待本人填写，不编造姓名。
- 邀请“登录后加入”：沿用当前邀请generation，嵌入账号页；登录/创建成功返回保留原输入和邀请，重新核对后仍需用户确认加入。其他登录方式保留Apple/旧测试登录。取消不消费邀请；邀请已替换则不误返回旧邀请。

成员头像墙与分享者昵称属于后续第二/三阶段，本PR不改家庭成员/分享UI，不增加底带，不改个人记录/播放/保护/生活册。

## API / 数据

Migration26只追加family_user_profiles(user_id,nickname,updated_at)，1–25不改。注册同一事务保存账号、凭据、profile、会话；独立设备会话保留，单设备退出不撤其他设备。创建不迁移local-user个人记录、不修改ownerId。

- POST /v2/auth/email/register {email,password,nickname} → SignInResult（201）
- POST /v2/auth/email/login {email,password} → SignInResult
- GET /v2/me/profile → {userId,nickname,avatar:'system',updatedAt}，不包含邮箱或凭据
- PATCH /v2/me/profile {nickname}，身份只从Bearer会话取，忽略body的userId/avatar/email

注册按socket peer（不信请求体/转发头）8次/15min、邮箱4次/15min；登录peer8次/15min +原账号限流8次/15min，SQLite持久化。重复账号返回明确已有提示，仅受控环境；未知/禁用/错误密码统一AUTH_FAILED。公网滥用防护、验证邮件、恢复、删除仍为正式开放前待补，不把本切片当公网安全验收。

## 隔离走查

先停止API、备份已有隔离SQLite，执行npm run family-api:migrate到26；重启同一隔离服务，增加LAMPY_CONTROLLED_EMAIL_ACCOUNTS=1且保留LAMPY_TEST_ACCOUNT_LOGIN=1、history/invites开关。Metro增加EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS=1。无新增原生模块/依赖，不需为此切片重建Dev Client，需Reload新JS。

两模拟器不同邮箱创建（建议@example.com合成账号，不用真实密码）、登录/退出/重开、昵称保存；同昵称不串号；从邀请创建/登录返回、取消、邀请过期/替换、网络失败重试；后台取消不会迟到登录/操作；锁定遮挡。测试开关关闭及Release入口不可达。真实键盘/短屏/横屏/iPad/VoiceOver均需实页，自动化不是设备PASS。

正式注册前仍需验证邮箱/恢复/账号删除与数据处置；不部署公网API、不上传TestFlight、不实现付费。
