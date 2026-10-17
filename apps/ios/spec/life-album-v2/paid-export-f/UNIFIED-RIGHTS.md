# 统一购买与家庭导出资格（2026-10-17）

本设计取代 F1 中“只解锁个人 PDF”的商业范围；F1 的关闭默认值和安全门控继续保留。用户已确认：购买跟人走、解锁状态记在家庭、导出操作权跟当前 creator 走，退款追溯购买来源。正式商品名称、ID、价格和 Sandbox 实测在本片代码完成后另行推进。

## 产品规则

| 能力 | 未购买 | 有效购买者 |
| --- | --- | --- |
| 个人记录、整理、阅读；家庭成员分享阅读 | 免费 | 免费 |
| 主动创建家庭 | 当前没有管理中的活跃家庭时可创建一个 | 可创建更多，沿用现有加入/创建共 10 个活跃家庭的技术上限 |
| 接受创建者转交 | 不要求购买，不拦截转交 | 同左 |
| 个人 PDF 导出 | 不允许 | 同一商品重复生成不另收费 |
| 解锁当前创建者管理的家庭 | 不允许新增解锁 | 可将本人的有效交易绑定为该家庭来源 |
| 已解锁家庭的导出操作资格 | 仅当前 creator 可取得，原购买者可为别人 | 同左 |

这里“接收不消耗名额”是指不扣除一次性 credit、不因已有家庭拒绝接收。后续主动新建仍按当前 creator 的活跃家庭数判断：接收后管理一个或多个家庭、又没有个人购买时，不可继续新建。仅作为 member 加入其他家庭不占免费创建判断；仍受已有总成员家庭数上限约束。删除/解散或转交掉所有由自己管理的家庭后，可再次免费新建，不记录历史消耗次数。付费上限的商业承诺尚未定案，当前不是新增十家庭套餐。

转交范围为一个家庭及其全部生活册，不引入册子拥有者。服务端原有原子角色交换继续使用；授权按当前角色重新计算，不把 purchase.userId 改成接收者。旧 creator 成为 member 后失去该家庭的导出操作资格，但个人已购权益不变。接收者获得此家庭资格，不因此获得个人导出或主动创建更多家庭的个人权益。

一个商品两个入口：创建更多家庭遇到门槛或个人 PDF 导出遇到门槛时展示同一购买。购买与创建/生成分开，成功购买后由用户再次明确执行，不自动创建家庭、自动生成或自动购买。已有家庭可由当前 creator 点击“使用我的购买解锁这个家庭”；新建家庭在本人的交易已通过当前校验时同时记录来源。免费家庭转交不会凭空产生解锁。

## 数据与授权

Migration 31 新增三张表：
- family_purchase_tokens：Lampy userId 对应随机 UUID appAccountToken。账号不变时跨设备复用，不包含邮箱、姓名或家庭信息。
- family_purchases：environment + originalTransactionId 为全局唯一 key，绑定 userId；保存商品、交易标识、appAccountToken、Apple signedDate、revoked 和最后校验时间，不保存原始 JWS/收据。
- family_purchase_grants：familyId + purchaseKey 关联；保留解锁操作者和时间，一个家庭可保留多条来源。新 creator 用自己的购买重新解锁时添加来源，不修改前人的购买归属。

付费新增家庭前在 SQLite 写锁之外更新 Apple 状态；第一个免费家庭不要求 Apple 在线，若来源未完成近期校验，可创建后由 creator 显式解锁；最终名额检查、家庭创建和 grant 写入在同一事务中。并发免费创建只能成功一次。幂等重放返回同一个家庭，不扣名额；已有创建结果的重放不再查询 Apple。V1 旧单家庭路由保留其原有兼容限制，也不能绕过新资格门控。

退款不删除家庭、记录、成员关系或已交付文件。下一次家庭资格/个人付费资格或新增付费创建操作向 Apple 重查原交易，撤权由源交易传播到所有引用家庭。新 creator 可以使用自己的另一笔有效购买重新解锁。旧 signedDate 不能覆盖新状态，同时间不能把 revoked 恢复成 active；Apple 更晚签名的有效恢复/退款撤销记录可恢复，不能永久锁死用户。没有伪造退款管理接口。

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

自动测试覆盖内存/真实 SQLite：一个免费家庭、删除恢复、并发、重复请求、持久化重启、转交到已拥有家庭的未购者、转交中迟到的旧 creator 解锁、退款追溯、重新购买解锁、旧状态重放与更新签名恢复、错误商品/token/伪造 owned、Apple 网络失败只阻止敏感能力。客户端测试核对账号绑定、取消/恢复不信任 raw owned、账号切换不弹购买。Apple 适配器的测试使用 mock 官方 API/验证器，不等于真实签名、根证书、密钥和 Sandbox 请求验收。

Swift 新方法在 Linux 未编译，本地旧 F1 StoreKit 通过不能覆盖这部分。真实商品与密钥尚未配置、未部署云主机、未迁移云端数据库；不宣称已开通真实支付。待本片审阅后再确定商品文案/配置，并按 F2-ACCEPTANCE.md 完成 Mac 与真实 Sandbox 验收。D、自包含文件和家庭完整导出继续暂停。

参考：
- https://github.com/apple/app-store-server-library-node
- https://developer.apple.com/documentation/appstoreserverapi/get-transaction-info
- https://developer.apple.com/documentation/storekit/product/purchaseoption/appaccounttoken(_:)

本片自动验证：40 个 Jest 套件共 357 项测试（分批执行，新增边界测试单独补跑）、15 项 Node 配置/CLI 测试通过；TypeScript、改动 ESLint 和 diff 检查通过。新 Swift 与 Apple 真实验签/网络链路待 Mac 和后续 Sandbox 验收，不将 mock 通过当作支付上线证据。
