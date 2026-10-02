# 受控测试账号：部署与双账号走查

独立于 #43 / #44 的操作任务。代码基线：`origin/main` **`f8e9199`**（含 #43 `ba494f8`、#44 `f8e9199`）。

本任务**尚未在生产执行**。`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 保持关闭。`identityLoopAccepted` 保持 **false**，直到双账号、双设备和部署持久性证据齐全。

合并 #43/#44 **不等于**已部署。当前公网 `https://family.yunpura.com/health` 仍无 `testAccountLogin`；`POST /v1/auth/test-account` 仍为 `Unknown family API route`。

## 1. 备份、迁移 14–16、部署 API（开关关闭）

在主机上、停写或 `wal_checkpoint` 后备份 `family.db` / `-wal` / `-shm`，确认能按同一路径恢复。再对生产库跑 `npm run family-api:migrate`（14–16）。部署含 #43+#44 的 `family-api`。

此时 **不要** 设 `LAMPY_TEST_ACCOUNT_LOGIN`，**不要** 设 `EXPO_PUBLIC_FAMILY_ENTRY_OPEN`。`GET /health` 应出现 `testAccountLogin: false`。

| 项 | 结果 |
| --- | --- |
| 生产库备份与恢复演练 | **NOT VERIFIED**（本环境无主机 SSH） |
| 生产迁移 14–16 | **NOT VERIFIED** |
| 部署 `f8e9199` | **NOT VERIFIED**（公网仍为旧进程） |
| 测试登录 / 家庭入口保持关闭 | 部署前公网仍无该端点；部署后须再核 |

## 2. 两个受控账号（短时开登录）

主机 CLI 对**已迁移**的生产库 `create` 两个登录名，得到不同 `userId`。密码用隐藏 TTY、`0600` 文件或 FD，不进 argv / 仓库。再短时打开 `LAMPY_TEST_ACCOUNT_LOGIN`，确认 Apple 与测试账号 `userId` 不同，会话、成员、接收缓存不串号。

隔离库 CLI 不能代替这一步。

| 项 | 结果 |
| --- | --- |
| 生产 CLI 两个 `userId` | **NOT VERIFIED** |
| 短时开登录后不串号 | **NOT VERIFIED** |

## 3. 家庭走查

两台设备：建家 → 邀请 → 加入 → 分享含媒体的 Moment → 收下 → 撤回 → 退出；含重启与断网恢复。只有一台设备时，可先做同机切账号，结论仍是 **双设备 NOT VERIFIED**。

| 项 | 结果 |
| --- | --- |
| 双设备闭环 | **NOT VERIFIED** |
| 同机切账号 | **NOT VERIFIED** |

## 4. 收尾

走查结束后去掉 `LAMPY_TEST_ACCOUNT_LOGIN` 并重启，CLI `disable` 测试账号。核对本机「最近 / 回看 / 照片 / 录音」未改。

| 项 | 结果 |
| --- | --- |
| 关闭测试登录并停用账号 | **NOT VERIFIED** |
| 个人库未受影响 | **NOT VERIFIED**（未读真机 `lampy.db`） |

## 不得改判

- 不得因 #44 已合并或 `/health` 200 把 `identityLoopAccepted` 设为 true
- 不得打开家庭正式入口
- 不得把单机 Jest、隔离库 CLI 或同机切账号写成双设备 PASS
