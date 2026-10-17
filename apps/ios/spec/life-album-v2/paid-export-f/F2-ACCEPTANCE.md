> 当前以 UNIFIED-RIGHTS.md 的新基线为准：家庭创建不收费；长录音、精致版式具体门控仍待确定。以下支付配置准备不代表这些体验已交付。

# F2：统一权益实施与真实付费发布准备（尚未开放）

基线：main cfaccf4（PR #115 已合并）。本片先实施用户确认的统一购买规则，见 [UNIFIED-RIGHTS](UNIFIED-RIGHTS.md)，并保留只读配置预检。不配置真实商品/价格，不自动上传/购买，不开启公共收费。D 和家庭完整文件导出继续暂停。

## 本次可执行的检查

在本阶段 worktree 的 apps/ios 运行 `npm run album-export:preflight -- --mode local --storekit ios/LampyLocal.storekit`。使用当前终端的 EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1、EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1 和匹配 StoreKit 商品的 EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID。先按 F1 步骤 prebuild/Pods，预检读取生成的 ios/Lampy/Info.plist 和共享 Lampy scheme。可通过 --plist、--scheme、--storekit 指定相对 apps/ios 或绝对文件路径。检查的是磁盘生成配置，不是已安装二进制或 Metro 进程环境。

返回 CONSISTENT 仅表示 JS/native 开关、商品 ID、Run 配置和本地商品定义一致。仍需在 Xcode 启动 App，并观察商品/权益请求。预检不验证 Xcode 当前选中了哪个 Scheme 或运行目标，也不解析 Xcode 的相对引用语义；核对文件名后仍由测试者确认实际选择文件的完整路径。错误退出不打印环境变量、账号或交易内容。

本地测试必须让 localhost、127.0.0.1、::1 绕过 Mac 系统代理及代理客户端；StoreKit 使用动态本机端口，不能只放行 8082。F1 用户实测商品为空来自本地 catalog 请求被 7897 代理返回 502。修改后重启对应模拟器，再由 Xcode Run；不要删除 App 数据。此工具不修改代理，也不宣称已验证代理设置。

## 从本地 StoreKit 切换真实 Apple Sandbox

1. 在 App Store Connect 准备实际 non-consumable 商品 ID、价格、本地化、应用与商业配置，并创建 Sandbox 测试账号。这些资料和操作尚未完成，不使用本地测试价格作为商业定价。
2. 同一个开发终端设置正式入口/付费开关为 1，商品变量填写后续确认的真实配置 ID，并设置 EXPO_PUBLIC_UNIFIED_PURCHASES=1；服务器先按 UNIFIED-RIGHTS.md 配置交易验证并部署 migration 31。重新 prebuild、Pods 和 Mac 重编，确保 native 商品 ID 同步。保持家庭完整导出关闭。
3. Xcode 当前运行 Scheme → Run → Options → StoreKit Configuration 选 None。运行 `npm run album-export:preflight -- --mode sandbox`。本工具拒绝已知的本地示例 ID app.lampy.export.test；其他 ID 的 App Store 可售状态必须实测，不能靠字符串检查证明。
4. 同一环境启动 Metro，在真机开发构建中验证真实 Sandbox（不做生产扣款）。账号与设备准备参考 Apple 官方说明；不把本地交易管理器里购买视作此项通过。
5. 完成下面矩阵后记录代码 SHA、构建号、设备/OS、测试环境和结果；不记录密码、token、JWS 或收据。预检永远输出 appleSandbox/releaseReady=NOT_VERIFIED。

## 尚待人工完成

| 项目 | 通过标准 | 状态 |
| --- | --- | --- |
| 真实商品查询 | 返回正确商品与本地化价格，无本地 StoreKit 文件介入 | 待验收 |
| 真实 Sandbox 购买/取消/恢复 | 验证权益；取消不生成；恢复不重复购买 | 待验收 |
| 账号切换、其他设备恢复 | 不复用前账号权益；当前购买账号可恢复 | 待验收 |
| pending/后续批准 | 等待不授权，批准后更新；不自动生成 PDF | 待验收 |
| 真机退款/撤权 | 新生成拒绝，保存文件仍可读 | 待验收 |
| 生成中撤权、离页/后台/保护 | 提交前拒绝并清理；无隐私泄露或自动重试购买 | 待验收 |
| 离线和错误 | 已验证本地权益不因价格离线失效；未购不越权 | 待验收 |
| TestFlight、审核与隐私材料 | 商品/价格/恢复说明与实际一致 | 待验收 |

个人正式归档脚本仍强制关闭付费/导出测试标志。不要用修改生产归档脚本的方式跳过验收；付费候选打包与上线应在后续明确配置后独立处理。F2 工具通过不等于本矩阵通过。价格、正式 SKU 等缺失时可继续准备与检查，但不能宣称已实现真实商业开放。

Apple 参考：
- https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode
- https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox
- https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account

统一权益测试须先登录 Lampy。Xcode 本地 StoreKit 仅用于原生购买/预检，不能为云 API 产生 Apple 签名的真实交易。自动测试通过不替代新 Swift 编译和真实 Sandbox 服务端验证；正式商品命名与商业定价仍待后续，不沿用“仅个人 PDF”作为最终说明。
