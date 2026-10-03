# TestFlight beta-2 · 走查

基线：`origin/main` `e1afff0af15740e6162565a1a10fbac0d7456021`（#61 普通合并）。其后 **无** 后续提交。  
分支 `ios/testflight-beta-2`。家庭入口关闭。未卸 Liuz17，未清个人库，未重置首次引导。不复用第一份 Archive。

横屏 / iPad / VoiceOver / 短屏溢出：**NOT VERIFIED**。

顺序：上传（不要选 Internal Only）→ 本人 Internal Testing 冷启动（断开 Metro）→ 九项 → 外测审核另议。本 PR 不代审核、不邀请。

## 命令

在 `apps/ios`，且 **未** `source` `release-public-env.sh`：

| 命令 | 结果 |
| --- | --- |
| 干净 checkout `npx tsc --noEmit` | 提交后填写 |
| `npx jest --ci`（全量） | 提交后填写。失败不得写成全量通过 |
| 本轮 ESLint（release 脚本、inspect、本 spec） | 提交后填写 |
| `node --test scripts/inspect-release-archive.test.cjs` | 提交后填写 |
| `git diff --check -- apps/ios` | 提交后填写 |
| `bash scripts/release-archive.sh` | 提交后填写。输出默认 `/tmp/lampy-testflight-beta-2` |
| `bash scripts/release-archive.sh --inspect …` | 提交后填写。`flags_release_pages=NOT_VERIFIED`、`runtime_metro_independent=NOT_VERIFIED` |

## Release 配置

| 项 | 期望 | 实际 |
| --- | --- | --- |
| Bundle ID | `app.lampy.ios` | 构建后填 |
| Team | `B283NY984J` | 构建后填 |
| Version / Build | `0.1.0` / `2` | `app.json` 已写成 2。**Connect 未读取**，上传前须人工确认 2 未被占用 |
| 功能开关 · 构建环境 | 家庭 / API / 诊断 / 测试登录关闭 | stash 后报告；**不是**设备页验收 |
| 功能开关 · TestFlight 页 | 待安装 | **NOT VERIFIED** |
| 含 bundle | 有 `main.jsbundle` | 构建后填 |
| 首次引导照片 / 字体 | coffee / flowers / window + 三份 OFL 子集 | inspect 按文件名列出；缺了要写明，不靠口头 |
| 运行时不依赖 Metro | 须安装验证 | **NOT VERIFIED** |
| 个人数据 / 保护 / 引导 | 不改 store key 与完成条件 | 本分支不改业务语义 |

本机 `.env` **不是** Release 依据。

## 启动、引导、本机保护（沿用 #61，不改动画）

- Gate=`show` 时不挂 JS 品牌层；挡住第一屏的是原生 SplashScreen。
- `failed` = hide 调用失败或超时，**不是**遮挡已经消失。内容兜底完整显示；同一请求内再试一次。
- 只有最后「留下瞬间」写完成。已有记录 / 读库失败跳过三屏。
- 本机保护是 JS 遮挡，叠在共享 splash 退场之后。认证期间不得露记录。
- 三屏验收必须用独立可丢弃安装，**不能**清空 Liuz17。

## 分发 / 出口合规

不在 Info.plist 预写 `ITSAppUsesNonExemptEncryption`。按真实能力回答 Connect 当时问卷：

- 记录明文在本机 SQLite 与文件，没有应用层 AES 封装。
- `expo-secure-store` 把引导完成、本机保护开关交给系统 Keychain。
- 本包不连家庭 API。系统栈仍可能带 TLS。
- `@noble/hashes` 用在家庭服务端与测试，不在个人留下 / 最近 / 回看路径。

不要为了少点一下就填「不含非豁免加密」。

## Archive 记录

| 项 | 值 |
| --- | --- |
| 基线 SHA | `e1afff0af15740e6162565a1a10fbac0d7456021` |
| 构建 / 打包 SHA | 打 Archive 时填写；同时记 dirty |
| version / build | `0.1.0` / `2`（Connect 占用情况 **未确认**） |
| Xcode | 构建后填 |
| Bundle ID / Team | 构建后填 |
| Archive 路径 | `/tmp/lampy-testflight-beta-2/Lampy.xcarchive`（默认） |
| 上传 | **待人工上传**。本会话无 Connect 凭据 |
| inspect | 只证明对应包属性，不能代替安装 |

`expo-dev-client` 仍在 plugin 里。测试员若仍看到开发启动器，这一包不能当外测。

## TestFlight 安装后（须本人装包，断开 Metro，冷启动）

不能用 Dev Client / 模拟器 / Jest / inspect 代替。Liuz17 可覆盖安装，事先知情：不要卸、不要清库。三屏走独立可丢弃安装。

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 无 Dev Client、Downloading、开发服务器或诊断入口 | **NOT VERIFIED** |
| 2 | 已有用户不出现三屏，记录与媒体可读取 | **NOT VERIFIED** |
| 3 | 留下文字＋照片＋录音＋感受，保存完整 | **NOT VERIFIED** |
| 4 | 最近播放、暂停、续播、展开、详情返回 | **NOT VERIFIED** |
| 5 | 回看目录、换日、连续阅读、分页、详情返回 | **NOT VERIFIED** |
| 6 | 浮动留下滚动显隐；目录展开时完全隐藏且不可点 | **NOT VERIFIED** |
| 7 | 本机保护开启后后台返回、冷启动全程遮挡；关闭后不再认证 | **NOT VERIFIED** |
| 8 | 设置及离线条款 / 隐私可读，版本 / build 正确 | **NOT VERIFIED** |
| 9 | 独立可丢弃安装：冷启动淡入、继续、上一屏、上滑、Reduce Motion、最后完成且不重播 | **NOT VERIFIED** |

## 仍 NOT VERIFIED

短屏溢出、横屏、iPad、VoiceOver。真机三屏不得用清空 Liuz17 代替。

## 版本

| 项 | 值 |
| --- | --- |
| 开分支时 `origin/main` | `e1afff0af15740e6162565a1a10fbac0d7456021` |
| #61 之后 main | 无后续提交 |
| 实现 SHA | 推送后以 GitHub 为准 |
| PR | 创建后填写（保持 OPEN） |
