# 1.0.0 隐私与提交收口

日期：2026-10-21。基线：main a17bdc80e74de528ff37419cd969f469ed8e1ab7，已合并 #127、#128。本片整理实际行为、保留提案、App Privacy 与商店工作稿；仅文档，不部署清理策略、不发布官网政策、不提交商店问卷。#125 保持暂停，#126 不整体合并。

## 产品边界

私人文字、照片、声音和个人册默认留在本机，不要求登录。只有主动分享的家庭内容进入家庭服务；家庭册保存记录引用、册名、开篇、封面与顺序。成员设备按需接收阅读副本，不保证完整持有家庭库。Lampy 是记录系统，不提供私人库云备份、丢机恢复或异常恢复承诺。

1.0.0 新录音最多 1 分钟，已有长录音可播放。个人／家庭连续阅读、素纸、手作及纸页预览免费；购买、恢复购买、所有成品导出和打印关闭。Resend、个人云空间、内容包导入和高级版式不进入本轮材料。

## 证据账本

| 项目 | 实际证据 | 边界 |
| --- | --- | --- |
| Apple 登录与账号删除 | #123，操作者 iPhone 17 Pro / iOS 26.3.1 真机通过 | 不是磁盘介质安全擦除证明 |
| 举报、屏蔽、过滤及运营处理 | #127，TestFlight 1.0.0（12），双 iPhone 17 Pro / iOS 26.3.1 | 有限文字规则，不是全媒体自动审核 |
| 图形 Admin | #128，功能提交 0daecc1，操作者九项云端验收通过 | 不额外宣称所有浏览器、密码轮换或审计到期实测 |
| 清理 timer | 2026-10-19 实际定时执行成功，checked=0、failed=0 | 调度已证实；没有待删样本，不代表文件擦除已测 |
| 原照片 | JPEG、EXIF=true、GPS=PRESENT | 原样本带位置 |
| 对应家庭服务器副本 | matchedShares=1、matchedImages=1、integrity=MATCH；EXIF=true、textMetadata=true、GPS=UNKNOWN | 不能证明去位置；UNKNOWN 也不等于已发现 GPS |
| 日志 | Caddyfile 静态适配无请求日志；journald 无显式保留上限；rsyslog active、weekly/rotate 4 | 不是 live Caddy 证明；四轮周轮转不是精确 28 天上限 |
| 云快照／运维数据库副本 | 未取得实际策略及存量 | 不承诺所有副本即时永久消失 |

旧数据库探针基于 schema 32，不能替代 schema 33 加 Admin 审计表的当前复核。只记录聚合数量与配置结果，不把私人照片、坐标、账号、IP、令牌或数据库上传公开仓库。

## 当前实现依据

- src/infrastructure/expo-apple-auth.ts：requestedScopes=[]。src/family-api/apple-auth-commands.ts 新账号不保存 email/fullName；昵称是自填账号显示名。支持邮件另算，不能因此声称从不接触任何邮箱。
- src/application/family-history-use-cases.ts：只有 HEIC／HEIF 调转换，JPEG／PNG 可直接上传。exif:false 不能证明文件去元数据。src/infrastructure/family-share-image.ts 没有全格式去位置验收。
- src/family-api/share-commands.ts：撤回写 status/revokedAt，不当场清 snapshot 或文件；Admin 同样拒绝读取已撤回内容。
- account-purge-sqlite.ts、account-deletion.ts：删除账号、身份、会话、本人分享和相关举报／屏蔽，媒体排队／尝试删除，失败持久重试。本机私人库不随账号删除。
- commands.ts、family-cleanup.ts：解散家庭 30 天 deadline，小时任务、有限批次和失败重试。不是“第 30 天整所有字节消失”。
- apple-auth-commands.ts：来源 IP 持久写入 SQLite 限流桶。窗口过期不等于行删除；到期会话同理。
- src/family-admin/service.ts：30 天清理只针对 family_admin_audit，不能扩展为举报或业务处理审计的统一期限。引用可关联对象，不是匿名化证明。

## 提交门槛

| 编号 | 工作 | 完成条件 |
| --- | --- | --- |
| PRIV-01 | 照片分享副本去元数据或据实披露 | 已知 GPS 的 JPEG、PNG、HEIC 真机分享后检测；历史副本单独处置，不改私人原图 |
| PRIV-02 | 保留规则实施 | 按 V1-DATA-RETENTION.md 评审、实现、测试、部署；不直接跑宽泛 SQL 删除 |
| PRIV-03 | 日志与快照 | live Caddy、journald、rsyslog、系统与云快照、部署数据库副本分别核对 |
| PRIV-04 | 最终安装包 | 实际 Release Archive 的 SDK、隐私 manifest、required-reason API 与 tracking domains 核对 |
| STORE-01 | 公开政策 | 运营主体、处理地域、实际隐私／支持 URL 与包内说明一致，真实无登录打开 |
| STORE-02 | App Privacy | 按 V1-APP-PRIVACY.md 对照最终包／服务器填写，不选未收集数据 |
| STORE-03 | 审核资源 | V1-STORE-SUBMISSION.md 中完整审核访问、截图、年龄分级与加密问卷完成 |

这些门槛不要求开放付费或导出。本片无代码改动，无需重新构建或部署。

## 文件入口

- [保留提案](V1-DATA-RETENTION.md)
- [App Privacy 工作底稿](V1-APP-PRIVACY.md)
- [隐私政策发布工作稿](V1-PRIVACY-POLICY-DRAFT.md)
- [商店元数据与审核工作稿](V1-STORE-SUBMISSION.md)

官方来源于 2026-10-21 核对：[App Privacy](https://developer.apple.com/app-store/app-privacy-details/)、[审核指南](https://developer.apple.com/app-store/review/guidelines/)、[年龄分级](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)。分类和门槛是将官方定义应用于本实现的判断，不是 Apple 已批准本产品。
