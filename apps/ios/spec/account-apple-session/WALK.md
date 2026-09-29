# 本机与账户 · 受门控的账户基础切片走查

独立 PR，基线 **`origin/main` `e0c7a99`**。未叠 #41。只改 `apps/ios`。PR 保持 OPEN。`identityLoopAccepted` 保持实际结果（本机仍为 **false**）。未对真实用户开放 `/family`。

本切片实现的是账户入口和现有登录能力的**状态展示**。不能写成「真实 Apple 登录闭环已完成」。

## SHA

| 端 | 值 |
| --- | --- |
| base `origin/main` | `e0c7a99` |
| 本分支 head | 本提交 |
| 真机 JS | Metro `8081` 本分支（若已连接） |
| 真机原生 | 既有 Xcode 26.6 Debug 安装；`app.lampy.ios` |

## 原生能力（不是“能安装就算过”）

| 项 | 结果 |
| --- | --- |
| Expo 源：`bundleIdentifier=app.lampy.ios`、`usesAppleSignIn=true`、`expo-apple-authentication` | **PASS**（`app.json`） |
| Team | `B283NY984J`（生成工程 / 已签名包） |
| 生成 `ios/Lampy/Lampy.entitlements` | **PASS**：含 `com.apple.developer.applesignin = Default`。该目录 gitignore，**不入库**。重新生成：`npx expo prebuild --platform ios` 后再 Xcode 26.6 构建。 |
| 本机 Debug 安装包 entitlement | **PASS**：已签名包含 `applesignin` 键。未把完整 codesign 输出写入仓库。 |
| 证书存在 / App 能安装 ⇒ 登录能力通过 | **否**。本切片不把安装成功写成服务端登录通过。 |
| 为过签名而删 capability / 改 bundle / 测试 token | **未做** |

## 环境（只记 SET/UNSET）

`npm run family-identity:inventory`：`EXPO_PUBLIC_FAMILY_API_BASE_URL` **UNSET**（本机 inventory 当时），`EXPO_PUBLIC_FAMILY_ENTRY_OPEN` **UNSET**，`LAMPY_FAMILY_API_TEST_TOKENS` **UNSET**，真实 identity token **UNSET**。Apple JWKS HTTP 200。

授权服务 URL 与家庭产品入口已分开：

| 组合 | 授权（账户页 Apple） | 家庭产品（最近/回看「家庭」、分享、`/family`） |
| --- | --- | --- |
| 无 URL、入口关闭 | 不显示 Apple 登录 | 关闭 |
| 有安全授权 URL、入口关闭 | 可显示 Apple 登录 | 关闭 |
| 家庭入口开启（`EXPO_PUBLIC_FAMILY_ENTRY_OPEN=1/true/yes`） | 仍只看授权 URL 是否安全 | 打开 |

Jest 已分别走查这三组。真机本环境是「无 URL / 入口关闭」。

## 产品入口

- 最近页 `本机与账户` → `/account`（`lampy:///account`）。**不是**家庭入口。
- `/family`、分享、「家庭」底栏只在 `EXPO_PUBLIC_FAMILY_ENTRY_OPEN` 明确打开时出现。设置授权 URL **不会**打开这些入口。
- 页上区分：个人记录只在本机、无同步/备份承诺；家庭身份为真实状态。无假头像、假成员、邮箱主键。

## 真机 Liuz17（iOS 26.2）

无公网授权服务时，**不能**用本机测试 token 代替服务端登录。本机无法经 iPhone 镜像拍到 Liuz17 画面（镜像超时），深链启动已执行。

| 检查 | 结果 |
| --- | --- |
| 打开 `lampy:///account` | **PASS**（`devicectl` 启动 `app.lampy.ios`，进程仍在）。账户页画面 **NOT VERIFIED** |
| 账户页文案 / 无 Apple 按钮（当时 inventory：授权 URL UNSET） | **NOT VERIFIED**（无真机画面）。Jest：无 URL 时为 `service-unavailable` |
| 系统 Apple 授权成功并换会话 | **NOT VERIFIED**（无授权 HTTPS 服务；不用测试 token） |
| 用户取消系统授权 | **NOT VERIFIED**（真机未出系统表）。Jest：`APPLE_SIGN_IN_CANCELLED` |
| 退出 | **NOT VERIFIED**（无已登录会话） |
| 杀进程重开 | **NOT VERIFIED**（`terminate` 需 pid；已再次 `launch` 账户深链，进程起来。未确认状态恢复画面） |
| 断网登录 / 退出后恢复 | **NOT VERIFIED** |
| 401 后重新登录 | **NOT VERIFIED** |
| 服务端完成登录 | **NOT VERIFIED** |
| 登录或退出已成功、随后刷新失败 | **NOT VERIFIED**（真机未走通）。Jest：先落本机可信状态，刷新失败文案说明已完成部分 |
| 进入账户页时已有本机会话、随后刷新失败 | **NOT VERIFIED**（真机）。Jest：先画已登录，失败文案是「读不到最新状态」，不是「登录没有完成」 |
| 无效 Apple token | **NOT VERIFIED**（真机）。Jest：`APPLE_TOKEN_INVALID` 按登录未完成，不按会话过期 |
| 旧失败晚于新成功 | **NOT VERIFIED**（真机）。Jest：失焦/登录/退出会使旧请求失效 |
| 本机个人记录仍可用 | Jest `family-personal-isolation` **PASS**。真机个人记录 **NOT VERIFIED**（未读 `lampy.db`，不能把隔离测试写成真机个人记录通过） |

## 仍缺

公网 HTTPS 授权服务、托管卷、第二个真实 Apple 账号、第二台设备。齐全之前不得把 `identityLoopAccepted` 改为 true，也不得开放家庭入口。真实 Apple 登录仍需授权 HTTPS 服务和真机操作单独验收。
