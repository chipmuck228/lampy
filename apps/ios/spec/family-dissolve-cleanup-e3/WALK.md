# E3 走查

## 自动化与隔离命令

- `tsc --noEmit` PASS；相关13 suites / 164 tests PASS，最后创建回执防护与多家庭检查3 suites / 29 tests PASS；改动源码 ESLint、node --check、git diff --check PASS。
- 最终全量：210 suites PASS / 2 failed；1174 tests PASS / 2 failed（212 suites / 1176 tests）。两个失败均为下述基线问题，不写全量PASS。
- CLI 拒绝未迁移至23的已有库，非零退出：PASS。
- 覆盖迁移23失败回滚／旧已解散时间标记；精确资格／成员禁止；邀请、移交、读权立即失效；重复解散截止不变；到期前不删除；重开数据库继续清理；跨家庭引用；DB回滚／文件删除失败；迟到上传复用不能复活；共用文件删除失败不误报其他家完成。
- application 覆盖单家缓存隔离、账号变化、迟到阅读、个人源仍在；页面覆盖确认、提交锁、失焦确认丢弃、读取失败重试、远端解散返回后清掉旧标题且不自动播。
- Linux临时目录 CLI 实演：合成 A/B 家庭、A独占声音+B共用照片；A过期解散；命令删A快照/声音，B照片和合成个人哨兵文件保留。第一次 checked=1 completed=1 removedFiles=1；第二次 checked=0。是命令／文件验证，不是模拟器或真机。
- 全量有2个基线失败：life-page.test.ts、life-album-detail-sheet.test.tsx。同依赖在本轮main tree `b798b97a43ff7435cf0c8f08024beb3cdb1eb7c7`（与4164ad1 tree相同）复跑：2 failed / 8 passed。不得写全量PASS。

## 先前版本双模拟器实页（用户报告 PASS）

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

## 2026-10-11 提示复测与收口

用户在拉取 c500014 的步骤之后报告模拟器复测PASS：B在A解散后返回/刷新家庭记录，新不可访问提示正常。此轮没有另贴git输出，因此记为用户报告PASS、目标实现c500014，运行SHA未独立再次核对；不扩写为真机PASS。原14项完整走查仍对应81d748b。

c500014：tsc PASS；本轮应用/页面/清理3 suites / 53 tests PASS；相关ESLint、node --check、git diff --check PASS。GitHub Bugbot已完成SUCCESS、没有新增问题。main仍为4164ad1；本轮只补走查不改运行代码。两个全量基线失败保留原记录，不声称全量PASS。生产调度/告警、真机及系统VO仍未完成。

## 最新调整：目录历史状态（实页 NOT VERIFIED）

此前81d748b/c500014的模拟器PASS不覆盖新状态呈现，尤其「解散/离开后消失」已被新契约替代。当前需重新测试：A解散后两边保留灰墨只读条目和个人记录说明；B主动离开保留已离开；新邀请加入同ID恢复；同名新ID不复活旧条目；被移除有准确状态；历史不占10家名额；旧分享/声音持续拒读；换账号不串；杀进程/API重开仍在；实际清理后最小目录仍在。迁移24后再启隔离API，无新增原生模块。最新模拟器/真机/VO/短屏均NOT VERIFIED。

30天清理现在明确保留每个原成员的最小目录信息；SQL文件测试验证成员/分享被清理但目录仍在。已被旧清理删除的历史不可自动找回。

最新自动化：tsc、相关Jest 15 suites / 182 tests、改动源ESLint、node --check、git diff --check PASS。全量为210 suites PASS / 2 FAIL、1184 tests PASS / 2 FAIL；life-page.test.ts与life-album-detail-sheet.test.tsx为此前已同依赖对照main复现的基线失败，不记全量PASS。新增目录状态仍未做实页走查。
