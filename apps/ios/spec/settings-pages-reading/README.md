# 设置首页与子页

独立分支 `ios/settings-pages-reading`。基线先按当时 `origin/main` 开出，合并前再核远端，不把某一 SHA 当成永远不变的基线。#53 已关闭，未合并、未复制其分支。

只改 `apps/ios`。不改个人 Moment、媒体、Keychain 会话、本机保护认证逻辑、回看、播放器或数据库结构。家庭入口继续关闭。`identityLoopAccepted` 不变。本 PR 保持 OPEN，不自动合并，不上传 TestFlight。

走查：[`WALK.md`](./WALK.md)。

---

## 1. 页面结构

| 路由 | 标题 | 返回 |
| --- | --- | --- |
| `/account` | 本机设置 | 可见「最近」，`dismissTo('/')` |
| `/account/storage` | 记录与存储 | 可见「本机设置」，`dismissTo('/account')` |
| `/account/subscribe` | 订阅与付费 | 同上 |
| `/account/help` | 使用帮助 | 同上 |
| `/account/about` | 关于 Lampy | 同上 |
| `/account/terms` | 使用条款 | 同上 |
| `/account/privacy` | 隐私政策 | 同上 |
| `/account-diagnostics` | 开发诊断（原门控） | 关则关闭页；开则原诊断。返回 `dismissTo('/account')` |

根页分组：

1. **本机**：本机保护（原开关与认证，未改逻辑）；记录与存储
2. **Lampy**：订阅与付费；使用帮助
3. **关于**：关于 Lampy（从「本机」移入，不重复）；使用条款；隐私政策
4. **开发**：仅现有门控打开时出现「开发诊断」

首页每项只有标题和短说明。详细内容在子页。不使用 emoji、自制图标、彩色营销卡或假头像。外壳仍是 `SettingsPage` / `SettingsGroup` / `SettingsLink`。

---

## 2. 文案依据

只写当前实现里对得上的事实。

| 主题 | 依据 |
| --- | --- |
| 留下 | `/leave`：输入「要留下的一句话」；「拍摄」「照片」「录音」；保存按钮「留下」；空库「留下第一条」 |
| 草稿 | 再进留下可见「上次没保存的内容已放回来。」；「放弃这份草稿」不改相册原片和已留下的记录 |
| 保存落点 | `finishLeaveToRecent` → `dismissTo('/')`，「最近」标题「刚刚留下的生活」 |
| 详情 | 「最近」点「阅读完整记录」 |
| 最近 / 回看 | 最近按 `recordedAt` 分组；回看按发生日期，不确定的不进某一天 |
| 播放 | 「播放」「暂停」「再听一次」；暂停后再播放从停下的位置继续（`resumeAtMs` / 已加载后 `play()`） |
| 本机保护 | 开关「本机保护」；「已开启 / 未开启」；说明「进入 Lampy 时使用 Face ID 或设备密码。」；认证走系统，不改此逻辑 |
| 权限 | 短提示「相机 / 相册 / 麦克风未打开，草稿还在。」；还可继续写字 |
| 存储位置 | 个人库 `expo-sqlite` 打开 `lampy.db`；媒体复制到 `documentDirectory/lampy-assets/`；不写回系统相册 |
| 同步 / 备份 | 应用未实现跨设备同步或云备份；未设置 `NSURLIsExcludedFromBackupKey` |
| 卸载 | 应用空间里的库和媒体随卸载清除是常见系统行为；重新安装不会自动找回。系统备份是否包含这些文件 **待确认** |
| 版本 | 只读 `Constants.nativeAppVersion` / `nativeBuildVersion`，不回退 `expoConfig` |
| 付费 | 无 StoreKit、无商品、无假购买操作 |
| 家庭 / AI / 测试登录 | Release 门控关闭，帮助和条款不写成可用功能 |
| 网络 | 个人记录路径不 `fetch` 家庭服务。诊断页在门控关闭时不发请求。`expo-web-browser` 已装但源码未调用 |
| 反馈 | 仓库没有已确认有效的正式邮箱或网址。`testflight-beta-1` 只要求以后填 App Store Connect，不是已接通入口 |

### 意见与反馈（仅文档预留）

本轮不在首页画空入口，不编造邮箱或网址。

日后若有**已验证**的正式渠道（例如 App Store Connect 已填写且对外公布的反馈邮箱，或应用内已接通的反馈），再以 `SettingsLink` 放入「Lampy」分组，短说明写实际渠道名称。在此之前不显示。

---

## 3. 条款与隐私：候选稿

两份文本在安装包内离线可读，不走 WebView 或远端加载。不设强制勾选，不改首次引导。

**本 PR 中的文本是候选稿，不是已完成法律审核的文本。** 用户页不出现「候选」「TODO」「已完成法律审核」。正式分发 / TestFlight 前再确认。本 PR 不上传 TestFlight。

### 待确认（不写进用户页）

| 项 | 现状 | 为何不能对用户保证 |
| --- | --- | --- |
| 运营主体、联系渠道、法律适用地区 | 仓库无已确认资料 | 不能编造 |
| 正式反馈渠道 | 无已验证邮箱 / 网址 | 不画空入口 |
| iCloud / 电脑备份是否包含 `Documents` 与 `lampy.db` | 代码未排除备份，也未实测备份还原 | 不能写「完全不进入任何备份」或「备份一定能恢复」 |
| 删除 App 后 Keychain 中的首次引导、本机保护是否仍在 | 模拟器擦除数据后引导标记仍在，见既有走查；用户删除 App 的行为未在本轮实测 | 不能对用户写钥匙串细节 |
| 安装包内每个原生依赖的网络 / 收集行为 | 主工程隐私清单曾记无收集类型、`NSPrivacyTracking=false`；Archive 里还有多份依赖清单 | 不能把隐私清单当成全量审计，也不能写「任何数据都不会上传」 |
| Expo / React Native 运行时是否有自己的网络活动 | 未逐项抓包 | 个人记录路径已核对；运行时行为待确认 |
| 商店上架所需的完整法律文本 | 主体、地区、联系方式仍缺 | 候选稿不足以作为正式分发文本 |

---

## 4. 修改文件

- `src/screens/account-screen.tsx` — 首页分组
- `src/screens/account-storage-screen.tsx` — 经核实的存储说明
- `src/screens/account-subscribe-screen.tsx` — 订阅介绍
- `src/screens/account-help-screen.tsx` — 使用帮助
- `src/screens/account-terms-screen.tsx` — 条款阅读页
- `src/screens/account-privacy-screen.tsx` — 隐私阅读页
- `src/screens/settings-help-copy.ts` / `settings-terms-copy.ts` / `settings-privacy-copy.ts`
- `src/screens/settings-rows.tsx` — 章节、更新日期、48pt 点击
- `src/screens/life-icons.tsx` — 系统符号：订阅 / 帮助 / 条款 / 隐私
- `src/app/account/subscribe.tsx` / `help.tsx` / `terms.tsx` / `privacy.tsx`
- `src/screens/account-screen.test.tsx` / `account-settings-pages.test.tsx` / `settings-copy.test.ts`
- `spec/settings-pages-reading/README.md` / `WALK.md`

未改：Moment / 媒体 / Keychain / 本机保护认证 / 回看 / 播放器 / 数据库 schema / `identityLoopAccepted` / 首次引导拦截。

---

## 5. SHA 与 PR

见 [`WALK.md`](./WALK.md)。基线、实现 SHA 和 PR head 以走查当时 `git fetch` 结果为准。
