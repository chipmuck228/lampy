# 阶段 3 走查

设备、模拟器、Metro、用户数据库均未操作。#101 头像墙用户测试不计为本切片 PASS。

待双模拟器 / 真机：
- [ ] A 分享后 B 阅读，显示 A 昵称；A 自己可辨认为本人。
- [ ] 修改昵称后重新进入家庭记录，显示新昵称。
- [ ] 同昵称账号分享各自记录；撤回只影响选中的本人分享。
- [ ] 未设置昵称的旧账号保留自然称呼，无邮箱显示。
- [ ] 选家庭后确认区显示当前昵称和正确家庭；切账号重新打开应更新。
- [ ] 停止 API 后资料失败可重试，不出现错误身份或自动分享。
- [ ] 原文字 / 图片 / 声音完整；播放、暂停、返回不自动播。
- [ ] 本机保护后台认证遮挡身份、家庭名、正文。
- [ ] 中英文、长昵称与家庭名、短屏 / 横屏 / iPad、系统 VoiceOver。

全部实页 NOT VERIFIED。

实际检查：tsc、改动 TS/TSX eslint、git diff --check PASS。相关 Jest 6 suites / 80 tests PASS。全量 217 suites / 1219 tests：215 suites / 1217 tests PASS，2 suites / 2 tests FAIL（life-page.test.ts、life-album-detail-sheet.test.tsx，与阶段 1/2 已记录基线相同）。未称全量 PASS。英文占位符初跑发现问题已修正，新增中英插值覆盖；最终全量没有该失败。
