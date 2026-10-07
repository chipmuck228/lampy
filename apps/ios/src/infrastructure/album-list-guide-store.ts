import * as SecureStore from 'expo-secure-store';

export const ALBUM_LIST_GUIDE_SECURE_KEY = 'lampy.album-list-guide.v1';

export type AlbumListGuideStore = {
  isDismissed(): Promise<boolean>;
  markDismissed(): Promise<void>;
};

export function createSecureAlbumListGuideStore(): AlbumListGuideStore {
  return {
    async isDismissed() {
      return (await SecureStore.getItemAsync(ALBUM_LIST_GUIDE_SECURE_KEY)) === 'dismissed';
    },
    async markDismissed() {
      await SecureStore.setItemAsync(ALBUM_LIST_GUIDE_SECURE_KEY, 'dismissed');
    },
  };
}
