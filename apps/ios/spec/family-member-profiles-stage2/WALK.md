# 第二阶段走查

基线main：`8bb6bfbd0cbec1b48b836288da8695ebefb64a4e`（#100普通合并）。第一阶段用户双模拟器PASS对应运行代码`1b738df2a2f20160c129566f2310d4a38357bf84`；不扩到本阶段头像墙。

## 本轮检查

- TypeScript：PASS。
- 针对性Jest：5 suites / 57 tests PASS。含SQLite重开、同昵称精确membership、自己资料刷新、失效成员鉴权、转交/移除及家庭切换迟到确认。
- 改动源文件eslint：PASS，0 errors / 0 warnings。
- git diff --check：PASS。
- 本轮全量Jest：215 suites / 1210 tests PASS；2 suites / 2 tests FAIL（总217 / 1212），仍为第一阶段已独立基线重现的life-page与life-album-detail-sheet两项，不称全量PASS。全量之后的成员操作标题／空familyId收尾已重跑tsc、lint与上述57项针对性检查。

## 实页全部 NOT VERIFIED

没有启动用户Mac、模拟器、Liuz17，未读写已有隔离API数据库，未原生构建、部署或上传TestFlight。

- 两账号同家头像/昵称/创建者与成员/自己标识；24字昵称、同昵称辅助序号、旧账号无昵称回落。
- 改昵称后收起再展开；点选成员切换/收起；操作区归属明确，48pt可达。
- 移交取消/确认/接任，移除取消/确认；自己与普通成员没有管理操作。
- 切换家庭/后台/离开后旧读取及确认无效；断网第一次重试；保护遮挡。
- 中文/英文、短屏、横屏、iPad、系统VoiceOver；原个人记录、媒体、生活册不变。

不增加迁移；已迁移26无需再次迁移。分享作者昵称留到第三阶段。
