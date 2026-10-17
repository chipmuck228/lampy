> 后续家庭纸页/PDF 切片见 ../family-paper-d/README.md。本页中家庭 PDF 尚未实施的说明保留 #116 基线语境；新能力继续默认关闭。

# 统一购买与家庭导出资格（2026-10-17）

本设计取代 F1 中“只解锁个人 PDF”的商业范围；F1 的关闭默认值和安全门控继续保留。用户已确认：购买跟人走、解锁状态记在家庭、导出操作权跟当前 creator 走，退款追溯购买来源。正式商品名称、ID、价格和 Sandbox 实测在本片代码完成后另行推进。

## 当前产品基线（取代之前的家庭数量收费方案）

Lampy 是记录系统，不是备份系统。私人 moments、媒体与个人册默认在本机；只有主动家庭分享内容上传。用户主动导出 PDF/独立阅读内容包并自行保管，不提供成品回灌、备份包、丢机恢复或重新注册后的旧数据恢复。正常保存可靠性仍由 Lampy 负责。

家庭数量不是付费门槛：新建、加入、接收转交均不检查购买状态，不显示购买家庭 credit。保留现有最多加入/创建 10 个活跃家庭的技术上限，付费不会扩大或绕过它。退款、未购买和 Apple 服务故障均不妨碍该范围内的新建。

免费单段录音最长 60 秒，付费最长 1800 秒。开始前按已验证权益取得本段预算，失败或 2 秒未完成时保留免费录音；开始后不因网络或退款打断本段，下一段重新检查。原生 forDuration 限时，页面到限走正常停止和草稿媒体保存，最后 10 秒提示；不自动发布 moment、不在录音中弹购买、不丢弃已录内容。退款后已有长录音仍可播放。现有素纸、手作与高级版式试排均免费；所有正式成品导出必须付费，不提供免费正式导出开关或开发验收绕过。当前已接入个人 PDF，家庭完整导出和内容包仍关闭。高级排版方案在其他 PR 实施，本 PR 不新增模板或应用付费墙。

家庭成品资格仍保存源购买，操作权仅属于当前 creator；转交不转移个人购买，不给接收者个人长录音权益。只允许 creator 将本人的有效购买记录为家庭解锁来源，新建家庭可记录近期已验证来源；来源需要当前验证才能形成实际操作资格。家庭完整 PDF/内容包尚未开放，所有 canExport 继续 false。只读成品无法反向还原为 moments。

退款按交易来源撤销新的付费能力，保留已有家庭、记录、正常分享阅读和已交付文件。账号删除与物理清理尚未实施，须单独明确即时收权、在线删除期限、失败重试、备份保留和必要交易信息处理；不把已有撤回当成物理删除完成。

## 本次调整状态

已移除所有家庭创建购买检查和对应 UI 文案。保留购买验证、恢复、账号绑定、家庭来源及退款追溯。个人买付费成品能力，不买数据托管/永久存储/恢复服务。商品命名和 Sandbox 配置继续等待新基线下剩余付费体验明确。

录音与导出规则已实施，自动测试和 Mac 人工步骤见 RECORDING-EXPORT-ACCEPTANCE.md。Mac 原生计时、长录音文件、StoreKit 和真实 Sandbox 仍需分别验收。录音权益与成品购买共用来源；本地 StoreKit 测试关闭统一账号开关，仅验证客户端能力，不代表云端账号、转交和退款链路通过。

## 数据与授权

Migration 31 新增三张表：
- family_purchase_tokens：Lampy userId 对应随机 UUID appAccountToken。账号不变时跨设备复用，不包含邮箱、姓名或家庭信息。
- family_purchases：environment + originalTransactionId 为全局唯一 key，绑定 userId；保存商品、交易标识、appAccountToken、Apple signedDate、revoked 和最后校验时间，不保存原始 JWS/收据。
- family_purchase_grants：familyId + purchaseKey 关联；保留解锁操作者和时间，一个家庭可保留多条来源。新 creator 用自己的购买重新解锁时添加来源，不修改前人的购买归属。

家庭创建不调用 Apple，也不依赖购买配置或购买状态。数量上限和创建/成员写入继续在同一事务中完成，幂等重放仍返回原家庭。购买 context 中 canCreateFamily 仅反映现有技术上限，不再表示付费资格。V1 旧单家庭路由保留原有兼容限制，当前产品使用 V2 多家庭路由。

退款不删除家庭、记录、成员关系或已交付文件。下一次家庭成品资格/个人付费资格操作向 Apple 重查原交易，撤权由源交易传播到所有引用家庭。新 creator 可以使用自己的另一笔有效购买重新解锁。旧 signedDate 不能覆盖新状态，同时间不能把 revoked 恢复成 active；Apple 更晚签名的有效恢复/退款撤销记录可恢复，不能永久锁死用户。没有伪造退款管理接口。

当前是按需重新核验，不是后台通知即时推送。没有任何家庭导出任务在运行；将来完整文件导出必须在开始和交付前分别调用此资格检查，并核对现有 authority、记录/媒体版本与撤回状态。角色转交或撤回发生在生成中时，不可交付旧授权成品。当前所有 family canExport 仍为 false，资格 eligible=true 不代表已经提供文件导出。

## 信任边界

iOS 新购买使用 Product.PurchaseOption.appAccountToken，currentPurchase 仅返回 verified、商品匹配、未撤销、直接购买且 token 匹配的交易 ID。登录 Lampy 后方能使用统一购买，Apple 账号切换后不能只复用云端 owned。没有绑定 token 的旧 F1 本地测试购买不自动认领到任何 Lampy 账号；正式用户尚未开放，真实商品迁移另审。

服务器使用 Apple 官方 @apple/app-store-server-library：Get Transaction Info 获取当前签名交易，SignedDataVerifier 使用运营配置的 Apple 根证书并启用在线证书检查。严格验证 bundle=app.lampy.ios、所配置环境、商品、Non-Consumable、PURCHASED、账号 token 和原交易 key。不接受客户端 owned、解码但未验签的 JWS、Xcode 本地 JSON 商品或模拟交易。Sandbox 和 Production 明确分开，账本重查和资格计算只使用当前配置环境的记录，不让历史 Sandbox 数据污染正式资格；Production 必须配置数字 app Apple ID。

Apple 查询在 8 秒后对调用方超时失败，不能授权；不占用 SQLite 写事务等待网络。敏感操作检查已有结果的新鲜度，超过 30 秒重新准备，不把该时间窗用作免重查缓存。付费验证操作按账号持久化限流 40 次/分钟；普通家庭读取/封面、创建者转交和分享阅读不访问购买验证，不受其影响。校验失败保留内容并拒绝新的付费能力，不将 upstream 错误/私钥/交易 payload 打印给客户端。

## 开关和 API

客户端 EXPO_PUBLIC_UNIFIED_PURCHASES=1，同时要求 EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1 和 EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1。商品变量仍为 EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID，具体值尚不决定。app.config 生成 LampyUnifiedPurchasesEnabled；新增原生方法和该标志均需 Mac prebuild/Pods/重编；原生统一标志开启后，旧的无账号 purchase/hasEntitlement 入口拒绝调用，避免旧 JS 配置漏设统一开关时购买无绑定交易或绕过账号核对。正式归档 profile 强制清除这个新标志，默认不开放。

服务器 LAMPY_UNIFIED_PURCHASES=1 才开放；LAMPY_UNIFIED_PRODUCT_ID 必须匹配客户端。另需配置 LAMPY_PURCHASE_ENVIRONMENT（Sandbox/Production）、LAMPY_PURCHASE_KEY_FILE、LAMPY_PURCHASE_KEY_ID、LAMPY_PURCHASE_ISSUER_ID、LAMPY_PURCHASE_ROOT_CA_FILES（逗号分隔受信 Apple CA 文件），Production 再配置 LAMPY_PURCHASE_APP_APPLE_ID。这些仅存服务器环境文件/受限文件，不放 EXPO_PUBLIC 变量或 git。尚未配置时保持开关关闭，不影响现有家庭基础功能；服务器无假支付启用路径。

- GET /v2/me/purchase-access：当前账号 token 和经核验的个人资格、当前 creator 数量。
- POST 同路径 {transactionId}：Apple 核验并绑定，幂等、禁止跨账号认领。
- GET /v2/families/:id/purchase-access：当前角色的家庭资格，始终 canExport=false。
- POST 同路径：当前 creator 用自己的有效购买增加家庭来源。

接口均要求会话；换账号、退出或离页时客户端拒绝迟到的结果。家庭页面只在用户请求时检查购买资格，不混入家庭内容定时续租。

## 验收与边界

自动测试覆盖内存/真实 SQLite：免费创建多个家庭、退款后创建、并发、重复请求、持久化重启、转交到已拥有家庭的未购者、转交中迟到的旧 creator 解锁、退款追溯、重新购买解锁、旧状态重放与更新签名恢复、错误商品/token/伪造 owned、Apple 网络失败只阻止敏感能力。客户端测试核对账号绑定、取消/恢复不信任 raw owned、账号切换不弹购买。Apple 适配器的测试使用 mock 官方 API/验证器，不等于真实签名、根证书、密钥和 Sandbox 请求验收。

Swift 新方法在 Linux 未编译，本地旧 F1 StoreKit 通过不能覆盖这部分。真实商品与密钥尚未配置、未部署云主机、未迁移云端数据库；不宣称已开通真实支付。待本片审阅后再确定商品文案/配置，并按 F2-ACCEPTANCE.md 完成 Mac 与真实 Sandbox 验收。D、自包含文件和家庭完整导出继续暂停。

参考：
- https://github.com/apple/app-store-server-library-node
- https://developer.apple.com/documentation/appstoreserverapi/get-transaction-info
- https://developer.apple.com/documentation/storekit/product/purchaseoption/appaccounttoken(_:)

旧基线曾通过 40 个 Jest 套件共 357 项及 15 项配置测试。此次移除家庭数量付费限制后按改动重新跑回归；具体结果见 PR。新 Swift 与 Apple 真实验签/网络链路待 Mac 和后续 Sandbox 验收，不将 mock 通过当作支付上线证据。
