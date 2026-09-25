# 家庭能力审计

日期：2026-09-25。对照仓库 `c6b8d4b` + Phase 3A 文档提交。**产品决策已写入 ADR 0006 与本目录其它 FAMILY_* 文件。下列「实现」栏是仓库事实，不是愿望。**

## 个人（已实现，本轮不得回归）

| 能力 | 状态 |
| --- | --- |
| 未登录个人 Moment / 媒体 / 回看 / 感受 | 已实现（iOS SQLite） |
| 个人默认私密 | 已实现（无家庭出口） |
| 媒体本机 persist / 失败恢复 | 已实现 |

## 家庭（决策已定）

| 能力 | 产品 | 实现 |
| --- | --- | --- |
| Sign in with Apple + 服务端 `userId` | 已决定 | 命令与 JWKS 校验接口在 `src/family-api`。测试可用注入 verifier。生产 JWKS + 真机 Apple：**未部署 / 未验证** |
| 创建家庭 / 邀请 / 撤销 / 接受 / 列表 / 退出 / 移除 / 解散 | 已决定 | 服务端命令 + HTTP + iOS use case 已测。内存存储。无家庭页。公网：**未部署** |
| 一个账号一条 active 家庭（结构可扩展） | 已决定 | 业务层强制；成员表允许多行 |
| Moment 分享 / 时间线 / 接收快照 | 已决定规则 | 未交付；本轮不做 |
| 接收快照退出后 App 内不可读 | 已决定（清家庭缓存） | 未交付（无快照） |
| 服务端停供 vs 不承诺收回导出 | 已决定 | 未交付 |

## 现有代码易混淆点（仍成立）

- `ownerId` 默认 `local-user`：设备本地身份，不是账号。
- `Transmission.status === 'sent'`：本地出站意图，不是家人已收到。
- `receiveNearbyLight`：nearby-mock，不是家庭接收。
- `accessSummary`：展示摘要，不是 ACL。
- iOS `sql.ts`：`moments` / `drafts` / `assets` / `record_quarantine`。无 users / families / transmissions 表。
- 无独立 `apps/server`、无生产密钥、无 `expo-apple-authentication`、无家庭路由。F1 模块在 `apps/ios/src/family-api`。

## 禁止

用本地假成员、mock 网络 200、或个人列表换标题宣称家庭完成。
