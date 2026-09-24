import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { extensionForAudioMime, extensionForMime, type MediaStore } from './media';

export function createNodeMediaStore(rootDir: string): MediaStore {
  async function persist(dest: string, sourceUri: string) {
    await mkdir(rootDir, { recursive: true });
    try {
      await stat(dest);
      return { localUri: dest };
    } catch {
      await copyFile(sourceUri, dest);
      const info = await stat(dest);
      return { localUri: dest, sizeBytes: info.size };
    }
  }

  return {
    async persistImage({ assetId, sourceUri, mimeType }) {
      return persist(path.join(rootDir, `${assetId}.${extensionForMime(mimeType)}`), sourceUri);
    },
    async persistAudio({ assetId, sourceUri, mimeType }) {
      return persist(
        path.join(rootDir, `${assetId}.${extensionForAudioMime(mimeType, sourceUri)}`),
        sourceUri,
      );
    },
    async exists(localUri) {
      try {
        const info = await stat(localUri);
        return info.isFile();
      } catch {
        return false;
      }
    },
    async canDecode(localUri) {
      try {
        const info = await stat(localUri);
        return info.isFile() && info.size > 0;
      } catch {
        return false;
      }
    },
    async canPlay(localUri) {
      try {
        const info = await stat(localUri);
        return info.isFile() && info.size > 0;
      } catch {
        return false;
      }
    },
    async removeAppOwned(localUri) {
      if (!localUri.startsWith(rootDir)) return false;
      try {
        await unlink(localUri);
        return true;
      } catch {
        return false;
      }
    },
  };
}
