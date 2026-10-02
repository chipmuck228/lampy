# 本机设置改版

> 范围：只改 `apps/ios`。从 `origin/main` `277361ab61ecd7b3c0049c99c1f4e4015d0b744c`（#56 merge）新开。
> 不改 Moment / Asset / ownerId / 草稿 / 保存事务。家庭、AI、测试登录仍按现有门控。
> `identityLoopAccepted` 不变。不卸 Liuz17，不重传 TestFlight。
> 本 PR 保持 OPEN。回看视觉改版不在本轮。

参考视觉：[`attachments/App.tsx`](./attachments/App.tsx) 的 `SettingsPage` / `settings-modal`，以及 [`attachments/index.css`](./attachments/index.css) 的 `.settings-header`、`.settings-intro`、`.settings-row`、`.settings-detail`、`.settings-body`。

只取纸色、顶栏、品牌引言、分组行、子页说明的排法。**不落地**附件里的云同步、认证信息、付费与权益、付费记录、网页 Face ID 偏好、手写 SVG。

走查：[`WALK.md`](./WALK.md)。

---

## 1. 页面

| 路由 | 标题 | 返回 |
| --- | --- | --- |
| `/account` | 本机设置 | 可见「最近」，`dismissTo('/')`，不读 `canGoBack()` |
| `/account/storage` | 记录与存储 | 可见「本机设置」，`dismissTo('/account')` |
| `/account/about` | 关于 Lampy | 可见「本机设置」，`dismissTo('/account')` |
| `/account-diagnostics` | 开发诊断（门控） | 关则关闭页；开则原诊断。返回 `dismissTo('/account')` |

最近齿轮仍 `push('/account')`，不增加底导航。

根页（对照 settings-modal 主视图）：

1. 三栏顶栏：返回「最近」/ 标题 / 占位
2. settings-intro：现有启动标识、Lampy、「把生活，留给自己。」
3. 分组「本机」：本机保护（系统 Switch +「已开启 / 未开启」+「进入 Lampy 时使用 Face ID 或设备密码。」）、「记录与存储」、「关于 Lampy」

开发诊断入口仅在现有门控打开时出现，单独分组「开发」。Release MVP 不出现。

不加入同步、备份、导出、清库、手机号、删号、家庭管理。

---

## 2. 子页事实

记录与存储对照 settings-detail：圈内图标、标题、分列事实。只写已核对事实：

- 个人记录保存在这台设备
- 当前版本没有跨设备同步或云备份
- 卸载或更换设备前，先确认记录怎么保留

不写容量、条数、备份状态，不放不可执行按钮，不承诺「永久安全」。不复制附件「让记录留在你选择的地方」「尚未接入」。

关于 Lampy 对照 settings-body：标识、短句「把生活，留给自己。」、浅线下方安装包版本。只读 `nativeAppVersion` / `nativeBuildVersion`；都取不到时写「版本信息暂不可用」，不回退 `expoConfig`，不写死 `0.1.0`。没有已存在的隐私政策/支持链接，故不画空入口。

`/account-diagnostics` 在门控关闭时（含 Release 深链）直接渲染关闭页，外壳即 `SettingsPage`（`flex: 1`），不套一层无高度的 View。

---

## 3. 视觉与图标

暖纸色 / 墨色 / 低饱和绿 / 浅线 / 留白。颜色仍用已落地 `life-page` token，不把附件 `#f8f6ef` / `#b58c58` 收成新色板。字号仍用 `life-text`，`allowFontScaling={false}`。本 PR 不全局换 Noto/DM Sans。

顶栏、行高、分组眉题、子页圈标的间距按 attachments 的 settings-modal / settings-body 收。左右边距取安全区与 `pageGutter` 的较大值，避免横屏顶进刘海；正文宽度仍受 `readingWidth`（最大 520）限制。图标只用 `LifeIcon` + SF Symbols：`gearshape` 齿轮、`chevron.left` 返回、`chevron.right` 向右、`lock` 本机保护、`info.circle` 关于、`internaldrive` 存储。装饰图标不进 VoiceOver。触达 ≥ 48pt。开关用系统 `Switch`，不手写滑块。
