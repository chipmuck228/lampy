import * as SecureStore from 'expo-secure-store';

export const DEVICE_LOCK_SECURE_KEY = 'lampy.device-lock.v1';

export type DeviceLockStore = {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
};

export function createSecureDeviceLockStore(): DeviceLockStore {
  return {
    async isEnabled() {
      return (await SecureStore.getItemAsync(DEVICE_LOCK_SECURE_KEY)) === '1';
    },
    async setEnabled(enabled: boolean) {
      if (enabled) await SecureStore.setItemAsync(DEVICE_LOCK_SECURE_KEY, '1');
      else await SecureStore.deleteItemAsync(DEVICE_LOCK_SECURE_KEY);
    },
  };
}
