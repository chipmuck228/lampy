# 家庭 API 部署交接（单实例）

本目录仅为模板；本轮不部署、不修改DNS/证书/生产env，不提供虚构主机或测试账号。当前功能已包含v2邀请、历史Moment快照与媒体、成员管理/解散、资料昵称，schema26；旧“只身份/不分享、schema13”的部署说明不再适用。

当前交接与完整门槛见 [Phase F1](../../../spec/family-public-preflight-f1/README.md)。早期 `family-identity:accept` 是身份切片探针，不能验收当前多家庭/邀请/历史媒体全闭环，不自动据其开启家庭入口。

在主机外部env填写真实值；反代使用HTTPS，Node只bind127.0.0.1。数据库及媒体路径在独立持久卷，唯一Node写进程；模板里的路径与hostname均须操作者核验。`env.example`默认不开放新功能，额外invites/history开关只在获准隔离联调配置里设置。

先停服备份数据库/WAL/SHM及媒体并演练恢复，再从 apps/ios 执行 `npm run family-api:migrate`。媒体清理为独立受控任务 `family-api:cleanup`，不是部署时自动运行。不得删除生产或个人原件。

正式公网候选不暴露当前未验证邮箱/受控测试账号登录；真实Apple能力、身份与两设备证据另验。真正账号删除、恢复和正式注册治理仍未交付。

`npm run family-api:public-preflight`只读配置及文件元数据，输出不含变量值；exit0仅表示候选配置检查通过，publicReady/identityLoopAccepted保持false。不会迁移、运行API、探测网络、证明SQLite/挂载、TLS、AASA或设备通过。
