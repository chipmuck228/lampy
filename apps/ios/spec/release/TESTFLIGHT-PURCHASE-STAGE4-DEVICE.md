# 第四阶段：统一购买真机验收

测试分支：`fix/unified-purchase-feedback-stage-4`，基于 PR149/c88b99c。免费预览继续提供；Android 关闭购买/导出，PDF 关闭。无服务端或数据库变更。不得卸载 App 或清空记录来测试。

## Mac 安装

在包含本分支的仓库根目录逐行执行，发生分支占用或本地修改冲突时停止，不强制覆盖。

```bash
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git switch fix/unified-purchase-feedback-stage-4
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull --ff-only origin fix/unified-purchase-feedback-stage-4
git log -1 --oneline
LAMPY_FAMILY_EPUB_PRODUCT_ID=lampyepubexport bash apps/ios/scripts/prepare-family-epub-device.sh sandbox
```

Xcode：选择 iPhone；Run = Release；StoreKit Configuration = None。覆盖现有安装，沿用 family-test.yunpura.com 和匹配的 Apple Sandbox 配置。不要混用本地 design-test StoreKit 产品与真实服务端核验。该脚本用于本地真机测试，不用于正式商店 Archive。

## 优先验收

1. 现有已购 Lampy 账号：从家庭册进入个人册保存页，无需再次付款；能保存并分享到图书。反方向也检查。家庭尚未启用时，点击“使用我的购买解锁这个家庭”，此步骤应直接启用且不再次弹出购买。
2. 已有家庭授权时：显示保存与分享入口；不无条件显示 Try again，不因个人商品价格读取失败而显示商品不可用。已有家庭授权并不代表当前创建者拥有授权来源账号的个人权益。
3. 设置 → 购买与解锁：显示当前真实权益、恢复购买和 Apple 购买记录入口。进入页面不自动付款、恢复或打开浏览器；点记录才打开 Apple 页面；无法打开时有 App Store 兜底说明。
4. 使用可供 Sandbox 测试的未购账号：显示 Apple 实际价格；取消不报付款失败、不自动重试。待批准状态不解锁、不建议再次付款。付款成功但服务端核验失败时显示待核验，不声称成功，也不自动导出。
5. 切到后台、锁屏、离开再返回，重新核对当前资格，无旧解锁状态残留。断网时区分资格未知与商品不可用，恢复网络后可重查，不因错误引导已购用户再次付款。
6. 普通家庭成员仍免费预览，没有保存/分享入口；历史成品再次分享和左滑删除正常；PDF 入口仍关闭。

## 后续边界验收

- 同一 Lampy 已购账号在第二台设备或本机缺少交易凭据时，应由服务端重新验证后恢复权益；不能要求重新买。
- 切换到另一个 Lampy 账号，不能仅凭相同 Apple 账号或原生 owned 布尔值授予权益；首次认领交易仍需匹配 appAccountToken。
- 测试退款/撤销后刷新，个人权益和家庭授权按服务端核验结果收回；核验服务暂不可用时不授予未知权益。
- Sandbox/本地 StoreKit 测试交易不作为正式付款凭据。正式订单、收据与金额由 Apple 购买记录展示；Lampy 不捏造订单列表。

## 自动验证

购买应用层、页面、内存/SQLite 服务端绑定和退款、Apple 验证适配器均使用合成交易与模拟验证器；不等于真实 Apple Sandbox 验收。回归覆盖旧版会失败的“服务器已购但本机无交易”与“家庭已授权仍显示重试”场景。自动验证 111 项通过；Android personal 332 项、preview 225 项通过；TypeScript、修改范围 ESLint（零警告）和 diff 检查通过。旧版两项回归均失败，修订后通过。CI 与真实 Sandbox 真机验收仍分别记录，不以本地结果冒充。

Apple 官方依据：
- https://support.apple.com/en-us/118212 （购买记录及不同 Apple 账号）
- https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox （Sandbox 测试）
