# Phase D 恢复：家庭纸页与付费 PDF

基线 main f14de93（#117 已合并）。用户已在 iPhone 17 Pro Max / iOS 26.3.1 验收家庭基础列表、内容预览、媒体、缓存、权限、撤回和保护，并验收切换列表闪字修复。这些旧验收不代表本片纸页/PDF 已人工通过。

家庭册“看看这一册”进入与个人册共用的连续阅读界面，在同一位置选择素纸/手作，再进入共用的“看纸页”界面；字号、间距、页面比例、2 倍缩放、翻页栏、页内声音点击和恢复尺寸浮层共用实现，不再单独绘制家庭版外框。纸页不重复放置风格按钮。复用个人册 Core Text 测量、字体诊断、分页、原生页面绘制和打印，素纸/手作均免费。显示分享者昵称，正文和 emoji 不改写。家庭资料只适配到内存排版输入与家庭接收缓存，不写入个人 moments、assets 或册子。风格选择和阅读位置仅按账号/家庭/册子在当前进程记忆，不持久化家庭快照、媒体 URI 或阅读位置到个人 SecureStore；家庭照片禁用额外图片磁盘缓存。

家庭 PDF 默认关闭。当前 creator 通过服务器付费授权后才可生成；家庭保留原解锁购买来源，creator 转交后新 creator 可使用该家庭资格，但不获得个人长录音或个人成品制作权益。退款拒绝新生成，已保存成品继续可用。PDF 不含可播放声音；内容包、高级版式和云备份不在本片。

## 权限与冻结

- 免费预览走现有 family read/validate 与媒体授权。15 秒读取租约，每 3 秒串行续验；暂时网络失败在原租约内保持显示，拒权立即清除，超时清除并显示重试。离页、锁定、后台使在途工作失效并暂停声音。
- 新增 POST /v2/families/:familyId/albums/:albumId/export-access，body={validation}。要求会话、当前 creator、规则确认、完整有效的收入记录，以及本家庭有效购买来源。Apple 核验在 SQLite 事务外执行；之后重新读取角色和册子 validation，防止网络等待期间转交、整理或撤回。
- 生成前、提交前、提交后交付前重新调用服务器授权。下载后和排版后还检查 source validation；生成途中失权或变动会清除本次 staging/成品，不向页面报告成功。
- 已有 withdrawn 占位可在免费纸页显示；PDF 不静默遗漏它，须先整理移出不可用条目。媒体无法读取或损坏时不伪造成完整成品。
- 正式 PDF 使用既有落盘、PDF 文本/emoji 检查、manifest、摘要和成品冻结；文件按账号/家庭/册子隔离列出。已交付成品不是可撤回的家庭在线记录，不能反向导入 moments。
- 分享者撤回的在线生效受现有读取租约限制，不宣称即时远程删除已经保存的文件。生成结果在最终核验后才交付，不提供跨设备原子撤销本地 PDF 的承诺。

## 开关与部署

预览：EXPO_PUBLIC_FAMILY_ENTRY_OPEN=1、EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS=1、EXPO_PUBLIC_FAMILY_ALBUM_EVAL=1，API=https://family-test.yunpura.com。现有 API 的家庭册 read/validate 已支持预览，不必为了试纸页开启支付或部署新 API。

付费 PDF 客户端额外设置 EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED=1，并要求 EXPO_PUBLIC_UNIFIED_PURCHASES=1、EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1、EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1 与真实商品 ID。原生统一购买开关更改必须按 F2 流程 prebuild、Pods、重编；不能只改 Metro。

服务器需部署本片代码，保持既有 LAMPY_FAMILY_HISTORY_ENABLED=1、LAMPY_FAMILY_ALBUMS_ENABLED=1，按 #116 配置真实 Apple Sandbox 交易校验，再设置 LAMPY_UNIFIED_PURCHASES=1、LAMPY_FAMILY_ALBUM_EXPORT_ENABLED=1。健康接口 familyAlbumExport 表示是否具备该能力。个人购买或家庭解锁资格不能替代 export-access 的册子版本校验。

本片不新增数据库迁移；需已有 #116 的 migration 31。若云端仍在旧版本，先备份并按原服务用户/环境执行现有迁移脚本。迁移和真实支付配置不在此次自动操作范围内，当前未部署。

公开归档脚本强制清除新家庭 PDF 开关和所有统一购买测试标志；UI 继续受家庭开发验收入口控制。本地 Xcode StoreKit 不能生成服务器认可的 Apple 签名交易，不提供绕过服务器的本地家庭 PDF 通道。已验收的个人本地 StoreKit 不等于家庭完整付费链路通过。

家庭单个媒体仍限 8 MiB；本次不扩大音频上传容量。PDF 和已复制的本机成品由用户保管，不承诺云托管、异常恢复或完整个人库备份。

## 自动与人工验证

自动测试覆盖免费成员试排、双风格、翻页/放大、后台/失权隐藏、输入适配与昵称、跨账号拒绝、撤回后的迟到下载、服务器源购买与 creator 转交、退款、Apple 等待期间的内容变化、交付前失败清理、默认关闭与公开构建清理。旧个人排版/打印和家庭接口一起回归。mock 的字体和 PDF 结果不代替原生渲染与真实 Sandbox。

人工步骤见 TESTING.md。当前新纸页、新家庭 PDF 均未由 Mac 人工验收；需记录提交、设备/OS、风格、册子规模和结果。
