import { tr } from '../i18n';
export const SETTINGS_TERMS_UPDATED = tr("2026年10月2日");

export const SETTINGS_TERMS_CHAPTERS = [
  {
    title: tr("这份说明"),
    paragraphs: [
      tr("这份说明随当前安装包提供，说明你现在可以使用的 Lampy。"),
      tr("请以你安装的这一版为准。"),
    ],
  },
  {
    title: tr("Lampy 做什么"),
    paragraphs: [
      tr("Lampy 用来在这台设备上留下文字、照片和声音，并在「最近」和「回看」里阅读。"),
      tr("目前没有付费项目。当前版本没有可购买的内容、订阅或试用。"),
    ],
  },
  {
    title: tr("记录保存在这台设备"),
    paragraphs: [
      tr("你留下的个人记录写在这台设备上的应用空间里。"),
      tr("当前版本没有由 Lampy 提供的跨设备同步或云备份。"),
    ],
  },
  {
    title: tr("本机保护"),
    paragraphs: [
      tr("本机保护由你决定是否开启。开启后，进入 Lampy 需要通过系统的 Face ID 或设备密码。"),
    ],
  },
  {
    title: tr("当前版本未开放的能力"),
    paragraphs: [
      tr("家庭、账号注册和人工智能相关能力在当前版本中未向你开放。"),
    ],
  },
  {
    title: tr("卸载和备份"),
    paragraphs: [
      tr("卸载应用通常会清掉应用空间里的个人记录和媒体。"),
      tr("系统备份是否包含这些内容、以及再装之后能否看见，取决于系统和备份设置。Lampy 不能保证记录一定保留，也不能保证再装之后一定能看见。"),
    ],
  },
  {
    title: tr("更新"),
    paragraphs: [
      tr("这份说明会随安装包更新。"),
    ],
  },
] as const;
