import { createExpoDeviceAuthenticator } from './expo-device-auth';

const mockGetEnrolledLevelAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();

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

  it('maps cancel and lockout without unlocking', async () => {
    mockGetEnrolledLevelAsync.mockResolvedValue(2);
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    const auth = createExpoDeviceAuthenticator();
    await expect(auth.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'cancel' });
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'lockout' });
    await expect(auth.authenticate('reason')).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});
