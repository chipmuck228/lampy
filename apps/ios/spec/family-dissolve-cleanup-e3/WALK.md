# E3 走查

## 自动化与隔离命令

- `tsc --noEmit` PASS；相关13 suites / 164 tests PASS，最后创建回执防护与多家庭检查3 suites / 29 tests PASS；改动源码 ESLint、node --check、git diff --check PASS。
- 最终全量：210 suites PASS / 2 failed；1174 tests PASS / 2 failed（212 suites / 1176 tests）。两个失败均为下述基线问题，不写全量PASS。
- CLI 拒绝未迁移至23的已有库，非零退出：PASS。
- 覆盖迁移23失败回滚／旧已解散时间标记；精确资格／成员禁止；邀请、移交、读权立即失效；重复解散截止不变；到期前不删除；重开数据库继续清理；跨家庭引用；DB回滚／文件删除失败；迟到上传复用不能复活；共用文件删除失败不误报其他家完成。
- application 覆盖单家缓存隔离、账号变化、迟到阅读、个人源仍在；页面覆盖确认、提交锁、失焦确认丢弃、读取失败重试、远端解散返回后清掉旧标题且不自动播。
- Linux临时目录 CLI 实演：合成 A/B 家庭、A独占声音+B共用照片；A过期解散；命令删A快照/声音，B照片和合成个人哨兵文件保留。第一次 checked=1 completed=1 removedFiles=1；第二次 checked=0。是命令／文件验证，不是模拟器或真机。
- 全量有2个基线失败：life-page.test.ts、life-album-detail-sheet.test.tsx。同依赖在本轮main tree `b798b97a43ff7435cf0c8f08024beb3cdb1eb7c7`（与4164ad1 tree相同）复跑：2 failed / 8 passed。不得写全量PASS。

## 实页（全部 NOT VERIFIED）

| 项 | 结果 |
| --- | --- |
| 创建者入口、取消／确认解散、成员无解散入口 | NOT VERIFIED |
| A解散→B刷新→家庭／旧分享／声音拒读 | NOT VERIFIED |
| 邀请、待接受移交不能继续 | NOT VERIFIED |
| 其他家庭／个人文字图片声音／生活册保留 | NOT VERIFIED |
| 断网恢复、响应不确定后的重试、重复点按 | NOT VERIFIED |
| 后台返回、认证期间家庭名与内容遮挡 | NOT VERIFIED |
| 中文／英文、短屏、横屏、iPad、系统VoiceOver | NOT VERIFIED |

本轮没有启动模拟器或真机，没有截图运行证据；此前E1/E2报告不扩展到E3。
