# 家庭预览 TestFlight 内部候选包

基线 main 390cf07（#118）。用户已在 iPhone 17 Pro Max / iOS 26.3.1 模拟器验收免费家庭阅读、素纸／手作和纸页预览。本片允许明确的 family-internal Release 构建使用相同入口；普通公开构建保持关闭。家庭数量不收费。所有付费、正式导出和开发打印入口在候选包中关闭，免费录音保持每段 1 分钟。没有完成真实 Sandbox、购买或家庭 PDF 验收。

## 准备隔离工作目录

在 Mac 原仓库 fetch 后，以本 PR 分支建立独立 worktree（见 PR 的准确分支名）。不要对保留用户 native 修改的旧目录运行 prebuild --clean。新工作目录依赖安装需要执行 postinstall 原生补丁。

从新的 apps/ios 执行：

```bash
npm ci
npm run check-env
read -r -p '输入大于 App Store Connect 已上传编号的新 build number：' LAMPY_BUILD_NUMBER
export LAMPY_BUILD_NUMBER
export LAMPY_ARCHIVE_OUT="$HOME/WeChatProjects/lampy-testflight-preview-artifacts/$LAMPY_BUILD_NUMBER"
bash scripts/release-archive.sh --family-internal --prepare
open ios/Lampy.xcworkspace
```

内部 profile 会清除继承的付费／导出变量，开启家庭和家庭册预览入口，写入生成项目的 ios/.xcode.env.local，禁用 dotenv。内部编译 API 固定为 https://family-test.yunpura.com；账号由操作人员预置，不开放注册。新 build number 由操作者确认，测试夹具里的 8/99 不是发布编号。依赖安装、prebuild、Pods 和 Xcode 构建错误必须解决后才能继续，不能把已有模拟器成功视为 Release 构建成功。

若 ios/ 已存在，脚本会拒绝清理。保留旧目录，或在这个可重建的隔离 worktree 中确认备份后使用脚本提供的 LAMPY_ALLOW_PREBUILD_CLEAN=1；不要在原开发目录启用此选项。

## 真机 Release 安装和无 Metro 验证

1. Xcode 选 Lampy Scheme → Edit Scheme → Run → Build Configuration 设 Release；StoreKit Configuration 选 None。选已连接并配对、启用开发者模式的真实 iPhone，确认 Team 与 Bundle ID 为 B283NY984J / app.lampy.ios。
2. 在所有 Metro 终端 Ctrl+C 停止 Metro，再在 Xcode ⌘R 安装并启动。首次编译需要时间；本片不声称云端已完成 Mac 归档或真机安装。
3. 安装后停止 Xcode 调试，拔掉 USB，从手机桌面冷启动；杀进程后再打开。Mac 上不运行 Metro。不能出现开发服务器选择页、二维码或连接 8082 错误。
4. 在线登录既有测试账号，检查底部家庭入口、我的生活册→家里的→家庭册连续阅读、素纸／手作、纸页。普通成员只读；creator 可整理。先前模拟器验收也要在 Release 上回归。
5. 开启飞行模式，冷启动并检查个人本地记录仍可阅读、播放；家庭未缓存内容允许显示网络提示，不把家庭联网依赖当作 Metro 依赖。恢复网络后家庭可重试，不循环刷新。
6. 未购买不应出现购买、恢复购买、个人／家庭正式导出或打印验收入口；免费新录音仍为 1 分钟。退出登录、账号切换、撤回、本机保护和后台声音中断均须回归。

## 归档与检查

保持上述终端 build number，运行（已有 ios/ 时脚本会备份后重新生成）：

```bash
LAMPY_ALLOW_PREBUILD_CLEAN=1 bash scripts/release-archive.sh --family-internal
bash scripts/release-archive.sh --family-internal --inspect "$LAMPY_ARCHIVE_OUT/Lampy.xcarchive"
```

Archive 使用 generic iOS 设备 Release，不需要 Metro。检查报告没有 problems，Bundle/版本/build/签名 Team 正确，main.jsbundle 存在、内部预览 marker 正确，原生付费／统一购买标志为 false、商品 ID 空。静态检查不能证明运行时入口或无 Metro 已通过，必须完成前节真机操作。保留归档报告与构建号，不记录账号密码、token、私钥或交易内容。

## TestFlight 内部测试

真机 Release 和归档通过后，在 Xcode Organizer 选本次 archive → Distribute App → App Store Connect，按向导上传。核对版本与 build number，按实际情况完成加密合规问答。构建处理完成后在 App Store Connect → Lampy → TestFlight 分配给内部测试组；不添加外部测试、不提交公开发布。测试者只能使用预置的家庭测试账号。

内部测试者从 TestFlight 安装后重复无 Metro 冷启动、个人记录、1 分钟录音、家庭分享／阅读、双风格纸页、撤回与本机保护检查。TestFlight 包不承诺正式导出或备份恢复。此流程没有自动上传、购买或开放公开收费。

## 验收记录

| 项目 | 当前状态 |
| --- | --- |
| #118 模拟器家庭预览 | 用户已通过；iPhone 17 Pro Max / iOS 26.3.1 |
| 内部 Release 入口与关闭导出自动检查 | 见本 PR 检查结果 |
| Mac prepare / Pods / Xcode Release | 待用户执行 |
| 真机安装、无 Metro 冷启动 | 未验证 |
| Archive 静态检查 | 未验证 |
| 上传及 TestFlight 内部安装 | 未执行 |
| 真实 Sandbox / 家庭付费 PDF | 延期，保持关闭 |
