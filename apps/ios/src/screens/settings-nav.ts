import { tr } from '../i18n';
export function dismissSettingsToRecent(router: { dismissTo: (href: '/') => void }): void {
  router.dismissTo('/');
}

export function dismissToSettingsRoot(router: { dismissTo: (href: '/account') => void }): void {
  router.dismissTo('/account');
}

export function lampyAppVersionLabel(input: {
  version?: string | null;
  build?: string | null;
}): string {
  const version = input.version?.trim();
  const build = input.build?.trim();
  if (!version) return tr("版本信息暂不可用");
  return build ? tr('版本 {0}（{1}）', [version, build]) : tr('版本 {0}', [version]);
}
