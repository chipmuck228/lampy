export function canOpenPersonalSettingsDiagnostics(
  env: Record<string, string | undefined> = process.env,
  isDev: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): boolean {
  if (env.EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS === '1') return true;
  if (env.EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS === '0') return false;
  return Boolean(isDev);
}

export function isPersonalSettingsDiagnosticsOpen(
  env: Record<string, string | undefined> = process.env,
  isDev: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): boolean {
  return canOpenPersonalSettingsDiagnostics(env, isDev);
}
