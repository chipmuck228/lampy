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

  it('prints the real version and build without inventing extra facts', () => {
    expect(lampyAppVersionLabel({ version: '0.1.0', build: '1' })).toBe('版本 0.1.0（1）');
    expect(lampyAppVersionLabel({ version: '0.1.0' })).toBe('版本 0.1.0');
    expect(lampyAppVersionLabel({})).toBe('版本 0.1.0');
  });
});
