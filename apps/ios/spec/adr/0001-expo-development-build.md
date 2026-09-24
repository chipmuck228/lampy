# ADR 0001：Expo Development Build

状态：已接受（Phase 0）
日期：2026-09-24

## 决策

Lampy iOS 使用 **React Native + Expo SDK 57 + Expo Development Build**（`expo-dev-client`），不用 Expo Go 作为发布前验证环境，不用 Capacitor / WebView 包装微信小程序。

本机已验证的组合：

- macOS 26.7
- Xcode 26.6
- Expo `~57.0.24`
- React Native `0.86.3`
- TypeScript `~6.0.3` `strict: true`

不要为当前脚手架升级到 macOS 27 / Xcode 27 / Expo SDK 58。

## 理由

- 产品规范 17.1 推荐该栈。
- 相机、文件系统、SQLite、麦克风需要不受 Go 沙盒限制的原生模块。
- 开发者使用 TypeScript / React，与微信 WXML 分轨，避免机械翻译页面。

## 后果

- 每次原生依赖变化需要重新 `expo run:ios`。
- 生成的 `apps/ios/ios/` 不提交。
- 模拟器里 Dev Client 若连不上局域网 IP，改用 `http://127.0.0.1:8081`。
