import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { FAMILY_ERROR, FamilyError } from './errors';

export type MediaBlobStore = {
  write(storageKey: string, bytes: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
};

export function createMemoryMediaBlobStore(): MediaBlobStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async write(storageKey, bytes) {
      files.set(storageKey, new Uint8Array(bytes));
    },
    async read(storageKey) {
      const found = files.get(storageKey);
      if (!found) {
        throw new FamilyError(FAMILY_ERROR.MEDIA_NOT_FOUND, 'Media object was not found.');
      }
      return new Uint8Array(found);
    },
    async remove(storageKey) {
      files.delete(storageKey);
    },
  };
}

function assertStorageKey(storageKey: string) {
  if (!/^med_[a-f0-9]+$/.test(storageKey)) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_NOT_FOUND, 'Media object was not found.');
  }
}

export function createDirectoryMediaBlobStore(rootDir: string): MediaBlobStore {
  mkdirSync(rootDir, { recursive: true });
  return {
    async write(storageKey, bytes) {
      assertStorageKey(storageKey);
      const finalPath = path.join(rootDir, storageKey);
      const partialPath = `${finalPath}.partial`;
      try {
        writeFileSync(partialPath, bytes);
        renameSync(partialPath, finalPath);
      } catch (error) {
        try {
          rmSync(partialPath, { force: true });
        } catch {
          /* ignore */
        }
        throw new FamilyError(
          FAMILY_ERROR.MEDIA_WRITE_FAILED,
          error instanceof Error && /ENOSPC|disk/i.test(error.message)
            ? 'Not enough disk space to store media.'
            : 'Media could not be stored.',
        );
      }
    },
    async read(storageKey) {
      assertStorageKey(storageKey);
      try {
        return new Uint8Array(readFileSync(path.join(rootDir, storageKey)));
      } catch {
        throw new FamilyError(FAMILY_ERROR.MEDIA_NOT_FOUND, 'Media object was not found.');
      }
    },
    async remove(storageKey) {
      if (!/^med_[a-f0-9]+$/.test(storageKey)) return;
      try {
        rmSync(path.join(rootDir, storageKey), { force: true });
        rmSync(path.join(rootDir, `${storageKey}.partial`), { force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
