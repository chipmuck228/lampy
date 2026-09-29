import * as LocalAuthentication from 'expo-local-authentication';

import type { DeviceAuthResult } from '../application/device-lock';

export type DeviceAuthenticator = {
  authenticate(reason: string): Promise<DeviceAuthResult>;
};

function mapError(error?: string): DeviceAuthResult {
  const code = (error || '').toLowerCase();
  if (code.includes('passcode') || code.includes('not_enrolled') || code.includes('notenrolled')) {
    return { ok: false, reason: 'no-passcode' };
  }
  if (code.includes('cancel') || code.includes('user_cancel') || code.includes('system_cancel')) {
    return { ok: false, reason: 'cancel' };
  }
  if (code.includes('lockout') || code.includes('unavailable') || code.includes('not_available')) {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: false, reason: 'fail' };
}

export function createExpoDeviceAuthenticator(): DeviceAuthenticator {
  return {
    async authenticate(reason) {
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
      return mapError(result.error);
    },
  };
}
