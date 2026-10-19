# 1.0.0 数据处理与 App Privacy 对照清单

核对日期：2026-10-19。代码基线：main `8cc9153b255c85f5271dcc76ed767180d04a2759`（已合并 #124）。仅文档审阅，没有修改运行代码、上云部署、读取真实用户数据库或提交 App Store Connect 问卷。

**#125 已暂停，不作为本清单的功能或数据依据，不要求执行迁移 33。** 当前发布范围为私人记录、Apple 登录、家庭分享／册子预览；购买、个人及家庭导出、打印、测试登录均关闭。家庭 API 数据库当前代码迁移上限为 32。

## 结论与证据范围

1. 不能选择“未收集任何数据”：家庭分享会将内容上传并保存，Apple 账号及家庭成员关系也持久化。私人记录默认本机不意味着整个 App 不收集数据。
2. 主要申报候选：用户标识、家庭关系、主动分享的照片、声音和其他用户内容；用途为应用功能，通常与账号关联。无证据表明这些数据用于跨公司广告追踪。
3. 邮箱不能因依赖名或旧数据库 email 字段就直接判定为正式版收集。正式 Apple 流程不请求姓名／邮箱 scope，创建账号也不写入 email；仍需确认正式库没有混入旧测试身份及相关保留数据。
4. 来源 IP 确实被写入 SQLite 限流桶，不能描述为“只实时处理，绝不保存”。应用代码没有看到对应的过期行定时清除；云主机、Caddy 和备份保留行为尚未验证。
5. `exif: false` 只表示不请求返回 EXIF 对象，不能证明上传照片文件已去除 GPS／其他元数据。JPEG／PNG 正常分享路径直接使用文件字节；目前仅 HEIC／HEIF 走 JPEG 转换。正式位置数据申报前需实测。
6. 本清单是填写依据和剩余证据清单，不是已完成 App Privacy 申报、隐私合规审查或 App Store 准入结论。

证据层级：**已证实**＝基线代码可直接定位；**建议填写**＝根据代码和 Apple 定义形成的候选；**待验证**＝需要实际 Release 安装包、真机流量或云端配置，不能用静态检索替代。

## 数据处理矩阵

下列路径均相对 `apps/ios/`。

| 内容 | 产生与处理 | 位置／接收方 | 关联与用途 | 代码依据 |
| --- | --- | --- | --- | --- |
| 未分享私人文字、感受、日期、私人册名／开篇／顺序 | 不要求登录；保存和回看在本机 | `lampy.db`；未见默认上传私人库的调用 | 本机 local-user；记录功能 | `src/application/container.ts` 的 defaultLoader，`src/infrastructure/sqlite.ts`、`sql.ts`、`sqlite-repositories.ts` |
| 私人照片和声音、录音草稿 | 用户拍摄／选择／录音后复制或保存到应用文件；新录音上限 1 分钟 | 应用 Documents 的资产文件；系统备份是否包含另论 | 本机资产 ID；不因 Apple 登录自动迁移至云端 | `src/infrastructure/expo-media.ts`、`expo-audio.ts`，`src/application/recording-access.ts` |
| Apple 身份、会话 | 原生授权返回 token；正式服务验证 subject 和 nonce，保存账号、登录身份及会话 | 本机 Keychain：userId/sessionToken；服务器 SQLite：subject/userId/session/到期时间 | 与个人账号关联，用于认证及权限 | `src/infrastructure/expo-apple-auth.ts`、`secure-family-session.ts`；`src/family-api/apple-auth-commands.ts`、`apple.ts`、`schema.ts` |
| Apple 邮箱／姓名 | `requestedScopes: []`；验证器可能解析已有 token 的 email claim，但正式 completeAppleAuth 新账号只写 subject/userId/createdAt，不写 email；不接收 fullName 字段 | 当前正式写入路径没有姓名／邮箱持久化；旧路径和历史数据另查 | 不应把尚未实施的邮箱验证码登录算作首发功能 | 同上；`src/family-api/commands.ts` 仍有仅测试模式允许的旧 signInWithApple 路径 |
| 昵称 | 用户自行填写，profile 保存 nickname，头像为 system | 服务器 SQLite，成员名册及分享展示 | 是账号显示名称，不要求真实姓名 | `src/family-api/commands.ts` updateMyProfile/getFamilyRoster、`types.ts` UserProfile |
| 家庭关系与邀请 | 家庭名称、成员角色／加入退出状态、邀请、创建者转交、规则确认 | 服务器 SQLite；邀请 token 通过系统分享发给用户选定的接收方；邀请预览页面向家庭服务提交 token | 社交关系与账号关联；家庭访问控制 | `src/family-api/schema.ts`、`invite-link-commands.ts`、`transfer-commands.ts`、`invite-web.ts` |
| 主动分享的文字、感受、发生日期及源记录 ID／版本 | 用户确认选定快照才上传；不上传整个私人库 | 家庭服务 SQLite 的 share snapshot，包含作者／familyId、受众及分享时间 | 与作者及家庭关联，供有资格成员阅读／成册 | `src/application/family-history-use-cases.ts` share/source；`src/family-api/share-commands.ts`、`types.ts` ShareRecord |
| 主动分享照片／声音 | 用户选中的媒体字节上传，服务器验证、存媒体文件及 MIME/大小/hash/owner/storageKey | 家庭服务媒体目录与 SQLite 索引，后由具备资格的家人下载 | 与作者、分享及家庭关联；不属于匿名内容 | `src/application/family-history-use-cases.ts`、`src/infrastructure/family-share-image.ts`；`src/family-api/media-commands.ts`、`media-blobs.ts` |
| 家庭册 | 册名、开篇、记录引用、封面选择、顺序、revision 保存于服务器 | 服务器 family_albums；客户端读取必要副本并本机排版 | 与家庭及 creator／读者权限关联 | `src/family-api/family-album-commands.ts`、`family-album-types.ts`、`src/application/family-album-paper.ts` |
| 家庭阅读副本 | 已接收 snapshot／媒体、本机播放和图片缓存，命名空间含账号／家庭／分享 | 本机 SQLite 缓存和 Documents/family-cache；不是每位成员都持有完整家庭库 | 账号隔离，重新核验后阅读；不是云备份承诺 | `src/infrastructure/family-receive-cache.ts`、`family-receive-files.ts`；`src/application/family-history-use-cases.ts` |
| 请求来源 IP／限流计数 | 可信反向代理传来源 IP，Apple challenge 使用 `apple-challenge:`+peer 持久化；邀请预览以 peer 的 hash 做桶 | API SQLite `family_auth_rate_limits`；Caddy、系统日志另查 | 防止滥用；原始 IP 不等于已匿名化，hash 也不自动免披露 | `src/family-api/listen.ts`、`apple-auth-commands.ts`、`invite-link-commands.ts`、`sqlite-repository.ts` |
| 诊断 | App 的 device-lock／first-run 控制台输出由 dev guard 限制；正式默认不发诊断请求 ID；服务器 trace 开关开启且收到合法 ID 才记路由种类、状态和耗时 | 本机开发控制台；可选服务器日志；代理日志未验 | 未见自有代码把私人正文／token 写进这些 trace；第三方 SDK 和云端访问日志不能据此认定不存在 | `src/screens/device-lock-context.tsx`、`first-run-gate.tsx`；`src/infrastructure/family-http-client.ts`；`src/family-api/http-trace.ts` |
| 本机保护 | 系统 Face ID／设备密码认证，App 收到成功／失败结果 | 系统认证；App 保存保护设置和会话状态，不取得面部模板 | 设备安全，不是采集生物识别原始数据 | `src/infrastructure/expo-device-auth.ts`、`src/screens/device-lock-context.tsx` |
| 购买／正式导出 | 代码及模块保留，但发布 profile 的开关关闭、SKU 为空；StoreKit listener 也先检查配置 | 本轮未开放购买／成品上传；不因为依赖存在就宣称有购买历史收集 | 不把延期功能写入 1.0.0 功能清单 | `scripts/appstore-v1-profile.cjs`、`scripts/album-export-profile.cjs`；`modules/lampy-export-purchases/ios/LampyExportPurchasesModule.swift` |

网络接收方：家庭功能连 `family.yunpura.com`；认证验证从服务端向 Apple 获取公钥，删除账号撤销授权时向 Apple 的 token/revoke 接口请求。主动分享官网链接可打开 `yunpura.com`／`open.yunpura.com`，由浏览器或 IM 发起的站点访问须另查官网日志和政策。不存在“只要在本机记录，任何网络请求都绝不发生”的静态证明。

## App Store Connect 建议填写草案

应以最终 Release 包和真实服务器行为为准；这里没有代填或提交问卷。

| 问卷类型 | 草案 | 关联用户 | 用途 | 判定说明 |
| --- | --- | --- | --- | --- |
| 是否收集数据 | 是 | — | — | 家庭服务会保存账号和共享内容 |
| Identifiers → User ID | 建议选 | 是 | App Functionality | Apple subject、Lampy userId、账号昵称和会话身份 |
| Contacts | 建议选并复核定义 | 是 | App Functionality | 家庭成员和邀请形成账号关系图；未读系统通讯录不等于没有社交关系数据 |
| User Content → Photos or Videos | 建议选 | 是 | App Functionality | 实际仅照片，Apple 将照片／视频合并为一项 |
| User Content → Audio Data | 建议选 | 是 | App Functionality | 主动分享声音；未分享录音仍仅本机 |
| User Content → Other User Content | 建议选 | 是 | App Functionality | 记录文字、感受、日期、家庭及册子自填内容；不是聊天消息产品 |
| Other Data Types | IP 防滥用的候选，提交前核对 | 关联情况待云端日志确认，不能先断言否 | App Functionality | 不通过 IP 推断位置或设备画像；最终分类取决于实际用途及 Apple 问卷定义 |
| Name／Email Address | 当前正式流程无真实姓名／邮箱专门采集，不直接据旧字段勾选 | 如实际保留则需重新判断 | App Functionality | 昵称按账号显示名归 User ID；若运营将其当真实姓名使用或保留旧 email，应补充相应类型 |
| Precise／Coarse Location | 暂不能定稿为“不收集” | 待验证 | — | 未见定位调用，但照片文件可能含 GPS；需检验真实上传字节后决定修复或披露 |
| Diagnostics／Product Interaction | 根据实际日志／SDK／归档报告定稿 | 待验证 | 通常 App Functionality；如分析用户行为再判断 Analytics | 正式代码未见主动使用行为统计 SDK；不能用“没有广告”推导没有日志和诊断 |
| Tracking | 当前自有实现未发现，草案为否，待依赖／流量复核 | — | — | 未见跨公司广告关联、广告 ID 或数据经纪方用途；登录身份关联不是同一个概念 |

不能用“用户自己点了分享”直接豁免家庭内容：这是产品核心功能的持续使用场景。不要把每段自由文字可能提及的主题机械扩展成全部健康／敏感分类；同时也不能忽略照片文件真正携带的位置数据。

## 删除、保留与对外表述边界

- **撤回分享**：当前代码改状态与 revokedAt，阻止重新授权阅读；没有当场删除 snapshot 和媒体文件。撤回不等于服务器物理清除，也无法收回 App 外副本。
- **账号删除**：清除账号、身份、会话、本人分享和媒体索引，尝试删除文件，失败进入持久清理队列。本机私人记录与个人册保留。不能承诺介质不可恢复擦除。
- **SQLite／备份**：代码执行 DELETE 与文件 remove，不证明 SQLite 空闲页、WAL、主机快照或备份里的旧字节已擦除。需明确生产保留和备份策略，不能宣传“所有副本即时永久消失”。
- **解散家庭**：既有 30 天清理期限与任务；#124 的定时清理模板仍待生产安装／执行验证。模板存在不是实际清理证据。
- **退出与离开**：退出是本机会话撤销与缓存隔离，不删除账号或既往分享；离开也不自动撤回分享。
- **限流与过期数据**：限流窗口过期不等于 SQLite 行删除；基线未见针对 Apple IP 限流行的定期清理。到期 session 的授权失效也不等于它的持久记录已清除。
- **传输与存储安全**：公网 API 使用 HTTPS，客户端不接受一般公网 HTTP；代码中未发现家庭分享端到端加密或私人数据库独立加密配置。本机保护不能被描述成端到端加密或完整磁盘擦除。

## SDK 与安装包核对

依赖审阅基于锁文件，未把开发环境 node_modules 当作最终发布包。锁定 Expo SDK 57、React Native 0.86.3。自有调用范围内未检出 Sentry/Firebase/Amplitude/PostHog 等分析或广告初始化、定位调用或读取广告 ID／IDFV 的调用；这不是第三方 SDK 全量不收集数据的保证。

本轮辅助读取了共享开发环境中版本与锁文件一致的 ExpoConstants 57.0.19、ExpoFileSystem 57.0.7、ExpoDevice 57.0.2 manifest，分别声明 UserDefaults、文件时间／磁盘空间、启动时间等 API 原因，收集数组为空、tracking=false。expo-application 57.0.3 在该临时依赖环境缺失，未拿错误版本补证。其他包没在限定目录找到 manifest，不等于归档中缺失或它需要独立 manifest。

仓库未找到跟踪提交的 app 级 PrivacyInfo.xcprivacy 或 app.json 中显式 privacyManifests；prebuild、Pods 和 RN 的生成与聚合仍可能提供。必须在真实 Archive 中核对；不据此立即新增一份全“否”的 manifest。

须取得最终 .xcarchive 的隐私报告和 manifest 实际内容，核对 SDK 版本、required-reason API、tracking 域及 collected data 声明。隐私 manifest 与商店隐私标签分别核对，不能互相代替。没有新依赖安装、原生构建或 TestFlight 上传在本轮发生。

## 下一步证据任务

| 优先顺序 | 任务 | 完成证据 |
| --- | --- | --- |
| 1 | 用带已知 GPS 元数据的 JPEG／PNG 做分享测试；比较输入、应用资产和上传后的文件 | 记录是否含 GPS／拍摄位置，不把私人测试样本传到公开 PR；需修复时独立做上传前元数据处理 |
| 2 | 确认 IP 限流、Caddy／系统日志、云主机快照／备份保留策略 | 只提供配置和期限，不打印真实 IP、tokens 或用户数据库内容；提出最小保留规则后再改代码 |
| 3 | 读取 Release Archive 的隐私报告和最终 manifest | 保存版本／build／归档来源；required reasons 与实际 native 代码对应；只用最终包做结论 |
| 4 | 核对 Release 设备网络 | 未登录私人记录、Apple 登录、家庭分享／撤回／删除分别记录接收域名及用途；确认无 Metro／意外分析上报 |
| 5 | 确认运营主体、支持邮箱、发布地区，核对官网政策 | 已确认且可访问的 URL 和真实有人处理的渠道；本片不生成虚构联系方式 |
| 6 | 汇总完成后填写 App Privacy | 与账号关联／用途逐项确认；此之前保持草案，不宣称完成申报 |

本轮不恢复 #125 的开发，不自动新增运营后台、举报字段、付费或导出功能。#125 的内容安全需求仍独立保留为上架前待确认事项。

## 官方规则依据

2026-10-19 核对（采用规则摘要，具体界面以届时 App Store Connect 为准）：

- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)：申报覆盖设备外保留的数据及集成方；仅本机处理与实时后丢弃不同于服务器持久保留；功能性收集也需考虑披露，用户主动提交不自动满足豁免条件。类别、关联、用途和追踪应分别判断。
- [Apple User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)：检查集成 SDK 的行为；身份登录不自动等同广告追踪。
- [Expo Privacy manifests](https://docs.expo.dev/guides/apple-privacy/)：按 SDK 版本、原生库及实际生成包核对 manifest 和 API 原因，不能仅由依赖声明推定最终包完整。

此清单仅记录技术依据及待确认项，不替代实际运营数据处理核查或发布主体的合规判断。

### 后续只读核验工具

已增加独立的照片和数据库只读探针，执行步骤见 [V1-PRIVACY-PROBE-WALK.md](V1-PRIVACY-PROBE-WALK.md)。它们不接入 App 或 API 启动路径，不修改上传、保留或清理策略。4 项本地工具测试通过，但真实上传照片、生产限流记录和主机配置尚未验收。工具 JSON 不输出实际坐标、IP、邮箱或会话令牌。
