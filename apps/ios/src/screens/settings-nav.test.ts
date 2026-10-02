import { dismissSettingsToRecent, dismissToSettingsRoot, lampyAppVersionLabel } from './settings-nav';

describe('settings navigation', () => {
  it('returns by known routes, not canGoBack', () => {
    const router = { dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
    dismissSettingsToRecent(router);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.canGoBack).not.toHaveBeenCalled();
    dismissToSettingsRoot(router);
    expect(router.dismissTo).toHaveBeenCalledWith('/account');
  });

  it('prints the installed version and build without inventing a number', () => {
    expect(lampyAppVersionLabel({ version: '1.2.3', build: '45' })).toBe('版本 1.2.3（45）');
    expect(lampyAppVersionLabel({ version: '1.2.3' })).toBe('版本 1.2.3');
    expect(lampyAppVersionLabel({ version: '  ', build: '45' })).toBe('版本信息暂不可用');
    expect(lampyAppVersionLabel({})).toBe('版本信息暂不可用');
    expect(lampyAppVersionLabel({ version: '0.1.0' })).toBe('版本 0.1.0');
  });
});
