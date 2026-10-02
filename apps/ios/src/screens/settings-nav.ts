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
  if (!version) return '版本信息暂不可用';
  return build ? `版本 ${version}（${build}）` : `版本 ${version}`;
}
