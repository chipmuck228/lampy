# TestFlight beta-2 · 第二份预发布准备

独立分支 `ios/testflight-beta-2`，从核对后的 `origin/main` `e1afff0af15740e6162565a1a10fbac0d7456021`（#61 普通合并）切开。#61 之后 main **没有**后续提交。

不复用 `ios/testflight-beta-1`，不复用 `/tmp/lampy-testflight-beta-1`。只做分发配置、构建检查和交接文档。不改生活册 / 家庭 / AI / UI。

本 PR **保持 OPEN**。不自动合并。不提交外部 Beta 审核，不邀请测试员。未卸 Liuz17，未清个人库，未重置首次引导。

走查与 Archive 记录见 [`WALK.md`](./WALK.md)。

## 打包合同

| 项 | 值 |
| --- | --- |
| 基线 | `origin/main` = `e1afff0af15740e6162565a1a10fbac0d7456021`（含 #61，无后续） |
| 打包 SHA | `05c7236215deee5018f502f0eb2b6797f50f759a`（dirty=no）。`/tmp/lampy-testflight-beta-2/Lampy.xcarchive` |
| Bundle ID | `app.lampy.ios` |
| Team | `B283NY984J` |
| Version | `0.1.0`（营销版本不改） |
| Build | `2`（仓库里上一份 Archive 是 `1`。**App Store Connect 本轮未能读取**，不能写成「Connect 已确认 2 空闲」。上传前须在 Connect 核对 2 未被占用；若已被占，加 1 再打） |
| 家庭入口 | 关 |
| 家庭 API / 测试登录 / 账户诊断 | 关 |
| AI / 回眸 / 开发探针 | 无入口 |
| 个人记录 | 本机 SQLite + 文件 |
| 首次引导 / 本机保护 / 启动交接 | 沿用 #61：只有「留下瞬间」写完成；`failed` ≠ 原生遮挡已消失；共享 overlay 成功路径只 hide 一次 |

Release 环境由 `scripts/release-public-env.sh` 与入库 `.env.production` 固定。`release-archive.sh` 会 stash 本机 `.env*`。不要用本机 `.env` 推断外测包。不要在开发 shell 里 `source` 该 env 脚本。

`ios/` 未入库。本地已有 `apps/ios/ios` 时脚本拒绝 `prebuild --clean`，除非 `LAMPY_ALLOW_PREBUILD_CLEAN=1`（先备份）。本工作树切开时 **没有** `ios/`。证书、Provisioning Profile、`ios/` 不提交。

`release-archive.sh --inspect` 只核包元数据、`main.jsbundle`、少量字符串，并列出能按文件名找到的首次引导照片 / 字体。**不是**页面功能开关或安装验收。`runtime_metro_independent=NOT_VERIFIED`。

## 1. 上传（人工 Organizer）

当前会话 **没有** 已登录的 App Store Connect 上传能力（无 API key / altool 凭据）。**待人工上传**，不得写成已经上传。

```bash
cd apps/ios
# 不要 source release-public-env.sh
bash scripts/release-archive.sh
```

脚本把 Archive 写在 `/tmp`，Organizer 不一定自动列出。先打开该包再分发：

```bash
open /tmp/lampy-testflight-beta-2/Lampy.xcarchive
```

Xcode → Organizer 选中 **本次** Archive（version `0.1.0`，build `2`）：

1. **Distribute App**
2. **App Store Connect**
3. **Upload**
4. 不要选 Development / Ad Hoc / Enterprise
5. **不要选 TestFlight Internal Only**（同一构建还要给外测）
6. 核对 version / build 后再送

本地 Archive 签名是 Development。上传时 Organizer 再签 App Store Connect。

**顺序：** 上传 → 本人 Internal Testing 安装 → 走完 `WALK.md` 九项 → 再安排外测审核。本 PR 不代提交审核、不代邀请。

## 2. 覆盖安装说明（Liuz17）

TestFlight 更新会盖在现有 Lampy 上：

- **不要卸装、不要清库、不要重置引导** 来制造首次使用。
- 已有记录、媒体、本机保护开关、首次完成标记应保留（Keychain 的 `lampy.first-run.v1` 卸装也清不掉）。
- 三屏必须用 **独立可丢弃安装**（另一台设备或可抹掉的模拟器 / 另一 Apple ID 设备），不能清空 Liuz17。

## 3. 发给测试员（外测通过后再发）

Lampy 是私人生活记录。这一版只测本机个人功能，并含首次三屏。

- 用被邀请的 Apple ID 打开 TestFlight，安装 Lampy。
- 不需要注册、登录或网络就可以留下、最近、回看。
- 记录只在这台设备。没有云同步或云备份。
- 家庭和 AI 未开放。「本机保护」自愿开启。
- 短屏溢出、横屏、iPad、VoiceOver 还没验完。
- 反馈走 TestFlight 或 Connect 里填写的邮箱。不要把证书或口令写进说明。

## 4. 仍未验证（本 PR 不补）

短屏正文溢出、横屏、iPad、VoiceOver：**NOT VERIFIED**。TestFlight 安装验收不能由模拟器、Jest 或 Archive inspect 代替。
