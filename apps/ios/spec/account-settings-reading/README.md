# 本机设置改版

> 范围：只改 `apps/ios`。从 `origin/main` `277361ab61ecd7b3c0049c99c1f4e4015d0b744c`（#56 merge）新开。
> 不改 Moment / Asset / ownerId / 草稿 / 保存事务。家庭、AI、测试登录仍按现有门控。
> `identityLoopAccepted` 不变。不卸 Liuz17，不重传 TestFlight。
> 本 PR 保持 OPEN。回看视觉改版不在本轮。

参考视觉只有书面规则。用户附件 `App(1).tsx` / `index(1).css`（settings-modal / settings-body）**本机未找到**，不凭截图补源码。见 [`attachments/MISSING.md`](./attachments/MISSING.md)。

走查：[`WALK.md`](./WALK.md)。

---

## 1. 页面

| 路由 | 标题 | 返回 |
| --- | --- | --- |
| `/account` | 本机设置 | `dismissTo('/')`，不读 `canGoBack()` |
| `/account/storage` | 记录与存储 | `dismissTo('/account')` |
| `/account/about` | 关于 Lampy | `dismissTo('/account')` |
| `/account-diagnostics` | 开发诊断（门控） | 关则关闭页；开则原诊断。返回 `dismissTo('/account')` |

最近齿轮仍 `push('/account')`，不增加底导航。

根页只有：

1. 标题与返回
2. 本机保护一行 + 系统 Switch +「已开启 / 未开启」+「进入 Lampy 时使用 Face ID 或设备密码。」
3. 「记录与存储」入口
4. 「关于 Lampy」入口

开发诊断入口仅在现有门控打开时出现，Release MVP 不出现。

不加入同步、备份、导出、清库、手机号、删号、家庭管理。

---

## 2. 子页事实

记录与存储只写已核对事实：

- 个人记录保存在这台设备
- 当前版本没有跨设备同步或云备份
- 卸载或更换设备前，先确认记录怎么保留

不写容量、条数、备份状态，不放不可执行按钮，不承诺「永久安全」。

关于 Lampy：现有标识、短句「把生活，留给自己。」、真实版本/build。没有已存在的隐私政策/支持链接，故不画空入口。

---

## 3. 视觉与图标

暖纸色 / 墨色 / 低饱和绿 / 浅线 / 留白。沿用已落地 `life-text` 固定字号，`allowFontScaling={false}`。本 PR 不全局换 Noto/DM Sans。

图标只用 `LifeIcon` + SF Symbols：`gearshape` 齿轮、`chevron.left` 返回、`chevron.right` 向右、`lock` 本机保护、`info.circle` 关于、`internaldrive` 存储。装饰图标不进 VoiceOver。触达 ≥ 48pt。
