# Mac 验收

## 先验收免费纸页

从本片 PR 拉取最新提交。在已重编过 #116 的工作目录 apps/ios 中停止当前 Metro，使用以下完整环境；所有家庭入口均开启。

```bash
export EXPO_PUBLIC_FAMILY_API_BASE_URL=https://family-test.yunpura.com
export EXPO_PUBLIC_FAMILY_ENTRY_OPEN=1
export EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS=1
export EXPO_PUBLIC_FAMILY_ALBUM_EVAL=1
export EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED=0
export EXPO_PUBLIC_UNIFIED_PURCHASES=0
export EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID=app.lampy.export.test
export EXPO_PUBLIC_ALBUM_PRINT_EVAL=0
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --dev-client --lan --port 8082 --clear
```

保留已存在的 LampyLocal.storekit。已有 #116 原生构建可直接连接新 Metro，无需为免费纸页重做 Pods。由 Xcode ⌘R 启动，或只验收免费预览时从当前开发构建连接此 Metro。localhost、127.0.0.1、::1 继续绕过代理。

入口：我的生活册 → 家里的 → 某一册 → 看纸页。未购买和普通成员也应能使用两种风格；家庭付费 PDF 开关为 0 时不应出现新导出入口。

| 项目 | 通过标准 |
| --- | --- |
| 素纸/手作 | 两种风格均可试排；纸色、照片装饰与个人册协调，不弹付费 |
| 原文与媒体 | 长文、emoji、长图、多图、昵称和开篇完整；图片不拉伸；顺序及封面符合整理结果 |
| 分页与放大 | 翻到最后一页，缩放后可返回；保留顶部留白，不出现重复顶部页数文案 |
| 声音 | 在含声音的纸页播放/暂停，翻页、离页、后台、锁定后停止，回来不自动播 |
| 成员预览 | 普通成员可看纸页和切风格，不能新生成 PDF |
| 稳定性 | 纸页停留 2 分钟不循环刷新、不重新排版跳页；临时网络波动恢复后正常 |
| 撤回与修改 | 另一账号撤回或 creator 修改排序/开篇后，旧纸页被撤下；重试获取新版，不继续显示旧原文 |
| 锁定与后台 | 私密内容遮挡；恢复后重新核验，无旧图片闪现 |
| 撤回占位 | 重新预览可显示不可用条目；原文与原媒体不出现 |

## 家庭付费 PDF

这部分需另完成真实商品与 Apple Sandbox 服务配置，不能用 app.lampy.export.test 本地交易替代。先按 README.md 部署 API 并确认 migration 31、服务器购买来源验证，客户端使用真实商品 ID 并开启统一购买和家庭 PDF 开关，prebuild/Pods/重编；Xcode StoreKit Configuration 设 None。参照 paid-export-f/F2-ACCEPTANCE.md 做只读 preflight。开关默认关闭，不要修改公共归档脚本跳过此项。

测试当前 creator 购买后明确解锁本家庭，再从看纸页或管理页进入“导出这一册”，点“生成PDF”。购买、解锁、生成和系统保存均为显式操作，不能自动扣款或自动生成。

验收：素纸/手作各生成一次；同册添加记录重生成、另一册生成；保存到系统文件并离线打开；普通成员和未解锁家庭不能新生成；转交后仅新 creator 可使用该家庭授权，个人权益不转移；原购买退款后停止新生成，旧 PDF 仍可打开；生成期间撤回/排序/转交/锁定/离页，不交付本次成品；已有 withdrawn 条目应阻止生成而不是静默漏掉。

新支付页面的开发诊断仅保留固定阶段/代码，不记录邮箱、token、私有路径或交易 payload。若服务端尚未配置，记为未验收，不将按钮出现或 mock 通过记为真实付费通过。
