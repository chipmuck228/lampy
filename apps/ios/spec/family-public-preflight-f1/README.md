# Phase F1 · 受控公网联调准备

基线：#102 普通 merge `76586caf59c81312d1108f6b3ff7d177f75e9b05`。这是配置预检与交接，不是部署或公网验收。两模拟器阶段 B–E / Profile 通过不等于双真机 Phase F 通过。

## 现状与下一步

现有 API 已有邀请网页、AASA、原生 associated-domains 插件、Moment 快照媒体与昵称、成员转交及解散清理。旧 deploy README 的“仅身份、不部署分享”及“main 到 13”已过时。本稿与更新后的部署说明针对 schema 26。

F1 提供只读配置预检；F2 是获准后的隔离公网单实例部署及真实邀请域名 / HTTPS / AASA 检查；F3 是两真实账号、双真机邀请分享与离开收权闭环。阶段名不要与早期媒体 F2 序号混用。

暂缺真实受控主机、经确认的域名/DNS权限、独立持久卷、备份恢复策略、Apple 能力与两真实设备。仓库中的 family.yunpura.com 不代表服务已获授权或可用。TestFlight/App Store 安装链接也必须由操作者提供；不得把 yunpura.com 官网当 App Store 下载链接。

## 配置预检

在 apps/ios 执行 `npm run family-api:public-preflight`。读取当前 shell 环境；不会启动服务、创建/迁移库、访问数据库、发送请求、查询 DNS、打印变量值或修改任何文件。

输入变量：
- 现有服务配置：LAMPY_FAMILY_API_MODE=production、LAMPY_APPLE_CLIENT_ID=app.lampy.ios；host=127.0.0.1、有效 port；invites/history=1。
- LAMPY_FAMILY_INVITE_ORIGIN 与 EXPO_PUBLIC_FAMILY_API_BASE_URL：同一待验证 HTTPS origin；不接受 IP、示例域、路径/凭据/query/fragment。
- LAMPY_FAMILY_DATABASE_PATH：已有库文件；LAMPY_FAMILY_MEDIA_PATH：已有媒体目录。
- 新增仅预检变量 LAMPY_FAMILY_PREFLIGHT_VOLUME_ROOT：两者经 realpath 都在此现有根目录下。不会将普通目录称为持久卷。
- 这个公网候选配置要求 LAMPY_FAMILY_API_TEST_TOKENS、LAMPY_TEST_ACCOUNT_LOGIN、LAMPY_CONTROLLED_EMAIL_ACCOUNTS 关闭。当前未验证邮箱注册仅留在本机隔离测试；不自动把它部署上公网。

exit 0 只表示配置检查通过；exit 2 表示配置缺失/不符。报告始终 publicReady=false、identityLoopAccepted=false。schema、真实挂载、单实例、DNS/TLS、AASA/entitlements、真实身份和双机等仍 NOT VERIFIED。即使输入文件不是真 SQLite，也只能得到“配置路径存在”；绝不声称已验证库。

## 获准部署后的交接清单（本 PR 不执行）

1. 固定 Git SHA、Node/runtime版本；独立主机单进程，隔离库与媒体目录不与生产共用。
2. 停服备份库/WAL/SHM和媒体；演练可恢复后 `npm run family-api:migrate` 到26；记录实际schema、服务端SHA。清理是独立任务，不能当迁移执行。
3. HTTPS反代到loopback；确认证书、DNS、公网健康、无令牌日志。真实挂载、pid变化、重启后数据需设备/主机证据。
4. 开放邀请/history仅用于获准隔离联调；AASA appID=B283NY984J.app.lampy.ios，/invite。客户端受控安装构建API域名和associated-domains一致。此项改变原生entitlements，需要重新构建，不是Metro Reload；不能套用本轮JS-only规则。
5. 网页查看不会加入；App内登录后仍明确确认。未安装用户安装后重新打开原链接/扫原二维码；没有自动恢复安装前token能力。
6. 真实Apple登录先验收。若希望继续用邮箱测试账号做公网，需另行交付限制策略；本轮工具不将本机受控注册等同已完成公网认证。
7. 双真机测试创建→外部IM邀请→安装/打开→确认加入→文字/图/声分享→昵称与身份→撤回/离开/移除→保护→重启持久。每项记录设备/OS/构建JS SHA/API SHA/数据库schema。
8. 停服或关服务flags回滚；不要删除个人库或把v2家庭改回legacy。已有授权/缓存要按现行收权重查，不以旧内容冒充通过。

未开放正式注册、账号删除、找回密码、付费、家庭Release入口、identityLoopAccepted或TestFlight。正式注册仍需邮箱验证/恢复/真正账号删除及数据处置；正式分发还需治理与联系渠道审查。
