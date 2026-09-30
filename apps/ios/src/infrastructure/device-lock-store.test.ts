import * as SecureStore from 'expo-secure-store';

import { DEVICE_LOCK_SECURE_KEY, createSecureDeviceLockStore } from './device-lock-store';

describe('device lock store', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(DEVICE_LOCK_SECURE_KEY);
  });

  it('defaults to off and only keeps enabled after a successful write', async () => {
    const store = createSecureDeviceLockStore();
    expect(await store.isEnabled()).toBe(false);
    await store.setEnabled(true);
    expect(await store.isEnabled()).toBe(true);
    await store.setEnabled(false);
    expect(await store.isEnabled()).toBe(false);
  });
});
