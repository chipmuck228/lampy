import * as SecureStore from 'expo-secure-store';

import { FIRST_RUN_SECURE_KEY, createSecureFirstRunStore } from './first-run-store';

describe('first-run store', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(FIRST_RUN_SECURE_KEY);
  });

  it('does not mark complete until the last step writes done', async () => {
    const store = createSecureFirstRunStore();
    expect(await store.isCompleted()).toBe(false);
    await store.markCompleted();
    expect(await store.isCompleted()).toBe(true);
  });
});
