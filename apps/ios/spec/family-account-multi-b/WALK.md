# 阶段 B 检查记录

环境：Linux / Node 24.19.0；隔离工作区从 #92 merge 8d759d0 开出。依赖 npm ci --ignore-scripts；没有运行原生构建、没有碰 Liuz17 或生产。

## 源码与隔离测试

- TypeScript：npx tsc --noEmit，PASS。
- 改动 TS/TSX ESLint：PASS，无新 error。
- git diff --check：PASS。
- 新测试：真实 SQLite 16→19 保留旧 ID/角色；migration 18 写入失败回滚；跨连接第 10 个名额；幂等与重开；双会话/单设备退出；同名邮箱不合并；v1 歧义拒绝；HTTP 认证/名称；账号迟到读取/401；稳定创建 key；取消前不发送；列表与锁定门控。
- 全量 Jest：TZ=Asia/Shanghai npx jest --ci --runInBand，196 suites：194 passed / 2 failed；1035 tests：1033 passed / 2 failed。未称全量 PASS。
- 最后失焦清空视图修补后，页面与 application 资格测试 2 suites / 8 tests PASS；tsc 与改动文件 eslint 再核 PASS。此前全量与该修补分别记录。
- 新增测试共 14 项；包括跨连接 SQLite、迁移回滚、目录状态和页面门控。
- 实现 SHA 以独立 PR head 为准；设备运行 SHA 尚不存在。

## 基线对照

同依赖版本、TZ=Asia/Shanghai、--ci --runInBand；干净 checkout 8d759d0 和实现工作区都出现：

1. life-page.test.ts / picks a band layout from available width and painted label size：旧断言预期最近/回看，现基线已有生活册第三项。
2. life-album-detail-sheet.test.tsx / opens the collect sheet and cancels without changing the detail：测试点按后弹层未出现。

两者相关源码未改。不是仅凭“文件未改”认定基线；已经隔离复跑。另有原测试 overlapping act 日志，未声称全库零警告。

首轮 UTC 下生活册日期断言跨到 9 月 30 日；按产品测试时区 Asia/Shanghai 跑为 10 月 1 日且通过。旧单会话断言随本轮明确策略改成双会话；保存失败事务测试仍验证旧会话不丢。

## 验收边界

模拟器/真机 UI、双设备、公网、VoiceOver、本机保护实页：NOT VERIFIED。
生产服务版本/迁移：NOT VERIFIED（未访问主机）。家庭入口关闭、identityLoopAccepted 未动；未开始 C–F、注册、账号删除或付费。不得据本轮测试开启家庭。
