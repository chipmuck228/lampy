# 阶段 3 走查

## 用户双模拟器验收 · 2026-10-11

运行 SHA：2690e0869b579ea6e177508618d42daf2068841a。用户报告以下 11 项均为模拟器 PASS；未扩大为真机结果。模拟器型号与系统版本本轮未重新报告。

| 操作 | 结果 |
| --- | --- |
| A 分享，B 查看 A 昵称 | 模拟器 PASS |
| A 查看本人分享，显示你与昵称 | 模拟器 PASS |
| 改昵称后重新进入显示新昵称 | 模拟器 PASS |
| 同昵称作者独立，只能撤回本人分享 | 模拟器 PASS |
| 旧账号自然称呼，不显示邮箱 | 模拟器 PASS |
| 确认区显示当前身份与正确家庭 | 模拟器 PASS |
| 切账号不沿用旧身份或目标 | 模拟器 PASS |
| 停止 API 后失败与恢复重试，不自动分享 | 模拟器 PASS |
| 文字、照片、声音与暂停续播，返回不自动播放 | 模拟器 PASS |
| 后台认证遮挡昵称、家庭名与正文 | 模拟器 PASS |
| 中文英文、长昵称与家庭名，可换行且按钮可达 | 模拟器 PASS |

用户报告工作区仅 M apps/ios/app.json；本轮未重贴 diff，不将本机修改纳入 PR。代理未操作用户设备、Metro 或个人数据库。此记录只改走查文档，运行代码不变。

真机、短屏、横屏、iPad、系统 VoiceOver：NOT VERIFIED。

## 自动化

实际检查：tsc、改动 TS/TSX eslint、git diff --check PASS。相关 Jest 6 suites / 80 tests PASS。全量 217 suites / 1219 tests：215 suites / 1217 tests PASS，2 suites / 2 tests FAIL（life-page.test.ts、life-album-detail-sheet.test.tsx，与阶段 1/2 已记录基线相同）。未称全量 PASS。英文占位符初跑发现问题已修正，新增中英插值覆盖；最终全量没有该失败。
