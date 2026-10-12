# Apple 登录／关联走查

## 已实际运行

Linux Node 24，自动化测量与测试不是原生授权成功证据。
- `npx tsc --noEmit`：PASS。
- 相关 Jest（family-api、Apple application flow、family-use-cases、登录／设置页、HTTP client、原生 Apple adapter）：29 suites / 242 tests PASS；后续追加的 inactive／background 页面测试亦在最终全量运行中 PASS。
- 最终 `TZ=Asia/Shanghai npx jest --runInBand`：222 suites，220 PASS / 2 FAIL；1264 tests PASS / 2 FAIL。不能写成全量 PASS。
- 两个全量失败：`life-page.test.ts` 仍期待旧两／三项底带；`life-album-detail-sheet.test.tsx` 仍期待旧选册 accessibility label。在干净 main `9c1887e`、相同 Node／时区下复现（3 suites 中 2 FAIL / 1 PASS），本片没有修改这两个实现／测试。
- 初次 UTC 运行的生活册日期失败在 Asia/Shanghai 下通过，属于既有测试时区依赖。
- 改动 TypeScript lint、`git diff --check` 在提交前运行，结果记录 PR 描述。
- 未运行 Xcode、原生模拟器、真机或 TestFlight；未修改服务器。

## 原始设备清单（以下方 Build 8 验收记录为准）

在 Mac 从本 PR 构建 family-internal Release，配合迁移 29 且显式开启 Apple 的隔离公网 API；记录设备、iOS、包版本／Build、实现 SHA、服务端 SHA。不要用 Build 7 或 Metro Refresh 代替新版本验收。

1. 未登录 → Apple 继续 → 明确授权：首次登录可读资料、创建家庭；退出再 Apple 登录回同一账号。
2. 原受控账号 → 设置我的资料 → 关联：先取消不变，再确认；昵称、家庭、角色不变。退出后 Apple 登录回原 userId。
3. Apple 已关联其他账号：显示冲突，两个账号家庭与资料不合并；不能替换当前已有 Apple 身份。
4. Hide My Email、不提供邮箱／昵称：登录正常；昵称由我的资料设置，不拿邮箱显示成员名。
5. 邀请 → 登录 Apple → 返回：输入、邀请保留，仍需确认加入；取消原生授权仍能邮箱登录。
6. 授权期间切后台、退出页面；网络等待期间返回或换账号：无迟到登录／导航，不影响另一个提交锁。已有提交可能已在服务器成功，重新读取确认状态。
7. 本机保护开启：原生授权暂时 inactive 与真正后台分别检查；账号、昵称、家庭、记录始终遮挡，解锁后才能继续；不修改保护规则。
8. API 停止／恢复、nonce 过期：轻量错误，可重新授权；无空库假象、无重复账号。
9. 中文／英文、键盘、长昵称、短屏与横屏：官方按钮至少 48pt，操作可达；VoiceOver 真正能读到登录与关联入口。
10. 原邮箱登录、昵称、退出／换账号、家庭邀请／分享／声音、本机个人记录与生活册无回归。

## 已知基线测试

全量首次运行 220 suites：5 失败。两项为 migration 最新版本断言（28→29），已同步修改。另三项涉及本机日期时区及既有导航／生活册标签断言；在干净 main `9c1887e` 同样复核后再记录，不能记全量 PASS。

## 2026-10-12：TestFlight Build 8 真机验收（用户报告）

- 设备：iPhone 17 Pro；iOS 26.2。
- 安装：TestFlight 下载，Version 0.1.0 / Build 8；family-internal。
- Archive 报告：git_sha=afdf8175b28d842d26d32d19fdb4b5d2faebc48c，git_dirty=no。
- 隔离服务器 DEPLOYED_GIT_SHA：同为 afdf8175b28d842d26d32d19fdb4b5d2faebc48c。
- 数据库：version 29。
- 公网 health（用户实测 HTTP 成功）：appleLogin=true、controlledEmailAccounts=true、publicTestLogin=true、emailRegistration=false、testAccountLogin=false、familyHistoryV2=true。
- 后续只改本文记录的提交不是设备运行 SHA；本轮无新原生包、无服务器更新。

| 项目 | 结论 |
| --- | --- |
| 停止 Metro，从桌面冷启动新包 | PASS |
| 邮箱登录 A2，资料、原昵称和家庭保留 | PASS |
| 关联 Apple 先取消，不改变状态 | PASS |
| 明确确认关联，账号、昵称和家庭保留 | PASS |
| 退出后用 Apple 登录回原 A2，不新建账号 | PASS |
| B 尝试关联同一 Apple，冲突且不合并 | PASS |
| 邀请进入 Apple 登录，返回后仍需确认加入 | PASS |
| 授权期间后台或离开，无迟到登录／跳转 | PASS |
| 本机保护开启，授权及后台返回遮挡，解锁后继续 | PASS |
| 分享、声音、个人记录和生活册完整，声音不自动恢复 | PASS |

上述全部为用户报告的真机 PASS，已定位构建与部署 SHA，不是本助手重新操作设备的结论。首次未关联 Apple 身份创建新账号、系统 VoiceOver、短屏／横屏、30 秒等待超时恢复等未包含在这份验收中，仍 NOT VERIFIED。

## 2026-10-12：合并前源码复审

审阅实现 head：afdf8175b28d842d26d32d19fdb4b5d2faebc48c。base main：9c1887eb5e7aee5e0278f62577761414afce961f。GitHub 查询为 OPEN、MERGEABLE / CLEAN；这不等于可以忽略源码问题。

复核一次性 nonce、关联会话前后资格、身份冲突不合并、迟到登录会话撤销与本机保护前台条件；未发现这些所读路径的新阻塞。但发现以下合并阻塞：

- Bugbot 评论 https://github.com/chipmuck228/lampy/pull/108#discussion_r4242104199 已报告 Apple 等待超时保留 busy。
- family-email-account-screen.tsx 中，原生授权后的 30 秒 active／解锁等待超时会清 nativeApple 并丢弃 token；由于 current(seq) 为 false，catch 不显示反馈、finally 不 setBusy(false)。随后 load() 也不清 busy，解锁／重新读取后入口仍可能禁用。
- Build 8 十项正常路径 PASS 不覆盖这项超时路径。须修复请求自身的 busy 收尾，避免 A 迟到清掉 B 的提交锁，并补超时后恢复重试／不提交旧 token 的测试，才建议合并。

检查边界：上方 tsc、Jest、lint 与 diff 的 PASS／既有失败是 afdf817 实现时实际运行的记录。此轮执行环境 shell 不可用，未重新运行命令；不能把历史记录称为本轮新检查通过。本次仅 GitHub 源码与审阅／head 核对，文档修改未运行代码。

当前结论：保持 OPEN，不合并；上述超时问题修复并检查后再次核对。

## 2026-10-12：Apple 等待超时修复（待 Release 真机复测）

在 #108 原分支修复上述 busy 阻塞，仅改登录／资料页面、英文提示和页面测试，未改服务器、迁移、门控或本机保护规则。

- 30 秒等待超时不返回原 native token，不发起完成登录／关联请求。
- Apple finally 只在 owner 属于本请求时释放锁；释放不再要求 App 已解锁。离开页面不更新 UI，A 迟到不能解除 B 的提交锁。
- 解锁后的合格读取在无新提交时复位 busy，并保留一次「Apple授权等待已结束，请重新试一次。」提示。取消、后台、失焦和新的主动操作清掉旧提示。
- 用户必须重新点 Apple 并重新授权，不能自动复用旧 token。

实际运行（Linux Node 24.19）：
- 新增普通超时、保护开启时超时两则页面测试，在修复前源码上均 FAIL（预期）；修复后 PASS。
- 页面 Jest：18 / 18 PASS，包含 A 迟到不能清 B 锁。
- 相关 Jest：29 suites / 246 tests PASS。
- npx tsc --noEmit：PASS。
- 改动页面／测试 eslint：PASS；git diff --check：PASS。
- 未重跑全量；此前两个已复现的基线失败继续保留，不宣称全量 PASS。
- 修复实页：Xcode Release / 真机 NOT VERIFIED；Build 8 的十项 PASS 仍只对应 afdf817。服务器仍按用户报告为 afdf817、DB 29，无须为页面修复重新部署。

### Xcode Release 专项走查

从修复 head 拉取新代码，使用仓库 release-archive.sh --family-internal --prepare 配置原生工程；Xcode Scheme Lampy 的 Run 改为 Release，再安装到 iPhone 17 Pro。记录构建 SHA 与版本／Build，不卸载或清除原记录。

1. 开启本机保护，在 Apple 登录时先完成 Apple 系统授权；回到 Lampy 后取消或暂不完成 Lampy 的保护认证，停留至少 35 秒，再手动解锁。应出现等待结束提示，按钮可点，不能自动登录。
2. 再次点 Apple 并授权，正常登录回已关联的 A2，原家庭／昵称保留；邮箱登录也可正常操作。
3. 若能安排未关联账号，资料页关联同样检查等待超时→解锁→明确重试。当前同一 Apple 已属于 A2 时，B 重试应显示身份冲突，不应一直忙碌，也不应合并。
4. 抽查正常 Apple 登录、取消、后台返回和本机保护遮挡，无回归。

注意：30 秒等待从 Apple 原生授权返回 token 后开始，停留在 Apple 系统授权面板上 35 秒不等于此路径。切到后台会直接作废请求，也不等于此超时。若设备无法复现等待，保留专项实页 NOT VERIFIED。

合并状态：源码修复与针对性自动化通过；保持 OPEN，待 Release 专项结果与新 head 审阅。未自动合并、未上传新 TestFlight。
