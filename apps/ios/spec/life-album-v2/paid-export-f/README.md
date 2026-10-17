# 阶段 F1：默认关闭的一次购买导出

基线 main d09eaf1；独立分支 ios/life-album-paid-export-f。用户确认一次购买解锁，价格和正式商品 ID 后续由 App Store Connect 配置。没有设置价格、发布商品或进行真实扣款。阶段 F 尚未完成发布验收。2026-10-17 用户完成 Mac 编译与本地 StoreKit 模拟器验收；真实 Apple sandbox、真机与 TestFlight 仍待验收。允许作为默认关闭能力合并，不等于开放收费。

## 本次交付

个人册现有 PDF 路径接入正式导出入口、StoreKit 2 非消耗型购买、恢复购买及交易更新。只有 StoreKit verified、商品匹配、未撤销的 non-consumable 交易可授权。当前权益属于 App Store 账号，不是一个可编辑的本地布尔值，也没有绑定或转移为 Lampy 家庭共有权益。

免费方向继续是创建、整理、完整预览与阅读。购买、生成与系统分享三个动作分开；生成和分享不自动购买，重复生成不按次收费。取消购买、pending、验证失败均不当作购买成功；购买/恢复双层串行化。未完成交易更新在原生监听中处理并 finish，恢复购买只在用户点击后调用 AppStore.sync。每次开始导出和成品提交前核对权益，退款/撤销后不能制作新成品；不删除或远程禁用以前保存的文件。旧 PDF 的系统保存/分享不要求重新购买。

价格只使用对应 StoreKit Product.displayPrice，不硬编码价格或伪造购买。已购用户不因商品价格查询离线而失去已有 verified 权益。缺商品、原生模块或验证失败时不绕过付费。JS 配置商品与原生构建配置商品必须一致。

阶段 D 仍暂停；完整生活册文件、外部文件阅读器和家庭完整文件导出不在此 PR。家庭 API canExport 继续为 false，开发家庭入口保持原门控；支付成功不能代替当前家庭创建者/成员/分享资格，也不能开启尚未实现的家庭导出。以后家庭导出必须增加其自己的服务端交易核验，不能信任客户端 owned 或本次个人 PDF 权益结果。

## 开关与开放方式

| 配置 | 默认 | 含义 |
| --- | --- | --- |
| EXPO_PUBLIC_ALBUM_EXPORT_ENABLED | 关闭 | 正式个人 PDF 菜单与直接路由 |
| EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED | 关闭 | 正式导出是否需要一次购买权益；必须正式导出也开启才有效 |
| EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID | 空 | App Store / Xcode StoreKit 中配置的 non-consumable 商品 ID |
| EXPO_PUBLIC_ALBUM_PRINT_EVAL | 原有关闭 | 仅开发打印验收；不能绕过已开启的正式收费路径 |

正式导出开、付费关时允许免费 PDF；两个都关保持当前产品行为。原生配置由 app.config.cjs 写入 LampyPaidExportEnabled / LampyExportProductID，默认覆盖为 false/空，不继承旧值。非法开关值或收费缺少合法商品 ID 会阻止配置生成。

这些是构建配置开关，不是已部署的远程开关。新增原生模块及更改原生付费配置都需要 Mac prebuild、Pods 和重新编译。未来配置商品、开关并通过验收后，不需要再修改购买代码；不能只改运行中的 Metro 环境就承诺真实付费上线。服务器无需更新，本 PR 无数据库迁移。

## Mac 测试准备

在从最新 main 建立的独立 worktree 的 apps/ios 运行。先保持全部付费开关关闭，确认旧阅读/编辑和开发打印行为。付费测试使用 Xcode StoreKit 或 Apple sandbox，不进行生产账号真实扣款；商品 ID 必须由测试者配置，以下变量不能保留空值。

```bash
export EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1
# 填入你已创建的 non-consumable 商品 ID，不使用虚构商品作为上线配置。
export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='YOUR_CONFIGURED_PRODUCT_ID'
npm run prebuild:ios
npx pod-install
npm run ios -- --port 8082
```

Xcode 本地 StoreKit：在本机创建 StoreKit configuration，加入一个 Non-Consumable 商品并使用同一 ID，设置本地显示名称和测试价格，将 configuration 关联到运行 scheme，再从 Xcode 运行 App。不要将本地模拟交易通过当作 App Store sandbox / TestFlight 或真实购买通过。最终沙盒测试关闭 scheme 的本地 StoreKit configuration，使用 App Store Connect 的真实配置与测试账号。

Apple 原始参考：
- https://developer.apple.com/documentation/storekit/transaction
- https://developer.apple.com/documentation/storekit/appstore/sync()
- https://developer.apple.com/documentation/storekit/product/purchase(options:)
- https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode

## 必测矩阵（本地实测范围见下方记录）

1. 默认关闭：Release 无正式入口，直接路由也不显示生成；不查询/购买商品。开发打印 flag 仅开发有效。
2. 正式开、付费关：免费生成 PDF，不访问 StoreKit。
3. 付费开、未购买：显示 StoreKit 本地化价格；只进入页面不弹购买；直接点生成仍被底层拒绝。
4. 配置缺失/商品不可用/类型错误/原生版本旧：不显示假价格，不给予权益，可离页或恢复/重试。
5. 取消、pending、网络失败、未 verified：不生成、不自动重试购买；审批后交易更新，用户再明确点生成。
6. 购买成功：用户明确点生成后生成 PDF；再次生成、新建另一册、取消系统分享均不重复收费。
7. 重启、恢复购买、切换 App Store 账号、其他设备恢复：重新核对当前权益，不复用旧账户布尔值。
8. 退款/撤销：下一次生成拒绝；导出过程中失效在提交前拒绝并清理未完成成品。以前保存到系统文件的 PDF 仍可读；旧成品保存/分享不再收费。
9. 连续点击购买/恢复、购买弹窗触发 inactive、切后台、锁定、离页与迟到结果：不重复购买，不自动导出，不泄漏正文。
10. 中文/英文价格与文案、照片/emoji/PDF、已有声音与家庭读取回归；购买不解锁家庭文件导出或未完成阶段 D。

## 自动检查

本轮已通过 9 suites / 83 Jest tests（导出权益、生成前/提交前门控、PDF/文件、购买UI、个人管理和家庭只读边界）；TypeScript 与改动 ESLint 无错误。原生 Swift 在此 Linux 环境没有编译器，未编译或运行 StoreKit；已有个人册 UI 测试的 overlapping act 提示仍在。6 项 Node 配置脚本测试通过（含既有 family-internal profile），保留原有受控构建配置。

## 隐私与发布缺口

购买通过 Apple StoreKit 处理；不向支付流程发送册名、记录正文、照片、声音或家庭成员列表，不保存付款卡信息、Apple 密码或交易明文日志。应用不上传收据/JWS 到家庭 API，本阶段也不授予家庭服务端导出权限。上架前仍需按真实支付与数据处理行为更新隐私披露、App Store 商品说明和审核材料，验收退款/恢复与账号切换。

发布缺口：正式商品 ID / 定价 / 商品可售状态未配置；Apple sandbox、TestFlight、跨设备恢复和真机权益回归未通过；家庭服务端支付证明与家庭文件导出未实施；阶段 D 仍暂停。以上不能被开关值代替，本 PR 不自动合并或开放收费。

## 2026-10-17 合并前审查与实测

用户报告 iPhone 17 Pro Max（模拟器列表 iOS 26.3；Xcode 显示 26.3.1）本地 StoreKit 测试通过：App 内购买、取消购买、显式恢复、重启保留权益、同册新增记录后再生成、其他个人册无需重复购买、PDF 保存到系统文件、退款后阻止新生成且已保存文件仍可打开。不是我们在 Linux 代跑的原生结果，也不代表真实 Apple Sandbox 或跨设备恢复通过。pending、购买中后台/锁定等完整实机矩阵仍待验收。

商品查询为空的系统证据：StoreKit 本机 catalog 请求 localhost 动态端口经过 127.0.0.1:7897 代理，返回 HTTP 502。Mac 系统代理和代理客户端均应让 localhost、127.0.0.1、::1 直连；应用于本地地址而非绑定某个临时端口。修改后重启模拟器，从 Xcode 运行。之后返回 verified 非消耗型权益和 count=1 商品。无需修改价格或重建商品。

审查发现并修复正式归档继承测试终端导出开关的问题：release-public-env.sh 强制清除正式/付费/开发打印开关和商品 ID，回归测试以污染环境执行真实 shell profile 并核对 native 配置。普通正式归档始终保持未开放；付费候选包需后续独立的显式配置与验收。

合并检查：导出前/提交前授权、清理、StoreKit verified/type/product/revocation 校验、默认关闭及家庭 canExport=false 边界审查。DEBUG 日志仅商品/验证错误标识，不打印交易ID、收据或账号。不存在未解决的 GitHub review threads。真实商业开放与隐私/商品材料仍是发布门槛，不能把合并当作支付上线。

2026-10-17 后续设计更新：统一购买不再仅个人 PDF；最新规则与 F2 实施边界见 [UNIFIED-RIGHTS](UNIFIED-RIGHTS.md)。本页 F1 交付与本地验收为历史基线，不代表统一服务端权益已通过真实 Sandbox。
