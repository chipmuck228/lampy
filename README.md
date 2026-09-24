# Lampy

保存那些不需要发布、却不应该消失的普通生活。

仓库里有两个并行客户端：

1. 微信小程序（仓库根目录，现有生产路径）
2. iOS App（`apps/ios`，Expo Development Build，阶段 0 脚手架）

iOS 不是小程序的翻译。Moment / Asset / Transmission 语义对齐，存储与 UI 分开实现。

## 微信小程序

```bash
npm test
```

用微信开发者工具打开仓库根目录。不要改 `repositories/keys.js` 或 `migrations/`。

## iOS（阶段 0）

环境：Node 22+、macOS Tahoe 26.2+、Xcode 26.4–26.6、CocoaPods。不要用 Expo Go 作为最终验证。不要升到 macOS 27 / Xcode 27 来跑当前脚手架。

```bash
cd apps/ios
npm install
npm test
npx expo run:ios --device "iPhone 17"
```

若 Dev Client 连不上局域网 IP，改用 `http://127.0.0.1:8081`。

真机需要开发者账号与本机签名，不在仓库中存放证书。当前屏幕只说明脚手架已就绪，没有 Moment 写入。
