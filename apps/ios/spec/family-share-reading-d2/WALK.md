# D2 走查

## 实际检查

- TypeScript：PASS。
- 本轮源文件与测试 ESLint：PASS。
- 全量 Jest：205 suites / 1107 tests PASS；另有 2 suites / 2 tests FAIL（life-page、life-album-detail-sheet）。隔离 main 对照已复现相同失败，不能记全量 PASS。
- 新增分享流程、缓存与账号交错、页面检查：3 suites / 21 tests PASS。
- git diff --check：PASS。

## 实页（全部 NOT VERIFIED）

Linux 环境未运行模拟器或真机，未动 Liuz17、生产或 TestFlight。

1. 隔离 API 先 migrate，启用已有测试登录及 D1 历史分享开关；客户端仅在隔离构建开家庭入口。不要更改生产。
2. A 选择明确家庭、原记录及媒体；不确认受众不保存。旧家庭检查创建者升级提示及旧邀请撤销。
3. A 分享长文+两图+声音，B 后加入仍能读有效历史。原记录仍在个人库；改变原记录不会改已存快照。
4. B 阅读全部媒体；点按播放、暂停、继续。退出页面、切后台、锁定后不自动播放，认证期间不露内容。
5. 切换账号和家庭不串内容；上传期间切后台/退出账号/锁定后不能迟到保存。
6. A 撤回后，B 再读或点播放必须重新鉴权，不能借缓存继续读；离线只显示失败与重试。
7. 检查中文/英文、短屏、横屏、iPad、VoiceOver；均未运行，不写 PASS。

## HEIC 上传修复

用户模拟器报告：JPEG 1484524 bytes 成功，HEIC 2808983 bytes 上传返回 MEDIA_UNSUPPORTED。
新增 SDK 57 `expo-image-manipulator ~57.0.21`，必须重新编译 Dev Client，Metro Reload 不足。仅在家庭分享时把 HEIC/HEIF 源字节转成同尺寸 JPEG（质量 0.9，不裁切）；源文件、元数据、revision 和个人显示均不改。临时结果在 finally 删除，原生引用释放。原始字节仍参与变更检查，转码后实际字节/MIME 校验并用于上传幂等键。取消/后台期间完成的转码不上传。

新增转换和取消测试通过，针对性 4 suites / 26 tests PASS；tsc PASS。Linux 未原生编译，HEIC 实机/模拟器转换、方向和上传阅读仍 NOT VERIFIED。前次全量结果不当成本修复后的全量 PASS。临时诊断日志不入库。

## 用户报告：双模拟器核心闭环（2026-10-09）

测试 checkout SHA：`2b0c36d18603eb9460a595aaec2c26b8dca69c77`。
环境：两台模拟器、隔离本机 API、Debug Dev Client；原生包经用户重建，二进制摘要未核对。先前设备为 iPhone 17 Pro Max / iOS 26.3 与 Lampy-family-second / iOS 26.5；期间又报告 iPhone 17 Pro / iOS 26.6，最终第一台具体型号/运行时未重新确认，不臆写。
工作区：`M app.json`、`M package-lock.json`。app.json 之前为本地 Web single 适配；最终两个文件的 diff 未收到，不能声称运行树与仓库完全一致。

用户报告模拟器 PASS：
1. A 分享文字、两张照片与声音，明确选择家庭/媒体并确认历史受众。
2. B 后加入，可读加入前有效分享。
3. 内容完整，声音播放/暂停/续播，离开返回不自动播。
4. A 在家庭分享详情撤回；B 返回刷新后不可再读。
5. 切账号不串内容，后台认证期间家庭内容遮挡，个人原记录完整。

这是用户报告的模拟器结果，不是执行环境运行或真机 PASS。真机、双真机、公网、VoiceOver、短屏/横屏/iPad仍 NOT VERIFIED。PR 保持 OPEN，未部署/未上传 TestFlight。
