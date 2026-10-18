# 官网公共打开链接

配套官网仓库 chipmuck228/lampyweb 的 web/lampy-open-install 分支。完整部署步骤见官网 spec/OPEN-INSTALL.md。

App 分享入口仍是 https://yunpura.com。官网按钮直接使用 https://open.yunpura.com/en/install 或 /zh-cn/install。App 原生构建增加 applinks:open.yunpura.com，+native-intent 将这两个明确的公共安装页映射到 /（最近），不传入私人记录、家庭或账号信息，不替用户登录、加入家庭或开始播放。家庭邀请解析保留原逻辑。本机保护和首次启动流程不绕过。

严格接受指定 HTTPS origin 和路径，不接受相似域名、凭据、非默认端口或带查询/片段的链接。Expo 给出相对安装路径时亦映射到首页。其余路由继续原处理。此改动不涉及数据库、家庭 API、支付商品或付费导出开关；家庭付费 PDF 继续关闭。

必须先部署官网和 open.yunpura.com 的 HTTPS/AASA，再执行新的 prebuild 和签名构建。旧 Build 10 及旧 App 不会自动获得此原生关联。更新 development build 或新 TestFlight 构建后测试：从 Safari 中主域介绍页点击打开链接；冷启动和已运行时均进入最近；开启本机保护仍需解锁。家庭邀请原链接也需回归。

AASA 的 appID 必须匹配实际签名 application-identifier，当前配套网站按现有项目 B283NY984J.app.lampy.ios 配置，签名和 Apple CDN 验证仍待 Mac/真机验收。第三方 IM 不保证支持 Universal Links，不支持时展示官网下载说明，用户可从 Safari 或桌面打开。未安装时同一链接显示 TestFlight 页面，由用户明确点击安装；App 不检测网页是否安装、不自动付费。

已有 2 个 Jest 套件6项测试、14项 Node 配置回归测试通过；TypeScript 与目标 ESLint 通过。测试覆盖冷/热路由、恶意/无关地址拒绝、与原家庭域名合并及幂等、不改变关闭支付配置。上述为实施阶段自动检查记录；当时尚未验证线上关联。后续部署和人工结果见下节。

## 2026-10-18 用户真机验收

官网 PR #1 已合并 main（b9b3399），用户确认中文安装页与域名关联文件正确，open.yunpura.com 已连接 Production。用户按 PR #121 重编流程操作后明确报告真机测试通过，并授权合并本 PR。本次未单独提供设备型号、OS、构建号或逐项日志，不推断具体值，也不将所有第三方 IM 均标记为已通过。

合并前复核公共链接白名单、原有家庭邀请分支、关联域名合并及付费关闭配置，未发现阻塞项。保留实施阶段6项Jest、14项Node配置测试、TypeScript/ESLint通过记录；此次最终新增提交仅记录验收，没有运行时代码修改。GitHub combined status 没有状态记录，不宣称CI绿灯。

本次仅合并 main，不构建、上传或分发新的 TestFlight 包。现有旧 TestFlight 包不会自动获得此次原生关联。家庭付费 PDF 继续延期并保持关闭。
