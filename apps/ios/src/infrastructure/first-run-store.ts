import * as SecureStore from 'expo-secure-store';

export const FIRST_RUN_SECURE_KEY = 'lampy.first-run.v1';

export type FirstRunStore = {
  isCompleted(): Promise<boolean>;
  markCompleted(): Promise<void>;
};

export function createSecureFirstRunStore(): FirstRunStore {
  return {
    async isCompleted() {
      return (await SecureStore.getItemAsync(FIRST_RUN_SECURE_KEY)) === 'done';
    },
    async markCompleted() {
      await SecureStore.setItemAsync(FIRST_RUN_SECURE_KEY, 'done');
    },
  };
}
