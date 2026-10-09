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
