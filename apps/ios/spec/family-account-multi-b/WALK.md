# 阶段 B 检查记录

环境：Linux / Node 24.19.0；隔离工作区从 #92 merge 8d759d0 开出。依赖 npm ci --ignore-scripts；没有运行原生构建、没有碰 Liuz17 或生产。

## 源码与隔离测试

- TypeScript：npx tsc --noEmit，PASS。
- 改动 TS/TSX ESLint：PASS，无新 error。
- git diff --check：PASS。
- 新测试：真实 SQLite 16→19 保留旧 ID/角色；migration 18 写入失败回滚；跨连接第 10 个名额；幂等与重开；双会话/单设备退出；同名邮箱不合并；v1 歧义拒绝；HTTP 认证/名称；账号迟到读取/401；稳定创建 key；取消前不发送；列表与锁定门控。
- 全量 Jest：TZ=Asia/Shanghai npx jest --ci --runInBand，196 suites：194 passed / 2 failed；1035 tests：1033 passed / 2 failed。未称全量 PASS。
- 最后失焦清空视图修补后，页面与 application 资格测试 2 suites / 8 tests PASS；tsc 与改动文件 eslint 再核 PASS。此前全量与该修补分别记录。
- 新增测试共 15 项；包括跨连接 SQLite、迁移回滚、目录状态和页面门控。
- 实现 SHA 以独立 PR head 为准；设备运行 SHA 见下方用户模拟器走查。

## 基线对照

同依赖版本、TZ=Asia/Shanghai、--ci --runInBand；干净 checkout 8d759d0 和实现工作区都出现：

1. life-page.test.ts / picks a band layout from available width and painted label size：旧断言预期最近/回看，现基线已有生活册第三项。
2. life-album-detail-sheet.test.tsx / opens the collect sheet and cancels without changing the detail：测试点按后弹层未出现。

两者相关源码未改。不是仅凭“文件未改”认定基线；已经隔离复跑。另有原测试 overlapping act 日志，未声称全库零警告。

首轮 UTC 下生活册日期断言跨到 9 月 30 日；按产品测试时区 Asia/Shanghai 跑为 10 月 1 日且通过。旧单会话断言随本轮明确策略改成双会话；保存失败事务测试仍验证旧会话不丢。

## 验收边界

此前模拟器/真机 UI、双设备、公网、VoiceOver、本机保护实页未验；新增模拟器用户报告仅覆盖下方明确路径。
生产服务版本/迁移：NOT VERIFIED（未访问主机）。家庭入口关闭、identityLoopAccepted 未动；未开始 C–F、注册、账号删除或付费。不得据本轮测试开启家庭。

## 2026-10-08 用户模拟器走查

用户报告运行 checkout：`42781c235379febabb9012536109a35e0602c9d5`。`git status --short` 为 `M app.json`、`M metro.config.js`；因此不是干净 tree 的设备验收。此前按测试指导增加 wasm assetExts、将 web.output 改为 single；最终 diff 未取得，不声称已核对修改全文。Metro 测试入口/API/诊断通过启动环境变量开启，最后使用端口 8087。模拟器具体型号、iOS 版本和原生构建身份未提供。

以下为模拟器 PASS（用户实测报告，非助手直接操作）：
- 受控账号登录、创建 TestFamily；再创建一家，两家同时显示并能点选。
- 杀进程重开：会话与两家仍在。
- A 退出切 B、B 创建再切 A：家庭数据不串。
- 隔离 API 停止后刷新显示失败/重试，不伪装为空；重启后恢复。
- 本机保护开启后后台返回、认证期间家庭名称和列表遮挡。

同账号双设备登录/单设备退出、10 家庭上限实页、真机、VoiceOver仍 NOT VERIFIED。公网与生产未验收，家庭发布入口仍关闭，PR 保持 OPEN。上述结果不改写此前自动化或生产验收边界。

## 家庭上限与封面墙调整

用户补报：先前模拟器运行 checkout 42781c2 的 10 家庭上限实页 PASS；不扩展为本轮新 UI PASS。

本轮仅页面/i18n/页面测试：显示合计容量与满额解释；创建按钮独立，点击才展开命名区域；封面墙复用 albumCoverWallLayout、AlbumCoverFace 的无图纸色回退、系统 family 图标。服务没有家庭封面字段，不读私人照片、不虚构家庭照片。卡片显示真实名称、角色、成员数、选中状态；所有名称在卡片下完整折行。创建意图与幂等/请求资格逻辑保留，入口增加同上限校验。

检查：相关 Jest 4 suites / 19 tests PASS；TypeScript、改动文件 eslint、diff --check PASS（最终核对后提交）。没有重跑全量，之前两项基线失败记录保留。

新布局、长家庭名、中英、横屏/短屏、真实 VoiceOver：NOT VERIFIED。先前用户实测路径不重写成本轮 UI 已验收。PR 保持 OPEN，未部署或上传 TestFlight。

## 中英文计数与未登录页修正

用户截图反馈上一版英文容量出现 `{0}`、未登录被画为失败。本轮英文占位符改为 i18next 双括号，并加中英文真实 tr 插值测试。页面容量改为「我的家庭」与 `N / 10` 小标签，仅一行容量说明；满额说明保留且按钮确实禁用。

UNAUTHENTICATED 在目录状态中单独归为 signed-out，清除列表与选中值；页面不再显示读取失败/重试，而是系统家庭图标、生活化标题、简短说明与「登录家庭」。入口走现有受控诊断登录页，未新增正式注册或放开 Release 诊断。网络故障仍独立显示连接失败/重试，不伪装为空或未登录。

相关 Jest 4 suites /21 tests PASS；tsc、改动文件 lint、diff --check PASS。本轮新视觉、英文/中文实页、认证往返 NOT VERIFIED。未重跑全量，不扩大旧设备 PASS；仍 OPEN。
