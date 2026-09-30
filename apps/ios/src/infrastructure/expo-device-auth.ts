import type { DeviceAuthResult } from '../application/device-lock';

export type DeviceAuthenticator = {
  authenticate(reason: string): Promise<DeviceAuthResult>;
};

type LocalAuthenticationModule = typeof import('expo-local-authentication');

export function mapLocalAuthError(error?: string): DeviceAuthResult {
  const code = (error || '').toLowerCase();
  if (
    code.includes('passcode_not_set') ||
    code.includes('passcode') ||
    code.includes('not_enrolled') ||
    code.includes('notenrolled')
  ) {
    return { ok: false, reason: 'no-passcode' };
  }
  if (
    code.includes('user_cancel') ||
    code.includes('system_cancel') ||
    code.includes('app_cancel') ||
    code.includes('cancel')
  ) {
    return { ok: false, reason: 'cancel' };
  }
  if (
    code.includes('lockout') ||
    code.includes('not_available') ||
    code.includes('not_interactive') ||
    code.includes('timeout') ||
    code.includes('unavailable')
  ) {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: false, reason: 'fail' };
}

function loadLocalAuthentication(): LocalAuthenticationModule | null {
  try {
    return require('expo-local-authentication') as LocalAuthenticationModule;
  } catch {
    return null;
  }
}

export function createExpoDeviceAuthenticator(): DeviceAuthenticator {
  return {
    async authenticate(reason) {
      const LocalAuthentication = loadLocalAuthentication();
      if (!LocalAuthentication) {
        return { ok: false, reason: 'unavailable' };
      }
      try {
        const security = await LocalAuthentication.getEnrolledLevelAsync();
        if (security === LocalAuthentication.SecurityLevel.NONE) {
          return { ok: false, reason: 'no-passcode' };
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason,
          disableDeviceFallback: false,
          cancelLabel: '取消',
        });
        if (result.success) return { ok: true };
        return mapLocalAuthError(result.error);
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },
  };
}
