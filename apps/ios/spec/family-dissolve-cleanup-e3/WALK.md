# E3 走查

## 自动化与隔离命令

- `tsc --noEmit` PASS；相关13 suites / 164 tests PASS，最后创建回执防护与多家庭检查3 suites / 29 tests PASS；改动源码 ESLint、node --check、git diff --check PASS。
- 最终全量：210 suites PASS / 2 failed；1174 tests PASS / 2 failed（212 suites / 1176 tests）。两个失败均为下述基线问题，不写全量PASS。
- CLI 拒绝未迁移至23的已有库，非零退出：PASS。
- 覆盖迁移23失败回滚／旧已解散时间标记；精确资格／成员禁止；邀请、移交、读权立即失效；重复解散截止不变；到期前不删除；重开数据库继续清理；跨家庭引用；DB回滚／文件删除失败；迟到上传复用不能复活；共用文件删除失败不误报其他家完成。
- application 覆盖单家缓存隔离、账号变化、迟到阅读、个人源仍在；页面覆盖确认、提交锁、失焦确认丢弃、读取失败重试、远端解散返回后清掉旧标题且不自动播。
- Linux临时目录 CLI 实演：合成 A/B 家庭、A独占声音+B共用照片；A过期解散；命令删A快照/声音，B照片和合成个人哨兵文件保留。第一次 checked=1 completed=1 removedFiles=1；第二次 checked=0。是命令／文件验证，不是模拟器或真机。
- 全量有2个基线失败：life-page.test.ts、life-album-detail-sheet.test.tsx。同依赖在本轮main tree `b798b97a43ff7435cf0c8f08024beb3cdb1eb7c7`（与4164ad1 tree相同）复跑：2 failed / 8 passed。不得写全量PASS。

## 双模拟器实页（用户报告 PASS）

运行 SHA：`81d748b82f236bde42954c42b80320253a37949b`。设备沿用 iPhone 17 Pro Max（12595415-0F6B-4B9C-9407-69D29806E801）与 Lampy-family-second（4CD31657-C2FD-40AC-AD50-B31DA3F157C1）。用户在2026-10-11报告14项全部通过；不是本轮代理亲自操作，也不记真机PASS。

| 项 | 结果 |
| --- | --- |
| 创建者入口；成员无入口；取消不改变；确认后消失与反馈 | 模拟器 PASS |
| B刷新家庭消失；旧分享拒读且声音不自动播 | 模拟器 PASS |
| 旧未用邀请拒绝；待接受转交不能继续 | 模拟器 PASS |
| 其他家庭、两边个人文字照片声音和生活册保留 | 模拟器 PASS |
| 重开不恢复；重复点按；停止8787与恢复重试 | 模拟器 PASS |
| 本机保护后台返回及认证遮挡 | 模拟器 PASS |
| 真机、中文/英文专项、短屏、横屏、iPad、系统VoiceOver | NOT VERIFIED |

本地唯一差异为 `apps/ios/app.json` 的 web.output static→single，仅用于模拟器开发服务器；没有提交进PR。Dev Client已由用户重新构建以包含ExpoImageManipulator。连接改用IPv4 LAN，避免旧Dev Client网络检查器处理IPv6链接时崩溃。API使用LAMPY_FAMILY_HISTORY_ENABLED=1；正式开关不改。

用户本机 family-cleanup.test.ts：1 suite / 10 tests PASS。这是自动化，不是实际等待30天，也不是生产调度证据。

## 合并前源码收紧

getPolicy先查家庭列表；已解散家庭不在列表中，真实结果通常是NOT_IN_FAMILY。不能把这一错误强改为FAMILY_DISSOLVED（也可能退出或被移除）。NOT_IN_FAMILY改为准确的「现在无法访问这个家庭，个人记录还在。」；明确FAMILY_DISSOLVED仍使用专用文案。真实应用路径测试验证缺席列表会隔离缓存；页面测试验证旧标题/正文清空、不自动播，不伪造解散原因。标题清空本身在原实现已成立。

生产清理调度、告警、真机仍未配置/未验证；家庭正式入口和identityLoopAccepted保持原状。保持OPEN，未合并。
