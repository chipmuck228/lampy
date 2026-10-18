# 1.0.0 发布说明与共享安全核对

基线：main 合并 #123（8d1ae85），用户已报告 iPhone 17 Pro / iOS 26.3.1 真机通过账号、家庭与删除验收。本文件区分已实现的功能和仍需补齐的发布工作，不代表 App Store 已可提交。

## 本片已实施

- `appstore-v1` 使用新的中英文帮助、隐私说明、使用条款和存储提示。普通关闭家庭的个人构建仍使用其原说明。
- 帮助覆盖 1 分钟录音、回看弹出日历、个人／家庭册素纸与手作、Apple 登录、主动分享、撤回、退出与删除。
- 删除和撤回不被描述为远程擦除他人设备或 App 外副本。私人记录默认本机；主动分享的家庭内容保存在服务器，并可能在阅读设备缓存必要副本。
- 明确购买、所有成品导出、打印关闭；不引导用户在删除前使用不存在的导出入口。不提供私人库云备份或异常恢复承诺。
- 隐私说明日期为 2026-10-18；条款只是与实际产品行为对齐的候选文本，不冒充运营主体／法律信息已经确认。
- 新增与现有正式部署路径对应的账号媒体／解散家庭清理 systemd service 和 hourly timer。它调用 #123 已有清理命令，不新增数据库迁移。

## 定时清理部署

模板为现有正式环境 `/opt/lampy-family`、用户 `lampy-family`、环境文件 `/etc/lampy/family.env`、Node `/usr/local/bin/node`。不得把它指向另一实例的数据库或媒体目录。先将这两个新模板上传到云主机的对应代码目录，再执行：

```sh
sudo install -m 0644 /opt/lampy-family/apps/ios/src/family-api/deploy/lampy-family-cleanup.service /etc/systemd/system/lampy-family-cleanup.service
sudo install -m 0644 /opt/lampy-family/apps/ios/src/family-api/deploy/lampy-family-cleanup.timer /etc/systemd/system/lampy-family-cleanup.timer
sudo systemctl daemon-reload
sudo systemctl start lampy-family-cleanup.service
sudo systemctl status lampy-family-cleanup.service --no-pager -l
sudo systemctl enable --now lampy-family-cleanup.timer
sudo systemctl list-timers lampy-family-cleanup.timer --all --no-pager
```

oneshot 成功后可显示 inactive / dead，需核对退出状态为 0，而非要求常驻 running。失败时查看 `sudo journalctl -u lampy-family-cleanup.service -n 60 --no-pager`。timer 每小时执行，带不超过 5 分钟随机延迟；错过的日历任务会在恢复后补执行。每轮账号媒体队列最多处理 100 项，积压时应增加运行频率或人工执行，不能承诺所有故障在一小时内消失。文件删除失败必须保留重试队列并处理日志中的失败状态。

任务安装、实际调度及文件删除失败重试尚未在正式主机验收，模板存在不等于部署完成。

## 上架前仍未完成的门槛

| 项目 | 当前依据 | 完成判据 |
| --- | --- | --- |
| 应用内内容举报 | 本轮检索家庭 API／界面未找到完整举报闭环 | 阅读记录时可明确举报；服务器校验举报者对内容的访问资格；提供回执和运营处理流程，限制滥用 |
| 用户屏蔽 | 现有移除成员／离开家庭不等于按用户屏蔽 | 用户可屏蔽及解除；家庭流、详情、媒体、声音、册子内容／封面和缓存均按当前读者过滤；失焦和权限变化不能恢复内容 |
| 有害内容处理 | 私密家庭邀请和成员权限已存在，但不是完整内容安全处理 | 明确发布前防范、报告后限制／移除与重复违规处理；覆盖文字、照片和声音，不扫描未分享私人库或擅自上传第三方分析 |
| 支持及举报联系方式 | 仓库当前设置中未找到已确认的公开支持邮箱／处理入口 | 用户确认可公开且有人处理的渠道；应用及官网实际可达，不能虚构邮箱或响应时限 |
| 官网政策／商店披露 | 本 PR 仅更新 iOS 仓库内说明 | 官网隐私政策及支持 URL 与应用一致；按真实服务器收集和依赖运行行为核对 App Privacy；明确运营主体和发布地区 |
| Apple 自动撤销 | 代码及模拟验证存在，账号删除真机通过 | 单独确认真实删除返回 revoked；失败提示手动处理不算自动撤销通过 |
| 清理任务托管 | 已有清理命令，本片新增 timer 模板 | 正式服务器安装、调度证据和失败重试验收 |

Apple 的审核指南 1.2 要求共享／用户内容应用具备内容过滤、举报及及时响应、屏蔽与公开联系方式；不能仅以“私密家庭”推定豁免。依据：https://developer.apple.com/app-store/review/guidelines/#user-generated-content 。隐私 URL 及 App Privacy 也须对应实际处理：https://developer.apple.com/app-store/app-privacy-details/ 。2026-10-18 核对；本台账不是审核通过保证。

下一实施片应补齐举报、屏蔽及处理闭环，并落实用户确认的支持渠道；这些能力在本 PR 中没有假装实现。后续屏蔽设计必须让当前读者参与册子 validation／媒体授权与缓存失效，不能只在列表本地隐藏一行。

## 本片验收

1. 用 `appstore-v1` 的 Release 构建，中文和英文分别检查帮助、隐私、条款及记录与存储。
2. 不再出现“家庭、账号未开放”或“设置不连接家庭服务”等旧声明；只有未分享私人内容默认不上家庭服务。
3. 帮助说明 1 分钟录音、数字日历、册子两种免费预览、登录／退出／撤回／删除，且不出现购买或导出操作引导。
4. 横屏和大字号可完整阅读，并能正常返回设置。
5. 个人默认关闭构建仍使用原说明；本片不改变录音、分享、阅读、登录、删除、付费或导出权限。
6. 云端 timer 单独按上述流程安装验收。无需再次执行迁移 32，也不因本片重置正式或测试数据库。

## About 原生版本信息

About 使用 expo-application 读取实际安装包的版本号及 build number，避免旧 expo-constants 字段始终为空。不使用 Expo manifest 版本冒充安装包版本。新增原生依赖后，Mac 必须重新 npm ci、执行发布 prepare（重新生成原生工程并安装 Pods）并编译；仅 reload 无效。验收时核对 About 与 Xcode 安装包 Version / Build 一致。云端无需更新或迁移。
