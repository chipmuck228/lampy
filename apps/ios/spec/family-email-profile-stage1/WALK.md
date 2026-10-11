# 第一阶段走查

## 运行边界

仅代码/自动化/回环HTTP；未启动用户Mac模拟器或Liuz17，未操作已有隔离数据库，未做原生构建/Release包/TestFlight。

## 首次交付时待实页（历史状态；最新结果见下方用户验收）

- 服务端/客户端默认关闭，不暴露注册；开启明确双开关可见。
- A邮箱创建+昵称→即登录；退出再登录；重开保持会话和昵称。
- B不同邮箱同昵称不串号；A单设备退出不使其他设备退出。
- 昵称修改、失败重试、缺省头像；邮箱不展示给其他成员。
- 邀请输入→创建/登录→返回仍保留→明确确认加入；取消/过期/替换不自动加入。
- 未填/重复邮箱/密码错误/断网/后台途中/快速返回，无重复注册和迟到登录。
- 保护开启时认证遮挡，草稿/个人原文/声音/生活册不改。
- 中文/英文、键盘可滚/返回、短屏/横屏/iPad、系统VoiceOver。

自动化结果在实现收尾记录，不能把页面测试或AX属性称为模拟器/真机PASS。

## 实施收尾检查

基线：origin/main `13526b2690f05adcb3c5269aa163b78088178463`，发布前再次核对未前移。

- `npx tsc --noEmit`：PASS。
- 针对性 Jest：9 suites / 92 tests PASS（API、真实回环HTTP、身份世代、本人资料、邀请登录返回、Release关闭态）。
- 全量 Jest：214 suites / 1207 tests PASS；2 suites / 2 tests FAIL，总216 suites / 1209 tests。失败为 `life-page.test.ts` 与 `life-album-detail-sheet.test.tsx`，相同依赖在独立基线13526b2重现相同两项失败（2 failed / 8 passed），不称全量PASS。
- 改动源文件eslint：0 errors；listen.ts另用`--no-ignore`检查通过。
- `bash -n scripts/release-public-env.sh`、`git diff --check`：PASS。

首次交付时本代理未运行模拟器／真机。迁移26和门控仅在临时SQLite／HTTP测试里验证，不代表用户隔离API已迁移。没有新增原生依赖，没有上传或覆盖TestFlight；首次交付保持OPEN，不开始成员头像墙。

## 用户双模拟器验收（2026-10-11）

运行SHA：`1b738df2a2f20160c129566f2310d4a38357bf84`。用户核对仅有本地`app.json`中`web.output: static → single`差异；该Web测试配置不收入PR。

用户报告以下10项双模拟器PASS：创建即登录；退出再登录；昵称保存重开；不同邮箱同昵称不串；重复账号与错误密码；邀请登录返回且明确确认加入；返回/后台不迟到登录且清空密码；停API与恢复重试；保护认证遮挡；中文/英文与键盘滚动返回。

环境：沿用 iPhone 17 Pro Max（12595415…，iOS26.3）与Lampy-family-second（4CD31657…，iOS26.5）的模拟器测试。设备类型沿用此前报告，未由本机重新核实。不是双真机PASS；短屏、横屏、iPad、系统VoiceOver仍NOT VERIFIED。此前IPv6 Dev Client网络检查器崩溃不作为账号功能失败，测试改用IPv4 Metro。
