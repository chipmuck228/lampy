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
