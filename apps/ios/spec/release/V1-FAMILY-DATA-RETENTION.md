# 家庭数据保留与清理（第二阶段）

基线 main 3f2b8db（#130）。本片实施数据库与家庭媒体的运行清理，不修改私人本机记录，不开放付费、个人／家庭导出或打印。日志、数据库操作副本、WAL／磁盘残留与云快照期限仍属于第三阶段；政策／App Privacy 在第五阶段按实测定稿。

## 规则与实际删除对象

| 对象 | 起算／期限 | 到期动作与例外 |
| --- | --- | --- |
| 撤回分享 | 撤回即时拒绝阅读；revoked_at 后 30 天 | 清空正文、感受、记录日期、媒体引用与受众 JSON；删除含快照的分享幂等回执。保留最小 source／revision／share 标记，防止延迟重试恢复撤回内容 |
| 下架分享 | 立即拒绝家庭阅读；最后处理时间后 30 天 | 同样清空快照；保留下架状态，不因清理恢复阅读。重新核对可更新处理时间 |
| 解散家庭 | 沿用现有 cleanup_deadline（解散后 30 天） | 删除家庭册、快照／幂等副本、邀请与成员关系；失败可重试。既有私人目录历史标记保留至删号，不能据此阅读旧内容 |
| 无引用上传 | 媒体 created_at 后 24 小时且没有任何分享快照引用 | 包含中断／取消后未用于分享的上传。删除媒体索引及上传回执前，先持久化文件删除键。仍在另一家庭或尚未到期撤回快照中引用的媒体不删除 |
| 删号媒体 | 既有立即退休并尝试删除 | 删除失败的键保留，小时任务续清；不恢复删除账号，不影响私人本机记录 |
| 会话、Apple 授权挑战 | 到 expires_at | 每小时任务删除过期或无法解析到期时间的行；保留有效会话／挑战 |
| 限流桶 | window_started_at 后 24 小时 | 删除桶键、窗口与计数，包括 Apple 来源 IP／邀请预览哈希等。当前生产限流窗口最长 1 小时；若将来新增超过 24 小时的窗口，必须先调整此规则 |
| 已处理举报 | 最近核对后 90 天 | 删除举报原因、补充说明、账号／分享关联及该举报幂等回执。旧数据无处理时间时由迁移日起给足 90 天宽限，不用创建日期猜测处理时间 |
| 待处理举报 | 保留至处理完成或相关账号／家庭生命周期清理 | 不静默删除未处理投诉；任务及只读探针输出超过 7 天待处理数量，运营每日检查 Admin，并及时完成处理 |
| 内容处理、账号限制操作审计 | updatedAt 后 180 天 | 删除历史审计行；当前决定清除 operator／reason 自由文本，保留 ID、状态与时间。有效账号限制不自动解除，下架内容不恢复 |
| Admin 访问审计 | 30 天 | 保持既有 Admin 规则，并由家庭小时任务兜底；不保存正文、图片／声音或凭据 |
| 已完成家庭文件删除回执 | completed_at 后 30 天 | 删除完成回执及家庭关联；未完成删除键永不按此规则丢弃 |
| 有效屏蔽／限制、撤回最小标记 | 到解除、账号删除或家庭生命周期清理 | 必要产品／访问控制状态，不是内容备份；不能为了时间到期解除用户屏蔽或运营限制 |

30 天是进入删除批次的阈值，不是恢复窗口：撤回后立即不可读，不提供恢复功能。正常小时任务另有最多 5 分钟随机延迟；故障、队列积压可能继续延后，必须监控和重试，不能在政策中承诺严格的“第 30 天物理擦除”。一个执行周期每类最多 100 项，解散家庭沿用最多 20 家，文件删除最多 100 个；计数达到上限或 pending 非零时应重跑只读盘点，不把退出码 0 当作全库已经清空。

文件删除是文件系统 remove；数据库删除是逻辑行清除／快照清空，不等同 SSD 安全擦除。WAL、旧日志、云盘／操作备份不由本任务擦除。未索引文件、partial 和第一阶段历史带元数据副本不通过 glob 删除或就地重写；只读盘点发现异常后独立核对。用户已经保存到系统“文件”或其他设备的成品不属于服务器可追回范围。

## 实现与安全边界

新增 migration 34：快照清理标记 content_purged_at、到期索引及历史已处理举报的 retentionStartedAt 宽限锚点。迁移本身不删除正文或媒体。新审核动作更新锚点；仅限制作者不会自动把待处理举报标为完成。

runFamilyDataRetention 用独立 SQLite 连接、BEGIN IMMEDIATE 事务和固定规则处理有界批次。媒体退休、删除键及回执清理一起提交；文件 remove 在提交后执行，失败保留队列。任何其他快照仍有引用就保留媒体，上传／分享与退休依赖相同 SQLite 写锁序列化。原有解散家庭清理先运行，再运行数据保留，再排空退休文件队列。输出只含计数，不打印 ID、桶键、会话、正文或文件名。操作 CLI 不接受时钟覆盖、额外参数或自动迁移；只接受 schema 34。限流、会话等规则只作用服务端，不触碰设备私人库。

避免举报到期使账号限制无法管理：Admin 增加独立“受限制的账号”列表，仅返回受限制账号的昵称、ID、限制时间和版本，不提供全库账号搜索、正文或媒体。填写原因、确认后才能解除该账号；需要管理员会话、Origin、CSRF 及最新状态版本，写入作者处理审计。此入口不依赖举报仍存在，也不会恢复已下架内容。退出清空名单与确认内容。

Admin 同时兼容 schema 33／34，不执行家庭迁移；只读照片盘点与读取探针兼容这两个版本。家庭 API 启动原有行为会应用迁移，因此不能先用新 API 意外升级，再指望旧 Admin 继续启动。

## 部署顺序（操作者执行，尚未在生产执行）

1. 先确认第一阶段含 LampyFamilyImages 的新客户端已分发并升级。本次新 API 包含 #130 严格上传防线，旧客户端带元数据图片可能收到 415；第二阶段不能绕过这一升级顺序。本片没有 iOS 原生变更，不需要为了保留期限单独重编。
2. 记录当前 API／Admin SHA 和只读盘点。仅上传 scripts/family-retention-probe.cjs 就可以在 schema 33 下先盘点，无需替换正在运行的 API。不要输出／source /etc/lampy/family.env。
3. 维护窗口停止 lampy-family-cleanup.timer，并等待正在运行的 cleanup.service 结束；停止 API 和 Admin。按已有流程准备一致性操作副本时登记用途、存放位置、所有者和删除到期时间，不能悄悄增加永久备份。
4. 将本 PR 同一版本代码分别部署到 /opt/lampy-family 和 /opt/lampy-family-admin，保留 /srv 数据、环境文件、密钥和管理员凭据。两处需要可用 TypeScript 等完整运行依赖；不要把 Mac 的 node_modules 上传到 Linux。不修改 DNS／Caddy／付费开关。
5. 以既有服务用户／环境执行迁移：

```sh
sudo systemd-run \
  --unit="lampy-family-migrate-$(date +%s)" --wait --pipe --collect \
  --property=User=lampy-family --property=Group=lampy-family \
  --property=WorkingDirectory=/opt/lampy-family/apps/ios \
  --property=EnvironmentFile=/etc/lampy/family.env \
  /usr/local/bin/node /opt/lampy-family/apps/ios/scripts/family-api-migrate.cjs
```

6. 启动 API 与 Admin，确认 health、Admin 登录、待处理举报仍在、限制名单和 App 阅读正常。新 Admin 必须到位；旧 Admin 拒绝 schema 34。不要用旧 DB 覆盖新产生的记录回滚。需要停用新清理时停止 timer，保留 schema 34／队列，不自动回滚已执行删除。
7. 安装更新后的 cleanup.service，daemon-reload，先只读探针，再手动执行 cleanup.service，核对结果，再 enable --now cleanup.timer。原 timer 仍为每小时运行，不需新建第二套任务。

### 只读核对命令

```sh
sudo systemd-run \
  --unit="lampy-retention-probe-$(date +%s)" --wait --pipe --collect \
  --property=User=lampy-family --property=Group=lampy-family \
  --property=EnvironmentFile=/etc/lampy/family.env \
  --property=NoNewPrivileges=true --property=ProtectSystem=strict --property=ProtectHome=true \
  /usr/local/bin/node /opt/lampy-family/apps/ios/scripts/family-retention-probe.cjs
```

探针用 readOnly 打开现有 schema 33／34，不创建数据库、迁移或改写文件，只输出数量。resolvedWithoutAnchor 在迁移前可能非零；迁移后正常应为零。dueUnreferencedMedia 是当前无引用对象，不包含尚未清空的到期分享将释放的媒体，不能当作本轮精确总删除数。physicalErasure=NOT_VERIFIED、backups=NOT_INSPECTED 必须保留。

```sh
sudo systemctl start lampy-family-cleanup.service
sudo systemctl show lampy-family-cleanup.service --property=Result --property=ExecMainStatus
sudo journalctl -u lampy-family-cleanup.service -n 20 --no-pager -o cat
sudo systemctl enable --now lampy-family-cleanup.timer
sudo systemctl list-timers lampy-family-cleanup.timer --all --no-pager
```

原输出 checked/completed/failed/removedFiles 仍为解散家庭阶段；新增 retention 各类删除／最小化计数和 overduePendingReports、mediaCleanup 删除／失败／pending。全部为 0 只表示这次没有对象需要处理，不表示实际删除链路已在生产验收。failed 非零必须查明，不清空队列表“解决”。队列 pending 不是失败项总数，可能是有界批次尚未处理完。

## 验收

- 自动化隔离 SQLite／合成媒体：期限前一毫秒、恰好到期、有效会话、活跃限流窗口、待处理举报、处理时间锚点、迁移中断回滚、原文／回执清空、跨家庭共用媒体、文件删除失败／重开续清、旧请求不复活、操作审计过期但限制不解除、有界批次续跑。
- 脚本测试在临时目录执行真正 cleanup CLI，确认 schema 33 被拒绝、不迁移、不能传未来时钟、仅输出聚合值；只读探针支持 schema 33／34，不创建缺失数据库。
- 云端：迁移前后盘点、手动任务成功、实际小时触发一次、有效登录／分享／阅读正常；生产到期对象的后续盘点与实际文件删除仍待真实输出，不改系统时钟或生产 revoked_at／举报日期来凑验收。
- Admin：登录后打开受限制账号列表，填写原因与确认／取消，解除所选账号；重试旧版本被拒绝、退出清空名单；原下架记录仍不可读，新记录可分享。
- 保持购买／个人及家庭导出／打印关闭，家庭功能与第一阶段照片分享回归正常。

## 交付与验证记录

2026-10-22：50 个相关 Jest 套件／441 项测试、14 项 Node 脚本测试、TypeScript、所有变更 TS／TSX 的 ESLint（零警告）、CLI 语法及差异检查通过。覆盖真实 SQLite 和实际 cleanup 子进程；Admin 使用 DOM／HTTP 测试，未宣称真实浏览器视觉已验收。新运行逻辑全部为服务端与 Admin，本片没有 iOS 原生变更。尚未登录云主机、迁移生产库、重启生产服务或安装新 timer；没有新增真实数据副本、部署政策或改 App Privacy 问卷。
