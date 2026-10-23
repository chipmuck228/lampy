# 第三阶段：运行日志、业务备份与云快照

基线 main 3f2b8db（#130）。独立于暂缓的 #131，不合入第二阶段规则、schema 34 迁移、限制账号管理或其他延后 PR。本片兼容现有 schema 33 及后续 34，无迁移、无 App 原生变化，不开启购买、个人／家庭导出或打印。

## 首发规则

| 对象 | 实施方式 | 期限与边界 |
| --- | --- | --- |
| API／Admin／清理／备份运行日志 | 直接持久化到 journald，轮转和空间上限；不额外写临时日志文件 | 30 天；256MiB 上限及保留空闲空间可能使旧日志更早删除。主机既有 rsyslog 历史副本也需收口，不能只改 journald |
| Admin 可见运行信息 | root 定时采集，10 秒一份原子 JSON，Admin 每 5 秒只读轮询 | 展示最近 30 分钟最多 100 个固定字段事件，UI 取最近 20 个；30 秒未更新显示不可用，不把旧状态当实时健康 |
| 自动业务备份 | 每日北京时间 03:10 加最多 5 分钟随机延迟 | 每份从创建起 7 天，小时任务到期清理；故障／无效目录需处理，非绝对物理擦除承诺 |
| 手动业务备份 | 主机上的 manual systemd 实例，与自动备份共用一致性和锁 | 同样 7 天，不创建永久例外；部署前可运行 |
| 腾讯云数据盘定期快照 | 控制台／API 开启，每天一次、IsPermanent=false、RetentionDays=7 | 云端尚未配置／验证；不把 JSON 示例当作已生效。不对备份卷再套一层快照，以免 7+7 天叠加 |
| 管理员业务审计 | 现有 SQL 表照常写入 | Admin 访问审计已有 30 天；处理审计 180 天属于 #131，本 PR 不将其表述为生产已执行 |

这是服务运维保护，不是用户私人库云备份或异常恢复承诺。只备份服务器已有账号／身份、家庭成员、分享、家庭册、举报与处理状态及已有购买记录，不采集新付费信息。不上传设备私人 moments、私人原图、个人册／PDF／内容包。不会备份 /etc 中 Apple 私钥或管理员凭据；这些由主机秘密管理另行保管，不能放到 Admin 下载入口。

“7 天备份”指每份副本自身期限，不是服务器业务数据的总保留期限。源库仍存在的内容会进入后续新备份；第一阶段尚待处理的历史带元数据家庭照片也会原样复制，备份不重绘照片或改写哈希，不能宣称历史备份均已去 GPS；#131 未部署时不能声称源库统一到期清理已生效。若快照包含日志或其他副本，期限也可能叠加；必须盘点磁盘边界，不能用此文档承诺删号后第 7 天所有介质彻底无残留。历史手工 DB、tar、镜像、导出或未识别目录不自动 glob 删除，先登记并处理。

## 备份一致性与失败恢复

2026-10-23 云端验收补充：生产主机在线只读 SQLite 复制探针通过，但停止写入服务后的维护备份返回 SQLITE_CANTOPEN（14）。在线探针不能替代停服条件验证；关闭最后一个 WAL 连接后辅助文件的状态不同。备份流程现先在 root 私有的 .partial/.source 中复制数据库及存在的 WAL（不复制 SHM、不跟随符号链接），仅在该临时副本上打开可写 SQLite 连接，再使用 backup API 制作成品库。生产目录继续只读。临时源副本可能含原会话等字段，权限为目录 0700／文件 0600，成功发布前移除，失败沿用 .partial 清除及崩溃后 24 小时回收规则。停服和禁止运营 CLI 写库仍是前提，不能据在线测试推断允许并发复制。本地新增关闭 WAL、未合并 WAL、源文件不变及 WAL 符号链接回归，12 项运维测试在 Node 22.20.0 通过；修复后的生产备份和恢复演练仍待验收。临时 backup-diagnostic.cjs 与 manual 实例的 90-diagnostic.conf 应在重试正式入口前移除。

运维入口 scripts/lampy-backup.cjs；核心 scripts/ops/backup.cjs，只依赖 Node 内置模块（需要 SQLite backup API，Node >=22.16；生产记录版本 22.20.0，实际主机仍需核对）。API、Admin、cleanup.service 和 cleanup.timer 的服务名固定，不接受任意系统命令或文件路径来自浏览器。

自动／手动备份先检查源路径、备份卷独立设备号和权限，取得全局 flock，在 root 专有目录持久化原服务运行状态／本次 INVOCATION_ID，然后暂停清理 timer、API、Admin 和清理进程。维护窗口期间停止其他直接写库的运营 CLI。SQLite backup 复制数据库后，仅在备份副本删除会话、Apple 挑战和限流桶，并 secure_delete／VACUUM 去掉逻辑空闲页；不改变生产库或登录状态。保留账号身份、业务及幂等记录，避免恢复后延迟操作产生重复业务。

根据复制库的媒体索引逐份复制，每份核对长度与 SHA256；不跟随符号链接、不复制未索引垃圾／待退休孤儿文件。新数据库副本用 DELETE journal，避免依赖缺失 WAL。全部成功后写入私有 manifest（schema、时间、到期、文件哈希），fsync 再从 .partial 原子发布；失败不发布完整备份，源数据不变。备份目录／文件 0700／0600，拒绝目的目录嵌在源数据中，默认要求独立备份文件系统；同机目录不冒充异盘保护。

正常完成、异常及中断都按原状态恢复 API、Admin 和 timer；不把原来停用的服务打开。清理 oneshot 被停止时，未完成工作依赖原有持久队列和下一次小时任务续跑。ExecStopPost 补偿 SIGKILL 等子进程退出；INVOCATION_ID 检查防止抢锁失败的另一个实例恢复正在备份的服务。恢复服务失败会保留 resume.json 和失败状态，必须人工排查后 resume-stale；不能删计划文件伪装成功。主机断电、systemd 调用失败等仍需真实演练，不承诺仅靠 finally 就覆盖一切故障。

每日任务会先清理过期副本，即使随后创建失败，7 天期限也不通过“保留最后一份”永久延长。独立小时 prune 定时器在没有新备份时仍清理；过期损坏 manifest／异常符号链接拒绝自动删除并返回失败，运营需核对。崩溃遗留的 .partial、隔离演练目录在满 24 小时后清理，不扫描或删除其他路径。

## Admin 最小运行状态

新增 GET /api/operations，仍需专用 Admin 登录、HTTPS 同源，响应 no-store。root 采集服务只能查询固定服务和最多 100 条 journal；只输出服务名、状态、事件枚举、时间及经过白名单投影的计数，不传原始 MESSAGE、异常描述、IP、账号、记录／媒体 ID、URL、路径、token 或正文。Admin 再次投影固定字段，只读取一个固定路径、root 所有且不可组／全局写入的普通文件，拒绝符号链接。未配置时功能关闭；文件缺失、过期、损坏时提示不可用。

登录后默认进入“举报处理”，运维信息单独位于“运行状态” tab；仅该 tab 可见且页面前台时轮询，切回举报页停止轮询，切换 tab 暂停正在播放的声音；退出清空两页。

Admin 不加入 systemd-journal／adm，不允许执行 journalctl、sudo、shell、备份、恢复或浏览任意文件。lampy-ops-read 组只允许读取脱敏状态文件。页面后台不轮询，自动轮询不延长 30 分钟闲置会话，退出清空显示。运行状态并非外部告警系统：Admin 停机时无法靠 Admin 自己通知，应配合主机 systemctl 与腾讯云基础告警。备份超过 26 小时无成功记录显示需要核对；云快照始终显示待云控制台验证，不伪造“已备份”。

## 隔离恢复检查，不提供生产覆盖入口

rehearse BACKUP_ID 在备份卷的 .restore-checks 中创建 root 专有临时目录；校验 manifest、安全路径、数据库 integrity_check 和所有媒体长度／哈希，复制后再次校验，最后清除演练目录。输出 publishAllowed=false、reconciliation=REQUIRED。不启动 API，不改生产目录、DNS、systemd 服务或账号状态，不留额外永久副本。

这证明数据副本可读取、对应一致，不证明旧账号／权限可安全重新上线。生产恢复前必须从备份之后的独立、可靠证据重新落实删号、撤回、屏蔽、下架与作者限制，并废弃旧会话。当前尚无独立防回滚删除账本，本片不提供自动生产恢复；若无法确认这些后续状态，禁止把旧库直接挂回公开服务。云快照只能恢复到隔离主机／隔离网络，先停止 API/Admin 并核对，不能直接滚回在线盘让服务自动重启。复杂的可自动上线恢复账本留作后续工作。

## 云主机部署（尚未执行）

1. 记录当前 API、Admin、schema 与服务状态。先满足 #130 客户端分发顺序：新 API 含严格照片上传校验，旧原生客户端可能被 415 拒绝。本片不要求 schema 34，不推进 #131。
2. 在主机分别更新 /opt/lampy-family 与 /opt/lampy-family-admin 的对应代码，保持 /srv 数据与 /etc 环境／密钥。不要安装不同版本脚本混用。root 运维脚本及其所有祖先目录必须由可信管理员控制、不可被 API／Admin 服务用户或普通组写入；部署时核对 /opt 代码和 node_modules 的属主／写权限，再启用 root 定时任务。仅备份／采集脚本依赖内置模块，现有 API／Admin 仍需原有依赖。
3. 准备独立、访问受限的备份卷并挂载 /srv/lampy-backups；核对 findmnt -T、设备号和容量。优先选择云盘加密、关闭共享，限制云控制台／快照权限；没有创建真实云资源或密钥。不要未经确认格式化已有盘。模板 RequiresMountsFor 和运行时设备号检查不是购买／挂载操作的替代。
4. 用 root 安装目录与不含密码的 ops.env（模板在 src/family-admin/ops-deploy），备份 root 不给 Admin 读权限：

```sh
sudo groupadd --system --force lampy-ops-read
sudo install -d -o root -g lampy-ops-read -m 0750 /var/lib/lampy-ops /var/lib/lampy-ops/public
sudo install -d -o root -g root -m 0700 /srv/lampy-backups /srv/lampy-backups/.restore-checks
sudo install -o root -g root -m 0600 /opt/lampy-family/apps/ios/src/family-admin/ops-deploy/ops.env.example /etc/lampy/ops.env
```

确认备份卷确实已挂载后再运行 install，避免在未挂载目录写入备份。ops.env 不复用 family.env／admin.env，更不拷贝 Apple 密钥。手工编辑不同路径时同步检查 unit 的挂载／读写白名单。

5. 安装 backup@.service、backup.timer、backup-prune.timer、ops-collect.service／timer 到 /etc/systemd/system；安装 admin-operations.conf、api-logs.conf 到各自 service.d。Admin 的 EnvironmentFile 若已定义 LAMPY_ADMIN_OPS_FILE，必须同为 /var/lib/lampy-ops/public/status.json（EnvironmentFile 会覆盖 Environment）。API 的 UnsetEnvironment 关闭遗留 HTTP trace。daemon-reload、systemd-analyze verify 后重启 API／Admin，确认登录与功能正常。不要把 API 或 Admin 改为 root 运行。
6. 日志配置是主机范围：审阅 journald-lampy.conf 后安装到 /etc/systemd/journald.conf.d/zz-lampy-retention.conf，重启 journald，核对 cat-config 的最终覆盖值。明确接受主机其他服务同样受 30 天／空间限制；若不接受，不能直接安装全局模板，应另设计独立日志 namespace。
7. 既有 rsyslog 曾开启 ForwardToSyslog 且 weekly／rotate 4。新 ForwardToSyslog=no 只阻止新的 journal 转发，不清除旧文件。核对 rsyslog 是否另启 imjournal／单独日志动作；为 /etc/logrotate.d/rsyslog 中既有文件组调整为 daily、rotate 30、maxage 30、compress，保留发行版 postrotate 脚本和文件属主，不能另建重叠 glob 规则。先 logrotate -d 验证，再执行正常轮转。旧归档需确认实际到期移除，不能仅看模板宣称完成。Caddy 继续不启用访问日志；核对实际加载配置和其他日志 writer。
8. 明确接受删除到期旧日志后执行 journalctl --rotate、journalctl --vacuum-time=30d --vacuum-size=256M；核对 journalctl --disk-usage、归档期限和 rsyslog 旧文件。空间限制可使保留少于 30 天。不得为“保险”把旧日志另存永久副本。
9. 先启用采集并检查 Admin，再手动跑一次备份和隔离恢复，最后开启每日／小时定时器。以下命令均在云主机执行：

```sh
sudo systemctl enable --now lampy-ops-collect.timer
sudo systemctl start lampy-ops-collect.service
sudo systemctl start lampy-family-backup@manual.service
sudo systemctl show lampy-family-backup@manual.service --property=Result --property=ExecMainStatus
sudo journalctl -u lampy-family-backup@manual.service -n 15 --no-pager -o cat
sudo systemctl is-active lampy-family.service lampy-family-admin.service lampy-family-cleanup.timer
sudo systemctl enable --now lampy-family-backup.timer lampy-backup-prune.timer
sudo systemctl list-timers 'lampy-*' --all --no-pager
```

备份 ID 只在 root 的备份目录读取，不贴 manifest 内容（其中含内部引用）。使用实际目录名执行只读／临时隔离检查，不传生产目标目录：

```sh
sudo systemd-run --unit="lampy-rehearsal-$(date +%s)" --wait --pipe --collect \
  --property=EnvironmentFile=/etc/lampy/ops.env \
  --property=UMask=0077 --property=NoNewPrivileges=true --property=ProtectHome=true \
  /usr/bin/flock --nonblock /run/lock/lampy-family-backup.lock \
  /usr/local/bin/node /opt/lampy-family/apps/ios/scripts/lampy-backup.cjs rehearse BACKUP_ID
```

若恢复服务失败，先核对服务配置与日志，再在没有其他备份作业运行时，用 flock 执行同一脚本 resume-stale；该操作只启动计划内原本运行的固定服务，不改数据库。不要直接删除 resume.json。备份 unit 的 ExecStopPost 使用本次 INVOCATION_ID，仅补偿本次维护，不会替其他正在运行的备份启动写入服务。

## 腾讯云定期快照（操作者控制台配置）

ops-deploy/tencent-snapshot-policy.json 是参数示例，不包含 Region、DiskId 或凭据，不会自动创建或绑定云资源。控制台选择实际生产数据盘，确认数据库和媒体是否在同一盘；如拆盘需另行保证组一致性，不能把两次独立快照当同一时刻。开启每日一次、7 天、非永久，示例 Hour=4，实际时区以控制台为准。检查该策略已绑定正确磁盘、最近快照成功及到期删除，不只检查“策略已创建”。

不绑定备份卷、不启用月／年归档、跨账号永久复制或额外自动续存；已有手动快照／自定义镜像不自动继承新策略，应逐一登记并确定到期删除。若生产数据位于系统盘而快照同时包含日志等其他数据，须记录范围与期限叠加，不能声称所有日志在所有副本中严格只留 30 天。云快照仅作故障补充，独立数据库／媒体备份与隔离校验仍执行；没有在本次环境调用腾讯云 API，状态保持 NOT_VERIFIED。

## 验收与证据

- 本地：真实 SQLite WAL 与媒体备份／隔离复制，凭据与源库不变，哈希／长度／权限，原子发布、路径／符号链接拒绝，七天边界、手动与自动一致、异常停止／恢复计划、错误不泄露、采集／Admin 二次脱敏、自动轮询不延长闲置会话、退出清空。
- 主机：实际 systemd 暂停／恢复，包括强杀备份 worker 后 ExecStopPost；独立卷挂载与空间、文件 ACL、定时器真实触发一次、小时清理到期副本、Admin 真实浏览器可读及过期采集状态；这不能由本地模拟 systemctl 测试替代。
- 日志：有效 journald 配置、旧 journal 和 rsyslog 到期处理、Caddy 实际 writer，确认未复制永久归档。
- 备份：真实 backup + rehearsal 均成功，服务恢复到原状态；无新购买／导出入口；保留 manifest 等私密证据于主机，不上传原始数据。
- 云端：正确磁盘、策略、最近成功／到期记录和访问权限；没有证据时继续标记未验证。

2026-10-23 本地验证：38 个 API／Admin Jest 套件、291 项测试通过；19 项 Node 脚本测试通过，其中 10 项运维核心在 Node 22.20.0 再次通过。TypeScript、变更 Admin TS 的 ESLint（零警告）、入口脚本语法和差异检查通过。systemd 255 对临时模板副本的语法验证通过（仅为验证将 ExecStart／ExecStopPost 替换为 /bin/true），不代表生产二进制路径、挂载、账户、D-Bus 和实际启停已验证。API listen.ts 沿用仓库既有 ESLint／tsc 排除规则，通过实际相关 Jest 编译和 HTTP 测试覆盖。尚未访问云主机、购买磁盘、配置腾讯云、创建生产备份、删除旧日志／副本或修改官网政策，PR 留待部署验收后审查。

参考（2026-10-23）：[SQLite Backup API](https://www.sqlite.org/backup.html)、[Node 22 SQLite backup](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)、[journald 配置](https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html)、[腾讯云定期快照参数](https://cloud.tencent.com/document/product/362/33558)。

## 2026-10-23 云主机验收进度（操作者回传）

- 独立备份卷 /dev/vdc 挂载 /srv/lampy-backups，root:root 0700，与生产系统盘 /dev/vda2 分离。
- d52602f 手动备份成功：29 份媒体，121368636 字节；备份 backup-20261023T123143475Z-8f4a559a02bf。隔离恢复成功，schema 33，publishAllowed=false；临时目录清空，目录 0700／文件 0600。未执行生产恢复。
- API／Admin 已通过覆盖配置运行 /opt/lampy-release-a9f9634，备份 unit 指向 /opt/lampy-backup-d52602f；两个版本的 API／Admin 代码相同。主机健康检查通过，购买／家庭导出关闭；采集及状态文件权限通过，操作者已在浏览器看到运行状态与最近成功备份。此后的 tab 调整尚待部署。
- 手动 prune 成功（removed=0, partials=0, rejected=0），每日备份、小时 prune、10 秒采集 timer 已启用；每日／小时任务真实触发及实际到期副本删除仍待验收。
- vendor syslog.conf 会覆盖 60- 前缀配置，主机已改用 zz-lampy-retention.conf，最终 ForwardToSyslog=no，30day／256M 生效。rsyslog 与 ufw 改为 daily／rotate 30／maxage 30，mail.err 纳入原文件组，保留 postrotate。实际轮转成功，journal rotate/vacuum 后占用 240.3M，未发现扫描范围内超过 30 天的数字编号归档。这不是全主机所有日志的统一期限证明，也尚未保证空日志不轮转时未来归档一定及时清除。
- Caddy 实际运行配置摘要：requestLogConfigPresent=false、logWriters=[]。
- 待验收：Admin 退出后的接口拒绝、举报列表与详情回归、tab 更新、采集过期显示、强杀补偿、定时真实触发及到期清理、腾讯云快照与历史运维副本盘点；未将这些列为已通过。PR 未合并，#131 与 schema 34 仍暂停。
