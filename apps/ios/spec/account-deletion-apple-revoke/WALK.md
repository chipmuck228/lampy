# 第一片检查与实页边界

- 基线 main c6cad6d7e9b6c2fc350929921d0a987200192678；工作分支 ios/account-deletion-apple-revoke。
- 实际执行：`npx tsc --noEmit` PASS；相关 Jest 31 suites / 264 tests PASS；改动 TS/TSX eslint 无新增 error（listen.ts 单独 --no-ignore 检查）；`git diff --check` PASS。Jest 使用临时SQLite、生成的测试EC密钥、模拟Apple响应；不使用用户密钥、个人库或真实撤销请求。
- 真实 Apple code交换／refresh持久化／撤销：NOT VERIFIED。
- 新客户端 Xcode Release／真机／VoiceOver：NOT VERIFIED。
- 公网迁移30／配置密钥／capture开启：未执行。
- 账号删除按钮、删除执行、清理任务和撤销重试：未实现。
- 全量 Jest 的两项已核对 main 既有失败（life-page 旧底带预期、life-album-detail-sheet 旧标签）不能写成全量PASS。

待隔离走查：门控关闭时旧包登录保留；新包+capture开启时首次授权及关联后密文保存；旧包收到更新提示；取消／失焦／保护等待不迟到绑定；交换失败重试；服务重启密文可读；错误密钥拒绝启动。最后一项真实撤销仅用可丢弃Apple身份，不通过普通用户入口触发。
