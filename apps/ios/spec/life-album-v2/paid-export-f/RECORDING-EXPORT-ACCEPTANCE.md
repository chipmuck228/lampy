# 录音与正式导出验收

本片范围：免费 60 秒／付费 1800 秒的单段录音、到限自动停止并保留草稿、全部正式成品导出的购买门控。现有素纸和手作不收费。高级排版方案留到其他 PR；家庭完整 PDF 与内容包仍未开放，不能将“全部导出付费”解读成新增这些导出能力。

## Mac 本地 StoreKit

先停止当前 Metro，并在仓库根目录检查 git status。保留本地改动，拉取 PR #116 分支最新提交后再启动。不要删除 App 或抹掉模拟器。

```bash
cd /Users/zhen/WeChatProjects/lampy-life-album-paid-export-f
git status --short
git -c http.proxy=http://127.0.0.1:7897 fetch origin
git switch --detach origin/ios/life-album-paid-export-f2
cd apps/ios
npm ci --ignore-scripts
npm run native:patch
export EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID=app.lampy.export.test
export EXPO_PUBLIC_UNIFIED_PURCHASES=0
export EXPO_PUBLIC_ALBUM_PRINT_EVAL=0
npm run prebuild:ios
npx pod-install
npm run album-export:preflight -- --mode local --storekit ios/LampyLocal.storekit
open ios/Lampy.xcworkspace
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --dev-client --lan --port 8082 --clear
```

保留 Metro 终端。Xcode 选择 Lampy scheme、目标模拟器，Run → Options 选此工作目录的 LampyLocal.storekit；商品为 app.lampy.export.test、Non-Consumable。该本地文件若未被 git 跟踪，需要使用此前的本地配置或在 Xcode 创建，不能假定 prebuild 会生成。由 Xcode ⌘R 启动，从而注入 StoreKit；仅按 Metro 的 i 不能证明已注入。Mac 系统代理与客户端均放行 localhost、127.0.0.1、::1，包含动态本机端口。

这里关闭统一账号模式，便于先检验客户端录音、购买和个人 PDF；不访问 Apple 服务端交易 API，也不冒充统一账号链路验收。EXPO_PUBLIC_UNIFIED_PURCHASES=1 的 Sandbox 验收另见 F2-ACCEPTANCE.md，须真实商品、服务器验证配置和 migration 31，不能用 Xcode 本地交易替代。

## 测试内容

| 场景 | 操作及通过标准 |
| --- | --- |
| 免费录音 | 在交易管理器清除该商品测试交易；新录音显示本段 1 分钟，最后 10 秒提醒，60 秒左右原生停止并保留可播放草稿。继续写字、保存、回看可播放；没有购买弹窗。 |
| 手动停止与重录 | 到限前停止并播放；重录到限后只有新的一段，不重复保存。重录启动失败时原声音保留。 |
| 免费试排 | 未购买仍可阅读、整理、切换素纸／手作和看纸页；不生成免费正式 PDF。 |
| 未购／取消 | 导出页显示真实价格，点击生成不自动购买且无新 PDF；显式购买后取消，仍不授权且不持续加载。 |
| 购买与长录音 | 在 App 中购买成功；新录音显示 30 分钟，超过 60 秒仍继续。至少完成一次真实 30 分钟到限，播放检查开头、中间、结尾；文件可保存并回看。不可用短计时 mock 替代此项。 |
| PDF | 购买后生成个人 PDF、保存到文件；同册加记录重生成、另一册生成均不重复收费。 |
| 重启与恢复 | 重启 App 后新段仍为 30 分钟；明确点击恢复购买能恢复权益，不自动生成 PDF。 |
| 退款 | 先停止当前录音，再在 StoreKit 管理器退款；下一段回到 1 分钟，不能生成新 PDF。已有长录音仍能播放，已保存 PDF 仍可打开。录制中撤权不截断本段，下一段生效。 |
| 后台／锁定／离页 | 免费和付费录音中切后台或锁定，沿用原有中断保留流程；返回不自动继续录音，不泄露内容。 |
| 网络或权益失败 | 无法完成检查时仍能录制免费 1 分钟；界面显示实际预算，不假称已解锁。正式导出验证失败不放行。 |

计时与原生落盘有很小的 UI 轮询延迟（250ms）；原生录制本身受 60／1800 秒限制，不依赖 JS 定时器停止硬件。文件时长按实际编码验证，不能仅看页面数字。已录内容不因退款被裁剪，也不对历史声音加播放时长限制。当前新录音不提供后台持续录制或异常恢复承诺。

若开启家庭相关构建开关，仍按原家庭验收单复核免费创建、分享和阅读；此轮无新的服务器代码或数据库迁移，整个 PR 先前的统一购买服务器改动仍未部署。

## 既有家庭媒体限制

本次 30 分钟录音是本机捕获时长，不扩大云端媒体容量。家庭服务仍保留单媒体 8 MiB 上限，高质量长录音可能超过该值而不能分享到家庭；本机保存、播放和个人 PDF 生成不受该上传上限影响。不能将本次验收记作 30 分钟家庭音频分享通过；压缩传输或容量策略另行处理。
