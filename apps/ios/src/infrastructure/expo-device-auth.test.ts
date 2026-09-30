import { createExpoDeviceAuthenticator, mapLocalAuthError } from './expo-device-auth';

const mockGetEnrolledLevelAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();

jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core') as typeof import('expo-modules-core');
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      name === 'ExpoLocalAuthentication' ? {} : actual.requireOptionalNativeModule?.(name),
  };
});

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
  getEnrolledLevelAsync: (...args: unknown[]) => mockGetEnrolledLevelAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}));

describe('expo device authenticator', () => {
  beforeEach(() => {
    mockGetEnrolledLevelAsync.mockReset();
    mockAuthenticateAsync.mockReset();
  });

  it('uses the system passcode fallback and does not claim Face ID is required', async () => {
    mockGetEnrolledLevelAsync.mockResolvedValue(1);
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    const auth = createExpoDeviceAuthenticator();
    await expect(auth.authenticate('验证是这台设备的持有人。')).resolves.toEqual({ ok: true });
    expect(mockAuthenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });

  it('explains a device with no passcode without deleting records', async () => {
    mockGetEnrolledLevelAsync.mockResolvedValue(0);
    const auth = createExpoDeviceAuthenticator();
    await expect(auth.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'no-passcode' });
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });

  it('maps expo-local-authentication error strings to lock reasons', () => {
    expect(mapLocalAuthError('user_cancel')).toEqual({ ok: false, reason: 'cancel' });
    expect(mapLocalAuthError('system_cancel')).toEqual({ ok: false, reason: 'cancel' });
    expect(mapLocalAuthError('app_cancel')).toEqual({ ok: false, reason: 'cancel' });
    expect(mapLocalAuthError('authentication_failed')).toEqual({ ok: false, reason: 'fail' });
    expect(mapLocalAuthError('not_enrolled')).toEqual({ ok: false, reason: 'no-passcode' });
    expect(mapLocalAuthError('passcode_not_set')).toEqual({ ok: false, reason: 'no-passcode' });
    expect(mapLocalAuthError('lockout')).toEqual({ ok: false, reason: 'unavailable' });
    expect(mapLocalAuthError('not_available')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('maps cancel and lockout without unlocking', async () => {
    mockGetEnrolledLevelAsync.mockResolvedValue(2);
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    const auth = createExpoDeviceAuthenticator();
    await expect(auth.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'cancel' });
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'lockout' });
    await expect(auth.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not load expo-local-authentication when the native module is missing', async () => {
    const loadAuth = jest.fn(() => {
      throw new Error("Cannot find native module 'ExpoLocalAuthentication'");
    });
    let auth: ReturnType<typeof createExpoDeviceAuthenticator> | undefined;
    jest.isolateModules(() => {
      jest.doMock('expo-modules-core', () => {
        const actual = jest.requireActual('expo-modules-core') as typeof import('expo-modules-core');
        return {
          ...actual,
          requireOptionalNativeModule: () => null,
        };
      });
      jest.doMock('expo-local-authentication', () => loadAuth());
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require('./expo-device-auth') as typeof import('./expo-device-auth');
      auth = loaded.createExpoDeviceAuthenticator();
    });
    await expect(auth!.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(loadAuth).not.toHaveBeenCalled();
  });
});
