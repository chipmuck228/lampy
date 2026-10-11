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

## 设备（全部 NOT VERIFIED）

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
