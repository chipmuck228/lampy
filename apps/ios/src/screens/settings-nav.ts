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
  const version = input.version?.trim() || '0.1.0';
  const build = input.build?.trim();
  return build ? `版本 ${version}（${build}）` : `版本 ${version}`;
}
