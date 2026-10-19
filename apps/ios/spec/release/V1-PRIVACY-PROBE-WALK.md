# 隐私核验：只读探针执行步骤

基线：main #124。#125 继续暂停。本片工具独立执行，不启动 API、不迁移数据库、不变更照片或应用行为。不需要重编 Lampy，也不需要把整仓代码部署到云端。脚本仅依赖 Node 内置模块；数据库脚本需要支持 node:sqlite 的 Node，本轮测试环境为 Node 24.19.0，尚未在生产主机执行。

## 1. 获取脚本

在自己的本地仓库取得 `ios/v1-privacy-inventory` 分支，进入 `apps/ios`。如有本地变更，先保留，不强制覆盖。无需 npm ci、Pods 或 Xcode 编译。可先执行：

```bash
node --test scripts/privacy-probes.test.cjs
```

## 2. 照片检查

使用你自己专门拍摄／准备的测试照片，不要从真实家人资料中随机取样。至少包括有已知 GPS 的 JPEG、PNG；最终应比较输入照片、应用保存资产，以及家庭服务实际保存的上传副本。源照片有 GPS 不代表服务器一定收到，源照片未检出也不能替代检查实际上传文件。

```bash
node scripts/photo-metadata-probe.cjs \
  '/你自己的测试目录/source.jpg' \
  '/你自己的测试目录/uploaded-copy.jpg'
```

以上两个路径是需要替换的样本路径。uploaded-copy 必须是同一次测试分享在家庭服务实际保存的文件副本，不是 App 预览截图、系统重存图片或原图再复制改名。核对中间系统导出是否重编码；没有可靠上传副本时，将服务端元数据结论保持待验证。

输出按 sample 编号对应命令参数顺序，不输出文件名、坐标或元数据值：

| 字段 | 解释 |
| --- | --- |
| gps=PRESENT | 检出 GPS IFD 标记或相关文本字段；不能据此证明坐标本身有效，但足以说明不能承诺去除 GPS |
| gps=NOT_DETECTED | 在限定扫描范围内没有检出；不是已去元数据证明 |
| gps=UNKNOWN | 不支持格式、格式不完整，或存在未完整解码的 XMP／文本容器；需用专门元数据工具或进一步验证 |
| sanitized=NOT_VERIFIED | 始终保留，避免将检测工具误当作清洗工具 |

扫描 JPEG 的扫描数据前头部 EXIF／APP1／APP13／注释、PNG 的 eXIf／文本容器。不是图片解码器，不校验 PNG CRC 或完整像素流，也不穷举压缩 XMP、JPEG 扫描之后数据和全部厂商私有标签；HEIC／HEIF 返回未知。限制单文件 64 MiB。不输出照片、实际 GPS 或相机序列号；不会写回照片。

只需反馈每个样本的种类（输入／上传副本）及脚本 JSON，不要发坐标或私人图片。若上传副本检出 GPS，再独立确认上传前清理方案；本片没有静默修改上传逻辑。

## 3. 生产数据库只读检查

由主机运营者将 `scripts/family-api-privacy-probe.cjs` 放入已有服务账号可读取的工具位置。不要为运行此探针替换整仓代码、启动 API 或迁移数据库。主机地址、登录账号、生产路径及环境文件位置不得填写进公开仓库。

在自己的安全终端配置下列变量，值仅留在运营环境：

- `LAMPY_AUDIT_SERVICE_USER`、`LAMPY_AUDIT_SERVICE_GROUP`：现有服务身份。
- `LAMPY_AUDIT_ENV_FILE`：现有受保护环境文件，包含原 API 的数据库路径。
- `LAMPY_AUDIT_NODE`：主机现有支持 node:sqlite 的 Node 绝对路径。
- `LAMPY_AUDIT_SCRIPT`：本探针的绝对路径。

通用执行模板（变量未配置时直接终止，不退回 root 或猜测目录）：

```bash
sudo systemd-run \
  --unit="lampy-privacy-audit-$(date +%s)" \
  --wait --pipe --collect \
  "--property=User=${LAMPY_AUDIT_SERVICE_USER:?set existing service user}" \
  "--property=Group=${LAMPY_AUDIT_SERVICE_GROUP:?set existing service group}" \
  "--property=EnvironmentFile=${LAMPY_AUDIT_ENV_FILE:?set protected environment file}" \
  --property=NoNewPrivileges=true \
  --property=ProtectSystem=strict \
  --property=ProtectHome=true \
  "${LAMPY_AUDIT_NODE:?set Node absolute path}" \
  "${LAMPY_AUDIT_SCRIPT:?set probe absolute path}"
```

不要停止或重启 API，不执行迁移 33。工具以 readOnly 数据库连接加 query_only 运行，不调用原 API 的数据库 opener。SQLite 读取可能使用已有 WAL／共享内存机制，不承诺底层系统没有任何辅助文件访问；因文件权限失败时不要为探针放宽生产写权限。

### 汇总输出解释

- baseline=SCHEMA_32 是本轮审阅基线；其他版本标记 OUTSIDE_REVIEWED_BASELINE，不能当成 #125 已获准部署。
- accounts.nonemptyEmailRows>0 表示存在历史 email 字段值，不能仅凭此判断来自当前正式 Apple 登录。先确认迁入测试数据／旧路径，避免打印邮箱明文。
- rateBuckets.appleSourceIP 是持久化 Apple challenge 来源桶数量，appleOlderThanWindow／24h 是仍保留的旧桶数量；计数为零也不能证明有自动删除任务，可能只是没触发过。
- sessions.expired 是仍存在的过期会话行，不等于仍可登录；invalidExpiry 另行计数。
- cleanup.pendingAccountMedia>0 表示有清理队列项，不证明失败原因；为零也不能证明 timer 正常调度。
- processFlags 只显示当前探针加载环境文件中的允许列表开关，不反映正在运行的旧进程是否已重新加载同一文件。
- Caddy 日志、journal 保留、备份和物理擦除均标记未核验。汇总不包含 IP、邮箱、tokens、昵称、正文或媒体 key。

## 4. 日志、清理任务和备份：分开核对

这些不能从 SQLite 汇总推导。主机运营者在本机检查现有清理 timer 的安装／启用／调度状态，并查看 journald 的有效保留配置。仅反馈状态与期限，不复制完整生产 unit、配置文件或运行日志进公开仓库。

timer 未安装就记录未安装，本轮不顺带启动清理或删除数据库行。journald 配置未显式列出期限不等于不保留日志；须结合有效默认值再定规则。不要为检查保留期直接输出包含真实请求的 journal 全文。

另需由主机运营者确认：Caddy 的正式域名是否启用 access log、输出位置和轮转期限；是否有请求 body／Authorization 记录；腾讯云磁盘快照或其他备份是否开启及保留多久。不要复制整个 Caddyfile、环境文件、密钥、真实访问日志或数据库到聊天里，只反馈结论和期限。未拿到这些信息前保持 NOT VERIFIED，不先写“永久不保留”或“删除账号就删除所有备份”。

## 本地测试与实际证据边界

4 项 Node 内置测试通过：JPEG／PNG GPS 标签检测、畸形／循环 TIFF 边界、大小端和不透明元数据返回未知，以及 SQLite 只读汇总、无明文输出、数据库主文件字节不变和缺失文件不创建。CLI 语法和 git diff --check 通过。

这些是工具测试，不是 Mac 照片／生产数据库／云端日志的验收结果；实际结果仍需上述环境执行后补录。未提交 App Store 问卷，#125 保持暂停。
