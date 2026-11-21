# Android：基线与个人记录闭环

基于 main `035ae8a71bd928d5bf3bdaf58daf98ddd59ba320`。沿用 Expo SDK 57 / React Native 0.86.3 和现有目录。此阶段不是 Android 商店发布。

## 范围

无需账号，离线完成文字、最多三张照片、前台录音、感受、发生日期、草稿恢复、保存、最近、回顾、详情和本机保护。使用已有 SQLite、媒体复制与草稿保全逻辑，不迁移或改写 iOS 数据模型。录音沿用现有免费时长（每段一分钟）。

Android 主导航仅有“最近”“回看”。暂不提供生活册（其 Swift 排版未移植）、家庭、分享至家庭、测试账号、订阅、购买或导出。导航保护在屏幕挂载前排除这些路由，家庭服务入口与购买适配器另有平台保护，不能用遗留环境开关重新开放。iOS 保持原入口。

本阶段不承诺 iPhone 与 Android 的个人库同步、迁移或家庭互通。

## 本地运行

准备 Node 22、Java 21、Android Studio（Android SDK 36 / Build Tools 36.0.0）、模拟器或开启 USB 调试的真机。NDK 沿用当前 React Native 的构建要求；首次 Gradle 构建可能需要下载。

```bash
cd apps/ios
npm ci
npm run android:prebuild
npm run android
```

原生目录通过 Expo prebuild 生成，仍不提交 `android/`。不要用 `prebuild --clean` 操作已有 iOS 工程。

`android`、`android:start`、`android:release`、`android:bundle` 都通过专用启动器覆盖家庭、测试、付费和导出开关，并设置 `EXPO_NO_DOTENV=1`，避免读取已有 `.env.production`。不要用 iOS 的 `npm start` 脚本启动 Android Metro。

重新启动 Metro：

```bash
npm run android:start
```

独立运行的本地 Release 验证包：

```bash
npm run android:release
```

该命令使用生成工程的开发签名配置，仅供本地验收；不是商店签名或可发布版本。版本号的 Android 自增编号可通过 `LAMPY_ANDROID_VERSION_CODE` 指定。生产签名、商店渠道和上架资料不在本阶段。

## 平台适配

- 使用已有 expo-symbols 内置 Material Symbols 映射，避免 Android 出现空白按钮；iOS 继续 SF Symbols。
- 最近和回顾使用 Android 系统字体别名，首次引导沿用已有字体资源。
- Android 系统照片选择器不申请整个相册的权限。屏蔽广泛存储/照片/视频/音频读取权限；拍摄与录音仍按操作请求相机和麦克风权限。
- 键盘使用 resize，安全区沿用现有实现。Android 系统返回、系统活动切换后的本机锁、录音中断必须实机确认。
- 关闭 Android 自动备份，避免本机私人内容被隐式迁移到系统云备份。卸载会丢失本机数据；升级验收必须覆盖原安装。

## 自动检查

```bash
node --test scripts/android-personal.test.cjs
npm run test:android
npx tsc --noEmit
npx expo lint
npm run android:bundle
```

GitHub Actions 的 `Android personal baseline` 工作流生成 arm64 调试 APK，artifact 名为 `lampy-android-personal-debug`。调试 APK 需要开发服务，不代表脱离 Metro 的验收通过。

## 真机验收门槛

所有项目必须记录设备、Android 版本、构建编号和结果；未执行时写 NOT VERIFIED，不写 PASS。

| 场景 | 预期 |
| --- | --- |
| 首装、引导、重启 | 正常进入最近；无家庭、生活册和付费入口；无启动时权限索取 |
| 文字记录 | 写字、感受、日期、保存、最近、详情和回顾一致 |
| 草稿 | 写字后按系统返回，再打开记录可恢复；杀进程重开可恢复已落盘草稿 |
| 图片 | 拍照、选一至三张、取消、删除草稿图片正常；重新启动后已保存图片可读 |
| 权限 | 拒绝相机或麦克风不丢文字；选图不索取整个相册权限 |
| 系统回收 | 相机/选图期间系统回收 Activity 后返回，检查草稿保全及选图结果；Expo pending-result 恢复尚未专项实现，如丢图须在发布前修复 |
| 录音 | 录制、停止、暂停、继续播放、自然结束、重复播放正常；到时停止后可保存 |
| 中断 | 录音时来电/切后台/锁屏，已有文字不丢失，可重新录音，不产生损坏记录 |
| 离线 | 飞行模式下记录、浏览和回顾正常，操作不依赖家庭 API |
| 本机保护 | 系统认证成功/取消/失败、后台回前台和最近任务预览检查 |
| 布局与返回 | 小屏、横屏、键盘、手势导航/三键导航、返回退出均无按钮遮挡 |
| 深链接 | `lampy://family`、`lampy://albums`、`lampy://account/subscribe` 不挂载对应屏幕 |
| 升级 | 同签名覆盖安装后原文字、媒体、草稿和日期保持完整 |
| 独立运行 | Release 验证包关闭 Metro、断开电脑后杀进程冷启动正常 |

至少覆盖一台 Android 13+ 真机；面向正式发布前再扩展至最低支持版本及不同厂商。当前代码不等同于真机验收完成。
