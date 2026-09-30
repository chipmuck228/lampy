import { isPersonalSettingsDiagnosticsOpen } from './personal-settings-visibility';

describe('isPersonalSettingsDiagnosticsOpen', () => {
  it('follows the explicit test gate over __DEV__', () => {
    expect(isPersonalSettingsDiagnosticsOpen({ EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '1' }, false)).toBe(true);
    expect(isPersonalSettingsDiagnosticsOpen({ EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '0' }, true)).toBe(false);
  });

  it('keeps a developer entry in __DEV__ when no gate is set, not the dump on 本机设置', () => {
    expect(isPersonalSettingsDiagnosticsOpen({}, true)).toBe(true);
    expect(isPersonalSettingsDiagnosticsOpen({}, false)).toBe(false);
  });
});
