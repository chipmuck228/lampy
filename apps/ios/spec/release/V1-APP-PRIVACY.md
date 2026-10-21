# App Privacy 填写工作底稿

2026-10-21，基线 main a17bdc8。未提交问卷；最终选择须对应实际发布包、家庭 API、Admin 与基础设施。依据：[Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)。

不能选“未收集任何数据”。家庭功能保存设备外可读取的账号与分享内容，即使默认私人库本机、即使没有广告，仍满足收集定义。用途以 App Functionality 为主，包括认证、权限、分享和安全处理。账号关联不等于广告追踪。

| Apple 类型 | 建议／状态 | 关联用户 | 数据与用途 |
| --- | --- | --- | --- |
| Identifiers → User ID | 选 | 是 | Apple subject、Lampy userId、昵称与账号身份；昵称是 screen name |
| Contacts | 建议选 | 是 | 家庭成员／邀请组成账号社交图；不表示读取手机通讯录 |
| User Content → Photos or Videos | 选 | 是 | 主动分享照片；本产品未开放视频记录 |
| User Content → Audio Data | 选 | 是 | 主动分享声音，未分享录音仍只在本机 |
| User Content → Other User Content | 选 | 是 | 自由文字、感受、日期、家庭名、册名、开篇 |
| User Content → Customer Support | 保守建议选 | 是 | 举报说明及处理／申诉；不假设满足可选披露的全部条件 |
| Other Data Types | IP／安全信息的分类候选，待定 | 按实际关联核对 | 持久化 IP 桶及必要安全关系，hash 不自动免披露 |
| Contact Info → Email Address | Apple 路径不按旧列直接勾选；支持邮件另核对 | 如实际收集通常关联 | requestedScopes=[]，新账号不写 email；支持来信会有发件地址，需核对渠道和豁免条件 |
| Contact Info → Name | 无专门真实姓名采集依据 | 待实际行为核对 | 昵称归 User ID；如主动要求或保存真实姓名需补填 |
| Precise／Coarse Location | 阻塞定稿 | 待照片证据 | 原图 GPS=PRESENT；服务器副本 UNKNOWN，不能据无定位权限认定未收集 |
| Diagnostics／Usage Data | 待日志及最终包核对 | 待实际接收行为 | 核对 trace、SDK、崩溃与性能接收渠道，不把安全审计机械归 Analytics |
| Purchases | 当前关闭 | — | 不因依赖／模块存在就认定实际收集购买历史 |
| Device ID | 自有路径未见广告 ID／设备级 ID，待包核对 | — | 不通过 IP 做设备指纹 |

已确定项的用途为 App Functionality，不默认选 Analytics、Product Personalization 或广告。Tracking 草案为否，仍需最终依赖／流量核对。

Apple 要求按 IP 实际用途判断定位、设备标识、诊断等类型；现有用途是防滥用，不是推断地理位置。Other Data Types 是待最终确认的工程分类候选，不是 Apple 对 Lampy 的裁定。

自由文本可能提及健康等，不自动使所有题材成为专门采集类别。Apple 对自由文本和语音分别提供 Other User Content／Audio Data 指引；主动索取具体类别时须重新判断。

## 提交步骤与证据

1. 真实 Release Archive 生成隐私报告，核对实际 SDK、PrivacyInfo.xcprivacy、required-reason API 与 tracking domains；manifest 和商店标签分别检查。
2. 完成照片、IP／日志、旧邮箱与运维副本核对，解决上表待定项。
3. App Store Connect → App Privacy 填写类型、用途、关联与 tracking，不一律选不关联。
4. 填入已部署、无登录可访问的隐私政策 URL。本片没有验证某个具体公开路径，文档文件名不是网址。
5. 保存最终答案／发布日期，与官网和包内说明一致核对。

家庭分享是核心持续功能，不能因为用户主动分享就直接套用偶发反馈的披露豁免。管理员访问审计本身不是原文副本，但仍可能关联对象。本片不宣称最终申报、第三方 SDK 全量隐私核验或法律审核已完成。
