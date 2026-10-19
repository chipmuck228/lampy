# PR #126 核验结果与收尾记录

日期：2026-10-19（北京时间）。范围：#124/main 代码基线的隐私盘点与独立只读探针。结果来源为用户在 Mac 和正式主机反馈的输出，本环境没有直接登录主机或读取真实用户库。本文不公开主机地址、生产路径、账号身份、实际 IP、邮箱、坐标或媒体键。

**本 PR 到此收尾，不扩展 ExifTool 检查、上传清洗或数据保留策略实施。未合并、未提交 App Store 隐私问卷。#125 继续暂停，购买、个人／家庭导出和打印保持关闭。**

## 已得到的证据

| 项目 | 用户反馈结果 | 可以确认 | 不可据此推定 |
| --- | --- | --- | --- |
| 数据库 | SCHEMA_32，探针退出码 0 | 与本轮 #124 基线一致；只读汇总在主机执行成功 | 不等于所有数据处理或隐私申报已验收 |
| 邮箱 | nonemptyEmailRows=0 | 当前账号表没有非空 email 字段值 | 不证明历史日志／备份绝无邮箱，也不是未来行为保证 |
| 会话 | expired=0、invalidExpiry=0 | 本次快照没有过期或异常到期时间的会话行 | 不证明已实施过期会话定期物理清理 |
| Apple 来源限流 | 存在超过一分钟窗口仍持久保存的来源桶；此次无超过 24 小时的该类桶 | 窗口到期不等于该 SQLite 行被删除 | 不能推定最终只保留一天或已经有自动删除任务 |
| 账号媒体队列 | pendingAccountMedia=0 | 本次队列为空 | 不证明发生过实际文件删除、删除失败重试或全部历史副本擦除 |
| HTTP trace 环境 | httpTrace=UNKNOWN、trustedAppleProxy=ON | 探针进程未显式取得 trace 开关值，可信代理开关开启 | UNKNOWN 不是服务器正在采集 trace 的证据，也不是运行进程已经关闭 trace 的证据 |
| 家庭清理任务 | 模板安装及 unit 校验完成；手动执行 success/0；随后 timer 自动触发，任务正常结束，failed=0 | #124 清理任务部署、手动执行及自动调度通过 | checked=0 的空任务不能证明到期家庭实删、文件删除失败重试通过 |
| journald | 未见显式 MaxRetentionSec；MaxFileSec 注释为 1month；ForwardToSyslog=yes 有生效配置 | 已发现 syslog 转发；单文件轮转周期不能当作日志删除期限 | 不得宣称所有日志只保留一个月、零日志或永久不保留 IP |
| rsyslog／logrotate | rsyslog active；weekly、rotate 4、compress、delaycompress；logrotate timer 有执行记录 | 配置了每周轮转、4 个历史文件及延迟压缩，且调度存在 | 尚未逐项核对具体日志文件匹配、真实轮转结果、其他日志副本；不能统一承诺 28 天 |
| Caddy | 从磁盘 Caddyfile 适配出的摘要无 HTTP request log 配置、无显式 log writers | 当前文件中没有配置 HTTP 访问日志 | 不能证明运行中的配置完全相同，也不能证明无 Caddy 运行／错误日志 |

## 照片检查结果

### Mac 样本

用户选取了系统照片图库的派生 JPEG 文件，检测结果：

```json
{"format":"JPEG","exifContainer":true,"xmpOrApp1":false,"textMetadata":false,"gps":"PRESENT","coverage":"BOUNDED_METADATA_SCAN","sanitized":"NOT_VERIFIED"}
```

该文件含可识别 GPS 标记。因来自图库 derivatives，不能把它自动认定为“未修改原片”，也不能单凭此证明 App 实际选取的资产或本次上传前字节具有相同元数据。

### 家庭服务实际保存文件

用户创建了唯一测试标记的单照片家庭分享，再在服务器通过精确标记关联分享、作者和媒体索引，检查实际保存文件。用户反馈：

```json
{"source":"MATCHED_TEST_SHARE_SERVER_FILE","matchedShares":1,"matchedImages":1,"integrity":"MATCH","format":"JPEG","exifContainer":true,"xmpOrApp1":false,"textMetadata":true,"gps":"UNKNOWN","coverage":"BOUNDED_METADATA_SCAN","sanitized":"NOT_VERIFIED"}
```

进程 success，退出码 0。实际服务器文件与媒体索引的大小及 SHA-256 一致；这不是服务器文件与 Mac 原样本相同的哈希证明。

**本次照片结论：定位实际副本和完整性检查通过；GPS 判定未完成。** EXIF 容器本身不等于存在坐标；textMetadata=true 表示有本工具未完整解析的元数据容器，没有识别出 GPS 标记也不能据此确认无 GPS。UNKNOWN 不得改写成 PRESENT 或 NOT_DETECTED，退出码 0 只表示探针成功执行。

## 本轮决定与后续移交

| 状态 | 内容 |
| --- | --- |
| 完成 | 代码盘点、披露候选、独立探针；用户端数据库汇总；清理部署／手动／自动空任务；日志配置核对；指定照片实际副本关联及完整性检查 |
| 本 PR 不继续实施 | ExifTool 深检、上传前元数据清理、IP／会话／日志保留策略修改；不自动新增迁移、运营后台或其他功能 |
| 待后续核实 | 同一服务器副本的完整元数据检查；可采用更完整解析器且只输出标签存在性／数量，不输出坐标；输入／中间资产证据仍需区分 |
| 待确定规则 | IP 限流和过期会话的保留／清理期限；日志、转发副本、云主机快照及备份的实际期限 |
| 仍未验收 | Release Archive 隐私 manifest／依赖、真机网络接收方、实际删除失败重试、备份保留和公开支持／政策信息 |
| 发布限制 | App Privacy 仍是草案，不能以本轮结果宣称“未收集数据”“所有照片无 GPS”或“所有日志保留 28 天”；不能据此认定已具备上架条件 |

本轮未修改 App 上传逻辑、家庭 API 运行逻辑或保留规则。用户安装的独立探针不等于部署了整份 PR；清理 unit 是 #124 的既有模板，与 #125 或迁移 33 无关。

## 验证记录

7 项本地 Node 测试通过，覆盖元数据有限扫描、畸形数据、测试分享关联、真实文件哈希、重复／无匹配拒绝、跨作者及篡改拒绝、数据库只读汇总及输出最小化。用户反馈补足上述真实环境证据，但不扩大这些测试的覆盖结论。本次收尾只改文档，检查差异空白及引用路径，不重复应用测试或原生构建。
