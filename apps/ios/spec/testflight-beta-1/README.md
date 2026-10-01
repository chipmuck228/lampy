# TestFlight beta-1 · 个人 MVP 预发布准备

独立分支 `ios/testflight-beta-1`，从 `origin/main` `b79174b346b02cb072f526af7e3ca33dac30473d`（#48 merge）切开。只做分发准备、构建检查和交接文档。

**本 PR 不上传、不提交审核、不邀请测试员。** 不改服务器、DNS、生产库。不入库证书、profile、`.p12`、`.p8`。

走查与 Archive 记录见 `WALK.md`。

## 打包合同

| 项 | 值 |
| --- | --- |
| 基线 / 无后续 main | `origin/main` = `b79174b` |
| Bundle ID | `app.lampy.ios` |
| Team | `B283NY984J` |
| Version | `0.1.0` |
| Build | `1`（本仓库尚未有过 TestFlight 上传；若 App Store Connect 已占用则加 1） |
| 家庭入口 | 关（`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 空） |
| 家庭 API | 关（`EXPO_PUBLIC_FAMILY_API_BASE_URL` 空） |
| 开发诊断 / 测试登录入口 | 关（Release 下 `__DEV__` 为 false，且 `EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=0`） |
| AI / 回眸 | 未实现，无入口 |
| 个人记录 | 本机 SQLite + 文件，无需注册或网络 |
| Metro / Dev Client 启动器 | Release Archive 须打进 JS；测试员不能再看到开发菜单或 Searching for development servers |

Release 环境由 `scripts/release-public-env.sh` 与入库的 `.env.production` 固定。`scripts/release-archive.sh` 会先挪走本机 `.env` / `.env.local`，再 prebuild + Archive，避免把本机调试开关打进包。不要只看本机 `.env` 推断外测包。

## 1. 在 App Store Connect 创建 App

若还没有与 `app.lampy.ios` 对应的记录：

1. 打开 [App Store Connect](https://appstoreconnect.apple.com) → My Apps → 加号 → New App。
2. 平台 iOS。名称可用 **Lampy**（以商店里仍空余的名为准）。
3. 主语言简体中文。Bundle ID 选 **app.lampy.ios**。SKU 可用 `lampy-ios`。
4. 用户访问权限按团队需要勾选。
5. Apple Developer → Identifiers：确认 `app.lampy.ios` 已开 **Sign in with Apple**。个人 MVP 不要求登录；能力留给以后家庭，不要在外测打开家庭入口。
6. 定价、隐私问卷、内容版权可以后补。**先不要点提交正式审核。**

## 2. 本机 Archive 后上传（人工）

在仓库根目录确认 SHA，再：

```bash
cd apps/ios
bash scripts/release-archive.sh
```

成功后用 Xcode → Organizer 打开 `/tmp/lampy-testflight-beta-1/Lampy.xcarchive`（或脚本打印的路径）：

1. **Distribute App**
2. **App Store Connect**
3. **Upload**（不要选 Development / Ad Hoc / Enterprise）
4. 分发选项保持默认即可；不要勾选会改签名的额外重新签名，除非证书过期。
5. 等 Processing 变为 Ready to Submit / Ready to Test。

`archive` 成功 **不能** 代替 TestFlight 安装验收。上传后须用 TestFlight 装到真机，再走 `WALK.md` 里的六项回归。

## 3. 外部测试必须走 Beta 审核

少量外部用户 **不能** 只用 Internal Testing：

- Internal Testing 只给 App Store Connect 团队成员（Users and Access 里的用户）。
- 朋友 / 少量外部用户必须建 **External Testing** 组，加入邮箱或之后开限量 Public Link。
- **第一次外测组需要 Beta App Review。** 未过审前外部测不了。
- 不要把「只走 Internal」当成这次外测的完成条件。

过审后再邀请；本 PR 不代发邀请。

## 4. 测试说明、反馈邮箱、审核说明草稿

把接收反馈的真实邮箱填进 App Store Connect（TestFlight → Test Information），并写进发给测试员的说明。不要把证书或登录口令写进说明。

### 发给测试员

Lampy 是私人生活记录。这一版只测本机个人功能。

- 用被邀请的 Apple ID 打开 TestFlight，安装 Lampy。
- **不需要注册，不需要登录，不需要网络** 就可以留下、最近、回看。
- 记录只在这台设备。没有云同步或云备份。换机不会带走记录。
- 家庭和 AI 未开放。本机设置里的「本机保护」由你自愿开启；不开启也能用。
- 横屏、iPad、VoiceOver 我们还没验完，遇到问题请记下机型和系统。
- 反馈发到 App Store Connect 里填写的邮箱，或 TestFlight 的反馈入口。

### Beta / 审核说明草稿

Lampy is a private, on-device life journal. This beta only covers the personal MVP.

- No test account is required. Personal features work without signing in and without a network connection.
- Records stay on the device. There is no cloud sync or cloud backup.
- Camera, microphone, and photo library are used only when the tester chooses to add a photo or a sound. Face ID / device passcode is used only if the tester turns on 本机保护 (device lock). That setting is optional.
- Family sharing and AI lookback are not enabled in this build.
- Sign in with Apple appears only in a developer diagnostics surface that is closed in this Release.

## 5. 下载 TestFlight 后的六项个人 MVP 回归

见 `WALK.md`「TestFlight 安装后」。Archive 成功不算这六项 PASS。

## 6. 已知边界

- 记录保存在设备上，无云同步或云备份。
- 家庭未开放。AI / 回眸未开放。
- 擦除 App 清不掉 Keychain 里的 `lampy.first-run.v1`。不要在 Liuz17 上重置引导。
- 本机保护默认关，由用户打开。

## 7. 仍未验证

横屏、iPad、VoiceOver：**NOT VERIFIED**。`supportsTablet` 仍为 true（device family 1,2），iPad 能装，但不能写 PASS。本次 prebuild 的最低系统是 **iOS 16.4**。
