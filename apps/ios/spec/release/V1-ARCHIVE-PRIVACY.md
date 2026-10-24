# 1.0.0 最终 Archive 的 SDK、隐私清单及权限核验

本阶段从已合并 #132 的 main 142a399 开始。检查工具和准备工作不代表最终 Archive 已通过；当前环境没有 Mac/Xcode 或用户的最终 .xcarchive。购买、个人／家庭导出及打印仍关闭，#131 不合入。不上传 App Store Connect、不修改商店问卷或官网政策。

## 变更与发现

既有 inspect-release-archive.cjs 会检查构建身份、签名团队、开关标记、JS bundle 和动态库依赖，但对隐私清单仅列路径。新增 scripts/inspect-archive-privacy.py 使用 Python 3.9+ 标准库读取实际 Archive 的 XML／二进制 plist，清单结构、声明的 tracking／采集类型、访问 API 理由及语言用途文案；列出 framework 版本、Mach-O／JS bundle 哈希、可选 Podfile.lock 摘要，并在 macOS 调用 codesign --verify --deep --strict。OpenStep .strings 只用 plutil 转换到标准输出，不改输入。报告目录必须在签名归档外，拒绝越界 plist／符号链接读取。

实际功能只会选择系统照片、拍照并写入 Lampy 自己的沙盒，不把记录添加到系统相册。移除 app.json 和中英文 locales 里多余的 NSPhotoLibraryAddUsageDescription，尤其不保留“仅用于系统要求”的用途说明；仍保留相机、麦克风、相册选择和 Face ID 四项用途。源码未发现 UIImageWriteToSavedPhotosAlbum、PHPhotoLibrary 写入或 Expo media-library 保存调用；最终产物是否仍被依赖增加权限由检查工具再次核对。

工具发现不符合首发范围的权限、后台模式、tracking 声明、正式 profile／版本／build 不符、结构错误、签名失败等会退出非零。理由码只做语法校验，不判断 Apple 允许理由是否与真实 API 使用相符。tracking 字段缺失保持 null，不推定“无追踪”。framework 名单不覆盖静态链接 SDK，Podfile.lock 不证明与该 Archive 一一对应；均明确要求人工比对。staticChecks=PASS 仅表示这些静态规则通过，releaseReady 始终 NOT_VERIFIED。

## 需要逐项完成的证据

| 项目 | 工具能确认 | 仍需人工／真机确认 |
| --- | --- | --- |
| 构建身份 | 实际 Info.plist 版本／build、文件哈希、正式开关标记；沿用旧归档检查 | archive-report.txt 的 git SHA／dirty 状态确实属于这次构建，Xcode 选中的同一份 Archive |
| SDK | 内嵌 framework、版本、全部发现的 PrivacyInfo.xcprivacy | 同次 Podfile.lock、静态 SDK、Apple 当前必需清单中的 SDK 及二进制 SDK 来源签名；未列出的 SDK 也须理解其行为 |
| 必需理由 API | 类别与非空理由码结构 | 对照调用用途与 Apple 官方允许理由，不因有字符串就认定合规 |
| 数据采集 | 清单声明的类型、linked／tracking 与用途 | 家庭服务主动分享、账号、举报等实际处理；不能用 SDK 的空数组声称整个 App 不采集数据 |
| 权限 | 相机／麦克风／照片／Face ID 文案及中英文资源，额外权限与后台模式 | 实际中文／英文系统弹窗、仅在操作时请求、拒绝后可继续使用、有限照片权限和本机保护 |
| 发行 | 旧归档检查、整体 bundle codesign 验证 | Xcode Privacy Report、Validate App 提示、SDK 来源签名、离线冷启动；codesign 通过不代表 SDK 原作者签名要求通过 |

初步 SDK 核对范围（源码线索，不是最终产物验收）：React Native／Hermes、Expo 文件／SQLite／图片／录音／本机认证／Apple 登录／应用信息、本地 LampyFamilyImages／LampyAlbumLayout／LampyQuickActions／LampyExportPurchases 模块。付费原生模块仍可能编译入包；功能关闭不等于二进制中不存在 StoreKit，不能仅按类名误判已开放购买。

## Mac 构建与执行

使用新的独立 worktree，避免覆盖既有 ios 工程和 StoreKit 本地配置。不要卸载真机 App 或删除本机记录。版本由正式 profile 固定为 1.0.0，build 必须使用尚未使用的新编号，不能替用户猜测其 App Store Connect 中的最大编号。

```sh
cd /Users/zhen/WeChatProjects/lampy-life-album-local
git -c http.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-v1-archive-privacy origin/release/archive-privacy-audit
cd /Users/zhen/WeChatProjects/lampy-v1-archive-privacy/apps/ios
npm ci
printf '请输入新的、未使用的 build number：'
read -r LAMPY_BUILD_NUMBER
export LAMPY_BUILD_NUMBER
export LAMPY_ARCHIVE_OUT="$HOME/WeChatProjects/lampy-v1-privacy-artifacts/$LAMPY_BUILD_NUMBER"
bash scripts/release-archive.sh --appstore-v1
```

以上直接完成 Release archive，不需先 prepare 后再重复归档。脚本不上传；签名／编译失败应先解决，不将旧 Archive 当作本次产物。若同一路径已有 gitignored ios，按脚本提示保留后另选新 worktree；不要为了检查就直接删除本地原生修改。也可 --prepare 后在 Xcode 手动归档，但必须使用那个实际产物路径执行检查并记录其 build，不能混用脚本输出目录里的旧文件。

在同一个终端中，归档成功后：

```sh
bash scripts/release-archive.sh --appstore-v1 --inspect "$LAMPY_ARCHIVE_OUT/Lampy.xcarchive"
python3 scripts/inspect-archive-privacy.py \
  --archive "$LAMPY_ARCHIVE_OUT/Lampy.xcarchive" \
  --expected-build "$LAMPY_BUILD_NUMBER" \
  --podfile-lock ios/Podfile.lock \
  --output "$LAMPY_ARCHIVE_OUT/privacy-audit"
open "$LAMPY_ARCHIVE_OUT"
```

若静态检查非零，保留 archive-privacy.json 的问题码，先修复源码再重编。不要修改签名 Archive 中的 Info.plist 或 PrivacyInfo.xcprivacy 来消除提示；这样会破坏签名并让证据失效。

## Xcode 与用户回传

Xcode → Window → Organizer → Archives，定位同一 version/build，使用 Generate Privacy Report（常在归档右键菜单）生成隐私报告；根据当前 Xcode UI 导出可供核对的结果。检查第三方 SDK 隐私清单与签名提示；若使用 Validate App 仅验证，不执行上传或提交。Privacy Report 是声明汇总，不能代替真实运行与服务端数据流判断。

首先只回传以下材料，无需整个 Archive：

- archive-report.txt（构建来源与旧静态检查）。
- privacy-audit/archive-privacy.json（实际包内清单与 SDK 摘要）。
- 同一 Archive 的 Xcode Privacy Report，以及 SDK／隐私相关验证警告（如有）。

不提供 Apple 私钥、管理员凭据、完整 provisioning profile、密码、用户记录或照片。真实产物报告用于核验，不自动写入公开 PR。

真机最小回归：中文／英文权限弹窗用途正确；相机、照片选择（含有限权限）、录音授权拒绝后不死循环，允许后正常记录；本机保护正常；无“添加照片到系统相册”请求；无购买／恢复购买／个人或家庭导出／打印入口；不连接 Metro 时可冷启动。不要通过卸载旧 App 来重置权限，以免丢失本机记录；需要首次授权时使用独立测试设备或谨慎评估系统级隐私重置的影响。

## 当前验证记录

2026-10-24：9 项 Python 合成 Archive 测试通过，覆盖二进制 plist、逐 SDK tracking／理由、权限／语言遗漏、签名失败、错误 build、只读与输出边界，不伪造真实 SDK 签名通过。7 项既有归档／正式 profile 脚本测试通过。尚未收到本阶段最终 Archive 报告、Xcode Privacy Report 或真机权限回归，最终安装包隐私核验仍为待验收。没有自动填报 App Privacy。

## 官方参考（2026-10-24 核对）

- https://developer.apple.com/support/third-party-SDK-requirements/
- https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk
- https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests
- https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- https://developer.apple.com/documentation/bundleresources/information-property-list/nsphotolibraryaddusagedescription

## First-party disclosure follow-up

See V1-DATA-DISCLOSURE.md for the seven-category mapping, production aggregate probe and App Privacy worksheet. Build14 reports were received: static checks passed within tool scope; collected-data declarations were empty and Xcode PDF blank. The subsequent first-party manifest requires a fresh Archive; final approval remains pending.
