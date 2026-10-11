# 发布证据与边界

本文件记录证据，不替代 GAPS 状态。旧 WALK 保留原时点；下面的新报告只补充明确覆盖的项目。

## E-01：源码核对

2026-10-11，main `eeb6d94d8bd90c2740280522270bff522d23a8f6`，#87 与 #105 均已合并。本次只读核对运行源码、构建脚本与相关 spec，未重跑 App 测试、Xcode、模拟器、设备或服务器部署。

主要证据入口：

- [内部登录与构建规格](../family-testflight-login/README.md)、[走查](../family-testflight-login/WALK.md)
- [原生构建固化](../release-build-repro/README.md)、[走查](../release-build-repro/WALK.md)
- [受控公网账号](../family-controlled-public-auth/README.md)
- [家庭邀请](../family-invite-links/README.md)、[解散与清理](../family-dissolve-cleanup-e3/README.md)
- [设置及法律候选稿边界](../settings-pages-reading/README.md)
- [生活册](../life-album/README.md)、[阶段 C 走查](../life-album/WALK-C.md)

## E-02：合并前 Release 真机（用户报告）

iPhone 17 Pro／iOS 26.2／Release 0.1.0 (7)，本地 SHA `40fae1e4d0da88b15776289a79762b4f64747f09`，工作区干净。用户确认其 tree 与预期整合 tree `21ac07dcc71e9d0e651c48be1e9e7bb0fcac9ae6` 一致。无 Metro 冷启动、Face ID 后台遮挡、设置内昵称保存与退出／再登录通过。这是本地整合源码证据，不把该本地 SHA 写成 GitHub main。

合并前组合检查的仓库记录：Node 构建工具 10/10、tsc、定向 Jest 7 suites／74 tests、改动 lint、shell 和 diff 通过。此前全量 218 suites：215 PASS／3 FAIL；1235 tests：1232 PASS／3 FAIL，未被定向检查覆盖成全量通过。

## E-03：Build 7 Archive 与 TestFlight（用户报告）

构建日志：源码 `eeb6d94d8bd90c2740280522270bff522d23a8f6`，`git_dirty=no`，family-internal，0.1.0 (7)，Xcode 26.6／17F113。Archive 检查输出 `problems=none`、`inspect_exit=0`。这是该次日志环境；不因为先前使用 Xcode 26.3，就把本次构建写成 26.3。

2026-10-11 用户确认 TestFlight 安装后以下全部通过：

| 项目 | 结论 |
| --- | --- |
| 无 Xcode／Metro 冷启动 | PASS（用户报告） |
| 登录、昵称保存、退出、换账号 | PASS（用户报告） |
| 邀请登录返回、明确确认加入 | PASS（用户报告） |
| 家庭分享与声音播放 | PASS（用户报告） |
| Face ID 认证期间遮挡 | PASS（用户报告） |
| 原个人记录与生活册保留 | PASS（用户报告） |

上传选用普通 App Store Connect 流程，而非 Internal Only；不等于已经发布商店。TestFlight 设备型号／系统未在本次报告重新提供，不沿用为已确认；安装后运行 SHA 未独立读取。上述验收不覆盖系统 VoiceOver、真实双设备跨网络、系统 Universal Link 路由、公开注册、正式 PDF 或付费。

## E-04：公网隔离服务（用户报告）

测试源 `708fb8c7375e299b1df25adab789594a1420ca58`，与 App main 不同。`https://family-test.yunpura.com/health` HTTP 200，受控账号开启、公众注册关闭、旧测试账号入口关闭；两名运营预置账号登录／资料匹配通过。持久卷与升级前备份已确认。撤销／停用、认证失败和限流曾有各自时点的公网验收；本次部署不重新宣称全部压力／安全路径通过。

健康检查不证明邀请／媒体闭环、备份还原、正式上线或定时清理已验收。此文档不更新服务器，不含凭据。

## E-05：家庭阅读慢（用户报告＋源码线索）

用户在家庭阅读中报告加载慢。`family-history-screen.tsx` 的加载等待策略与内容，内联展开实例再次读取；`family-history-use-cases.ts` 的 read 串行处理媒体、读取缓存列表／文件及写缓存，包含声音。可作为测量目标，尚无各步骤耗时、网络吞吐或 CPU 数据，不能据此断言主机规格不足，也不能保证某一优化倍数。

## 本次文档检查

仅文档与 spec 索引。提交前检查相对链接存在、文档范围与 `git diff --check`；无运行代码变化，不新增 App 测试通过结论。后续实际检查结果以 PR 为准。
