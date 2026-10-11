# 源码现状（不是未来能力）

核对基线见 [README](README.md)。以下均来自该提交；未 SSH 核对生产版本。

| 源码 | 当前事实 | 后续缺口 |
| --- | --- | --- |
| src/family-api/schema.ts | migrations 1–16；第 5 项 family_memberships_one_active_per_user 唯一约束 | 不能仅 UI 增加多家庭；需追加迁移 |
| src/family-api/commands.ts | createFamily / acceptInvitation 查询单一 active membership；listMembership 返回单 family；leaveFamily 不带 familyId | 显式多家庭命令、列表和事务上限 |
| src/family-api/commands.ts | Apple 登录 deleteOtherSessions；创建者可邀请、移除、解散；退出文案提到转交 | 同账号多设备会话政策、真实转交命令尚需实现 |
| src/family-api/ids.ts | 默认邀请 TTL 已是 7 天；随机 token 有 Math.random fallback | 固定生产规则及安全随机失败即拒绝 |
| src/family-api/schema.ts | 邀请 code 明文、accepted_by_user_id，家庭无名称与清理截止时间 | 哈希邀请、网页最小信息、清理任务 |
| src/family-api/share-commands.ts | canSeeShare 要求 audienceUserIds 含读者且 joinedAt <= sharedAt | 新加入及重新加入读历史与现逻辑冲突 |
| src/family-api/share-commands.ts | revokeShare 先 requireActiveMember，再验证作者 | 前成员只能撤回本人分享的专用受限路径 |
| src/family-api/media-commands.ts | 通用媒体下载按 owner；分享媒体走分享授权 | 清理必须覆盖所有读路径及跨家庭引用，不能只隐藏 feed |
| src/application/family-use-cases.ts | 从单一 getMembership 推断分享目标；退出/解散清 account 级缓存 | 显式 familyId、目标不漂移、family 级清理 |
| src/infrastructure/family-receive-cache.ts | 已有 isolateAccount / isolateFamily / isolateShare 与待清理记录 | 复用现能力，验证真实文件失败与重启恢复 |
| src/family-api/http.ts | 已有邀请接受、分享和撤回；没有公开邀请预览或转交接口 | 追加受控接口及网页 / Universal Links |
| .env.production / src/infrastructure/family-config.ts | Release 家庭入口及 API 地址关闭；授权 URL 和入口开关分开 | 保持不改；health 不作为身份闭环验收 |

listPendingInvitations 是创建者管理发出的邀请，不是接收者内部收件箱。现库迁移与个人库迁移是不同体系，不得因编号相似混用。

Apple 登录、Keychain 恢复、退出及受控测试账号复用，但不推断手机号注册、账号绑定、账号删除已存在。家庭 HTTPS 服务的曾有部署不证明本基线已上线。
