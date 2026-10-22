# 家庭照片分享副本：元数据最小化

基线 main a17bdc8（#128 已合并）。本片只处理新照片分享副本、上传防线和历史文件只读盘点；不修改私人原记录，不开放购买／成品导出／打印，不增加 schema 迁移。不宣称历史文件已经清理或真机验收完成。

## 实现

- 无元数据容器且符合允许结构的 JPEG／PNG，复制字节使用，不重复有损编码。其他图片（含带 EXIF／ICC 的 JPEG／PNG、HEIC）必须由新的 iOS 原生模块生成独立副本，不能失败后回退上传原文件。
- 新原生模块 LampyFamilyImages 使用 ImageIO 解码，应用方向／镜像，CGContext 转到 8-bit sRGB，再创建全新的编码目标。不传入源文件的 metadata 字典，不接受文件路径，不创建中间文件，不写回私人库或系统相册。
- JPEG／HEIC 输出 JPEG（quality 0.9，必要时依次降为 0.8／0.7／0.6）；PNG 输出 PNG，保留透明度。私人原图不变；分享副本等比缩至最长边 4608、约 16MP，不放大、不裁剪、不拉伸。原始输入最多 32 MiB／120MP，上传输出仍最多 8 MiB。ImageIO 读取主图并处理 HEIF／EXIF 方向，不再以手工交换宽高校验结果。原生队列串行，JS 逐张重读、核对哈希、转换和上传，不累计持有所有原图。超限或解码失败停止分享并保留私人内容。
- 原生 sRGB／方向处理完成后，JS 容器白名单去除 JPEG 所有 APP／COM（含 EXIF GPS、XMP、IPTC、缩略图、ICC、备注）及 EOI 后尾部。PNG 只保留 IHDR／PLTE／IDAT／IEND、透明度与固定色彩参数，去除 eXIf、文本、iCCP、私有辅助块和尾部。ICC 只能在已转 sRGB 后删除；不得拿此函数直接改旧原图，否则可能破坏方向／色彩。
- 解析覆盖 JPEG 多扫描区段和扫描后的 metadata；PNG 校验边界和 CRC，拒绝未知关键块。此检查不是完整图片解码器，也不移除画面中可见文字／地标、像素隐写或声音元数据。
- 历史／旧分享／选定媒体上传均调用同一准备函数。转换期间切账号／离页／锁定时仍保留资格检查；原图哈希用于源变动检查，上传幂等键使用实际副本字节。
- 家庭 API 在新照片写文件、去重或幂等重放前检查容器。未满足条件返回 415／MEDIA_IMAGE_PREPARATION_REQUIRED，不保存原始照片。声音路径不变。现有文件读取仍按既有资格及哈希验证，不能通过偷偷重写字节破坏读取一致性。

## 历史只读盘点

脚本：`scripts/family-photo-metadata-audit.cjs`；依赖同版本 `src/family-api/photo-metadata.ts` 及现有 TypeScript。只通过环境读取数据库和媒体目录，严格要求现有 schema 33，以 readOnly 打开，不迁移、不修文件、不创建数据库，不取 GPS 值／照片内容作输出。

扫描所有索引照片，核对大小／SHA256，分类 clean、needsPreparation、invalidOrUnsupported；同时检查未索引媒体文件、partial 和异常路径。拒绝跟随媒体符号链接。不能仅扫描一个测试分享就声称全库已清理。聚合数可能包含其他必要色彩容器，needsPreparation 不等于已发现 GPS。

先在安静时段执行。只读事务保证数据库视图一致，但不能冻结外部媒体写入；有 concurrentChange／integrityMismatch／missing 时应停下来核对、在无写入时重跑，不直接删文件。

在正式 API 的脚本目录安装脚本和新增解析源文件后（不替换正在运行的 API 代码），通过相同用户与环境执行，例如：

```sh
sudo systemd-run \
  --unit="lampy-photo-metadata-audit-$(date +%s)" \
  --wait --pipe --collect \
  --property=User=lampy-family \
  --property=Group=lampy-family \
  --property=EnvironmentFile=/etc/lampy/family.env \
  --property=NoNewPrivileges=true \
  --property=ProtectSystem=strict \
  --property=ProtectHome=true \
  /usr/local/bin/node \
  /opt/lampy-family/apps/ios/scripts/family-photo-metadata-audit.cjs
```

预期 mode=READ_ONLY、schema=33。已有库的数字不能预先填写。clean 只证明符合此容器策略，不证明物理擦除、无外部副本或无所有可能敏感信息。partialFiles、unindexedNeedsPreparation、invalidOrUnsupported 等不为零时仍需处理。

### 不直接覆盖历史文件

旧照片可能依赖 EXIF 方向／ICC；服务端媒体行、分享快照／幂等副本和客户端缓存还引用旧大小与哈希。因此历史处理须在盘点后做独立的受控变更：全尺寸方向与 sRGB 重绘、验证新副本、更新所有有效引用／幂等及缓存版本，再退休旧文件；失败可重试，不批量丢弃正常照片。不因报告有 metadata 就删记录。

当前脚本不会替换文件，也没有自动上传历史照片到第三方服务。生产输出提供前，本片不能宣布第一部分全部验收完成。

## 部署顺序

1. 先完成 Mac 新原生模块构建及真机验证，不是 Metro reload。已有预编译 App 不含此模块；普通无元数据照片仍可走安全复制，带元数据／HEIC 应明确失败而不泄露。
2. 用未使用的新 build 分发更新客户端，保持 appstore-v1 所有付费／导出开关关闭。
3. 部署 API 的上传检查并重启 API，schema 仍 33；Admin 服务不需因此重启。旧客户端分享带元数据照片可能被 415 拒绝，必须提前安排升级；文字、声音和既有家庭阅读不改变。
4. 部署／执行只读盘点，记录新测试分享和全部历史文件结果；完成历史处置后再全量复查。

## 真机矩阵

使用专门测试家庭和无私人内容的照片，不把样本或坐标提交到 git。

| 项目 | 操作及标准 |
| --- | --- |
| GPS JPEG／HEIC | 选用已确认带位置的照片，在本机保存后分享到家庭；服务器新副本符合 clean 策略，本机原图／原资产仍保留原元数据与字节 |
| PNG | 含 EXIF／文本 PNG 分享后无这些块，透明区域正常；不能只测相册截图一种格式 |
| 方向 | EXIF 1–8，横竖／镜像照片在个人、家庭记录、家庭册封面及纸页方向一致，无裁剪／拉伸 |
| 色彩 | sRGB／Display P3 照片无明显偏色；转 sRGB 允许正常色域压缩，不承诺 HDR／超出 sRGB 的像素逐值相同 |
| 重试／再分享 | 同图重试、另一家庭分享、同册／另一册阅读正常，哈希无错配，不重复丢图片 |
| 失败 | 旧原生构建（需要处理的照片）、解码失败／超限都不退回上传原字节，不改私人内容，可取消照片后分享文字 |
| 权限 | 转换中离页、后台、锁定、切账号不会提交迟到分享；撤回／屏蔽／下架仍正常收起照片 |
| 历史 | 全库盘点结果记录，异常文件单独核对；没有因为某个新样本 clean 就宣称旧文件 clean |

## 检查边界

本地可验证容器移除、失败闭合、上传未落盘、个人字节不变、资格／幂等／哈希及只读盘点。当前 Linux 环境不能替代 Xcode／ImageIO 编译或真实 iPhone 的方向、色彩、HEIC 与透明度验收。完成后记录 App build、代码 SHA、API 部署 SHA、schema 33 与聚合盘点结果。

依据：2026-10-21 核对 [Expo 57 ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/)、[W3C PNG 规范](https://www.w3.org/TR/png-3/)。原生采用明确 sRGB 位图重绘，不能把普通 exif:false 或未经验证的编码器行为当作去位置证据。

原生 API 参考：[ImageIO 方向变换](https://developer.apple.com/documentation/imageio/kcgimagesourcecreatethumbnailwithtransform)、[CGColorSpace](https://developer.apple.com/documentation/coregraphics/cgcolorspace)。原生编译与真实像素效果仍须 Mac／iPhone 复核。

## 本轮本地验证（2026-10-21）

- 42 个相关 Jest 套件、356 项测试最终复验通过，覆盖 API、Admin、媒体读写／哈希／幂等、分享与账号／家庭资格、撤回、清理及新增照片检查。原来故意不完整的 JPEG／PNG 夹具改为可解码合成图；一个用 EOI 后加字节制造不同照片的夹具改为不同像素编码数据，避免把新策略要求拒绝的尾部当作合法照片。
- 只读盘点 2 项 Node 测试、appstore-v1 3 项配置测试通过；TypeScript、变更 TS 的针对性 ESLint（零警告）、CLI 语法、差异空白检查通过。
- 本地 20 组合成图像独立解码像素比较通过，覆盖基线／渐进 JPEG 与 PNG alpha；这只验证容器清理不损坏已有编码流，不代表 Apple 原生重绘的颜色／方向实测。
- Expo 自动链接 search／resolve 发现 LampyFamilyImages pod 与模块；不是 CocoaPods 安装、Swift 编译或真机验证。
- 未连接生产服务器、未执行真实历史盘点、未处理真实照片、未改写或清除历史文件、未上传新 TestFlight。验收和部署仍待操作者完成，当前 PR 保持草稿。


## 2026-10-21 真机与生产盘点反馈

- iPhone 17 Pro／iOS 26.3.1：基础分享、私人原图保留、方向、PNG、色彩、家庭册、重试、中断、撤回及发布开关回归通过。但三照片记录含 HEIF 时失败，甚至该记录只勾选一张 HEIF 也失败；一、两照片记录可成功。因此不能宣布 HEIF 完整验收通过，也不能仅由数量判断根因。
- 两次生产只读盘点 schema 33：indexedPhotos 3 → 10，clean 0 → 7，needsPreparation 始终 3；其余异常计数为 0。gpsValues=NOT_READ_OR_PRINTED、physicalErasure=NOT_VERIFIED、historicalRewrite=NOT_PERFORMED。历史三张仍待处理，并非已证明含 GPS。
- 本次修订区分原图和上传大小限制、限制渲染内存、移除 HEIF 过严尺寸相等检查，并按原列表编号提示／标出失败照片。没有真实问题照片，尚不能确认哪一项触发该真机问题；需重新原生编译后验证。
- 必测原来失败的同一条三照片记录：HEIF＋相机＋PNG 全选；三张 HEIF 全选、任选两张、只选第三张；再测一、两张 HEIF 的原成功场景。若仍失败，记录明确的照片编号及提示；不得静默跳过失败照片提交部分分享。
- 本次不改 API、schema、历史文件或付费／导出开关。原生 ImageIO 编译、真实 HEIF 与新缩放副本视觉验收仍待 Mac／真机完成，PR 保持草稿。

### 本次修订自动检查

43 个相关 Jest 套件、370 项测试通过；TypeScript、改动文件 ESLint、5 项盘点／发布配置脚本测试通过。全量英文占位符检查另有 6 条既存文案格式不匹配（HEAD 4e1c260 已存在），本修订新增的占位符一致；该已知问题未在本片扩展修改。原生 Swift 未在 Linux 编译，真机复验仍待完成。

## 2026-10-22 HEIF 上传通过，详情读取仍待定位

用户真机确认原混合三照片和三 HEIF 全选／两张／第三张均可分享；新分享详情长时间加载后显示不可读，旧分享仍能阅读。本片尚未验收通过，不把成功上传当作成功阅读，也不据提示推断照片损坏。

新增 family-share-read-probe.cjs：读取现有 schema 33 数据库最近四条 active 分享及有效作者 session，仅发送 GET，对照 loopback 与 family.yunpura.com 的 DETAIL、MEDIA_METADATA、MEDIA_CONTENT 状态／耗时与内容哈希。使用作者身份进行对照，不代表另一成员的权限。session 只在进程内使用；不输出 ID、昵称、正文、媒体、URL、哈希或 token；不落媒体文件、不改 DB、不登录或签发会话。无有效作者 session 时明确跳过，因此采样结果不等于已覆盖用户选中的那条记录。

脚本可单独上传，以服务用户／EnvironmentFile 执行，不替换 API、不重启服务或重编 App。仅可据真实输出进一步决定服务端权限、媒体存储或客户端读取／续期修复。新增转换后重读测试覆盖一张及三张中全选／两张／第三张；本地 dispatch 和内存缓存不能替代生产数据库、网络、原生文件缓存及真机渲染。

## 2026-10-22 生产探针与慢下载修订

用户提供的首条分享：local DETAIL／3 张媒体信息及内容均为 200、哈希 MATCH；https 同样 200／MATCH，三张下载分别 4055／3714／9368 ms，合计约 17.1 秒。第二条输出只到媒体信息，不能宣称四条均已通过；作者视角不等于所有成员权限验收。

定位客户端内联详情的队列阻塞：列表在 ready 状态每 5 秒执行 list 续期，15 秒未成功则隐藏；详情 read 却在同一个 cacheTail 中串行下载全部媒体，list 的 replaceVisible 等待该队列，导致网络请求已成功但列表无法及时续期、清空行并卸载详情。新增回归测试在旧实现上失败，修订后通过。

修订仅让本机缓存操作进入队列，媒体网络下载在队列外等待；当前账号／资格、下载哈希、最终服务端授权仍检查，撤回、退出和移除后的迟到结果仍拒绝显示。资格时限维持 15 秒；超时使用 FAMILY_READ_LEASE_EXPIRED 与准确提示，真正的服务端 FORBIDDEN／SHARE_NOT_FOUND 行为不变。新增列表在详情下载中续期、超过 15 秒等待、下载中撤回、真实续期超时的回归；移除家庭的清理现在不必等待媒体网络完成。

44 个相关 Jest 套件／393 项测试、TypeScript 和改动文件 ESLint 通过。没有在真机重现实际网络速度，仍待用户用原失败分享复验。仅 JS／TS 与文案修改，无原生签名或依赖变动；现有原生工程可直接 Xcode Release Build／Run 安装，无需再次 prebuild clean、Pods、云端部署或迁移。PR 保持草稿。

## 2026-10-22 仍有间歇不可读：待采集客户端失败阶段

用户在 45b0ed9 后仍有两种结果：等待后读全照片，或等待后显示“这份家庭记录现在不可读”。队列回归虽已修复，不能据此宣布真机问题全部解决；45b0ed9 中本地续期超时已经使用另一句文案，仍需区分真实 FORBIDDEN／SHARE_NOT_FOUND 与实际安装版本。

新增临时 Xcode 控制台日志 [LampyFamilyRead]，固定 revision=photo-read-3；记录 START／READY、读取失败阶段 DETAIL／MEDIA_METADATA／CACHE／MEDIA_CONTENT／FINAL_AUTHORIZATION，以及父列表／详情加载或续期失败，保留错误的实际 HTTP 状态。仅输出固定事件／阶段、白名单错误码、序号和耗时，不输出记录 ID、账号、正文、媒体、文件路径、URL、服务器错误描述或会话。覆盖元数据、下载、最终授权和页面错误来源；真正权限拒绝仍隐藏内容，不延长阅读资格或改显示规则。

此提交是诊断增强，尚未修复剩余间歇失败。以原工程 Xcode Release Build／Run 安装，控制台筛选 LampyFamilyRead，复现一次并采集 START 到失败的日志；无需重部署 API 或再次运行服务器探针。诊断在首发合并前应评估移除。46 个相关 Jest 套件／398 项测试、TypeScript、ESLint 通过；另外新增 HTTP 状态保留测试单独验证。保持草稿，不合并。

## 2026-10-22 真机阶段日志与媒体通道分离

7f92526 真机：今天新分享等待后可打开；昨天 HEIF／相机／PNG 混合分享仍失败，更早记录可读。START 后，父列表 LIST_RENEW_FAILED／FAMILY_READ_LEASE_EXPIRED（该次续期 elapsed 10182ms），随后详情 MEDIA_CONTENT／STALE_FAMILY_REQUEST（整个读取 20361ms，媒体 1）。确认实际运行 photo-read-3，且列表资格过期先发生，媒体迟到结果是后果；没有证据将此判为服务端拒绝或照片损坏。此前缓存队列修订解决了一处阻塞，尚未解决这次等待。

源码核对：当前媒体 GET 仍使用 whatwg-fetch／RN XHR 的 Blob／FileReader，和 JSON 文本 XHR 同属 RN 网络栈。本次改为：Accept */* 的二进制 GET 显式使用 expo/fetch 的已有原生会话与原生 arrayBuffer，JSON 仍为文本 XHR，不改全局 fetch、不改上传通道、不失败回退旧媒体通道。Expo 模块已经随现有 App 原生工程提供，无新增 pod、原生代码或配置。

这是一项针对通道耦合的修订，不把 RN 内部阻塞推断当作已证实的唯一根因；真实 iPhone 上是否解决仍待验证。资格仍 15 秒，权限／撤回／哈希与迟到结果检查保留。诊断 revision=photo-read-4、mediaTransport=EXPO_NATIVE，新增 LIST_PROGRESS 的 DIRECTORY／LIST／CACHE 及 LIST_READY，可在仍失败时区分网络／资格读取与缓存等待，不输出私人数据。

47 个相关 Jest 套件／407 项测试、TypeScript、改动 ESLint 通过；新增原生媒体路由／授权和取消信号传递、媒体 body 未完成时 JSON 续期完成、原生取消不回退 RN 的测试。mock 测试不能替代 NSURLSession 真机并发实测。使用现有 Xcode 工程 Release Build／Run 后，先重开昨天失败的原分享（无需重新分享），再测今天／更早记录、收起重开、声音、后台保护与撤回。无需服务端更新、数据库迁移、prebuild clean 或 Pods；保持草稿。

## 2026-10-22 photo-read-4 真机日志：持久缓存重复全图校验

用户新日志中的多次 DIRECTORY／LIST 请求较快，但 CACHE 到 LIST_READY 约 3.6～6.8 秒；一次详情 READY=55931ms。另一条在列表缓存处理结束前发生 LIST_RENEW_FAILED／FAMILY_READ_LEASE_EXPIRED，随后详情媒体 1 返回 STALE_FAMILY_REQUEST。此日志包含成功和失败，不能将 native 媒体通道切换视作完整解决，也没有服务端拒绝证据。

定位持久 SQLite 缓存：replaceVisible 每次对可见记录调用 upsertListed；对已 received 且 revision 未变的行，后者会 reconcile 全部媒体，files.read 将整个文件读入 JS，再逐个 SHA256。内存缓存无此路径，因此先前内存／网络并发测试未反映真实列表续期开销。

修订在 SQLite replaceVisible 中保留已 received 且 revision 相同的行，不在索引刷新中重新校验所有照片。新／变更记录照常写入，远端不再可见的记录照常 isolate 与清除；真实照片读取仍按新鲜服务器权限、哈希和原生文件 stamp 检查；显式磁盘 list／reconcile 保留损坏或丢失文件降级。仅同步索引不构成媒体完整性证明或离线权限。

新增真实 SQLite／文件存储回归：三张已缓存照片刷新四次，旧实现发生 12 次 files.read，修订后为 0；显式磁盘检查仍检测损坏文件；撤回后的行和文件仍清除。旧实现上前两项失败，修订后 6 套件／82 项相关测试（含持久缓存恢复、读取、权限／撤回、声音和屏幕续期）通过；tsc、改动 ESLint、差异检查通过。

诊断更新为 photo-read-5（媒体仍 EXPO_NATIVE），保留 LIST_PROGRESS／LIST_READY 验证缓存段是否缩短。仅 TS／JS 修改，现有 Xcode Release Build／Run 即可，无需重新分享、清缓存／卸载、Pods 或服务器更新。首次公网媒体下载仍有网络耗时；本机真机性能、昨天混合照片分享、反复展开、旧／新记录和撤回／后台保护尚待复验，PR 保持草稿。

## 2026-10-22 030471b 真机通过，首次展示与展开定位

用户 iPhone 17 Pro／26.3.1 确认所有家庭记录可打开且内容完整，收起重开更快；仍有首次三大图等待较长、切换展开另一条后目标移出视野的问题。附加日志全量统计：153 次 LIST_READY，中位 98ms；28 次 START、27 次 READY，一次 STALE_FAMILY_REQUEST（无列表续期失败）；成功详情耗时从 74ms 到 46594ms。记录用户“读取稳定性通过”，不把记录切换／离页的过期请求猜作服务端权限拒绝。

本轮 read 增加可选进度回调：新鲜授权后先发布正文，单次读取最多两个媒体 worker，文件哈希校验及新鲜 share 授权通过后才发布对应 URI；保留原快照顺序、占位与计数，完成全部媒体和最终授权后才 markReceived。任一 worker 失败会阻止其他迟到发布；撤回、换账号、后台或离页仍隐藏／拒绝结果。缓存写入继续串行，不把网络放回写队列。

列表通过现有 SettingsPage 的可选 ScrollView ref，在切换展开导致前一条收起后，依目标行的新布局定位其顶部；选中行使用明确的展开 key 获得一次新布局事件，随后清除锚点，照片加载和后续布局不重复抢滚动。此变化只作用于家庭记录页，不引入新导航页。

photo-read-6 新增 TEXT_READY／MEDIA_READY，可分别比较首次正文、单份媒体与最终 READY 的耗时。首次完整下载仍受文件大小和公网带宽影响，不宣称已改变历史服务器文件或生成缩略图。

50 个相关 Jest 套件／430 项测试、tsc、改动 ESLint 与差异检查通过。新增并发上限／乱序完成后的原序展示、已下载字节在撤回后不发布、渐进 UI／后台迟到保护、收起前一条后按新布局定位且只滚动一次的测试。布局测试为 RN mock，不代替 iPhone 上的实际滚动／动态字体验收。现有 Xcode Release Build／Run 即可，无新 Pods、prebuild clean、服务器更新或迁移；此轮体验优化仍待真机复测，PR 保持草稿。
