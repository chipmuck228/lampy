import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { extensionForMime, type MediaStore } from './media';

export function createNodeMediaStore(rootDir: string): MediaStore {
  return {
    async persistImage({ assetId, sourceUri, mimeType }) {
      await mkdir(rootDir, { recursive: true });
      const dest = path.join(rootDir, `${assetId}.${extensionForMime(mimeType)}`);
      try {
        await stat(dest);
        return { localUri: dest };
      } catch {
        await copyFile(sourceUri, dest);
        const info = await stat(dest);
        return { localUri: dest, sizeBytes: info.size };
      }
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
  };
}
