# 首次引导 / 本机保护 / 空库走查

日期：2026-09-29。基线 `origin/main` `f8e9199`。分支 `ios/first-run-lock-empty`。只改 `apps/ios`。未叠 #41 / #45。未开放 `EXPO_PUBLIC_FAMILY_ENTRY_OPEN`。`identityLoopAccepted` 仍为 **false**。未部署服务。未合并。

原生 Face ID / 设备密码 / App 切换器遮挡需要 **prebuild 后重装**。Metro 热更新不算 B 组验收。

不要清空现有真机个人库。空库请用可丢弃的独立测试安装。

## 自动化

在 `apps/ios`：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| 本切片 Jest（引导 / 锁 / 空库 / 账户 Face ID / 回看空态 / 声音暂停） | PASS |
| 全量 `npm test` 并行 | 机器过载下大量 5s timeout；同一套受影响文件 `--runInBand` 后 PASS |
| 新文件 `eslint` | PASS |
| `npx expo lint` 全库 | 既有 leave.tsx / share/[id].tsx `set-state-in-effect`，不是本切片引入 |

## 真机 A：默认关闭

新装或引导未完成的安装：三屏上滑 +「继续」→ 最后「留下瞬间」→ 留下一条 → 最近 / 回看。全程不弹系统认证。中途杀进程再开，引导应仍在。已有记录的升级安装不得挡进入记录。

## 真机 B：主动开启

本机与账户打开「使用 Face ID 保护 Lampy」→ 认证成功才保持开启。后台 / 冷启动先遮挡再解锁。深链 `/lookback`、`/moment/:id`、`/leave`、`/account` 同样先锁。取消后「再试一次」。关闭保护也要先认证。App 切换器不得露出最近/回看/详情。Face ID 不可用时走系统设备密码；没有密码时说明记录还在。

模拟器 / Jest 不记作真机 PASS。
