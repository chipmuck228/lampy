import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as FileSystem from 'expo-file-system/legacy';

export type FamilyReceiveFileStore = {
  write(storageKey: string, bytes: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return globalThis.btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createNodeFamilyReceiveFiles(rootDir: string): FamilyReceiveFileStore {
  const dest = (storageKey: string) => path.join(rootDir, ...storageKey.split('/').filter(Boolean));

  return {
    async write(storageKey, bytes) {
      const file = dest(storageKey);
      await mkdir(path.dirname(file), { recursive: true });
      const part = `${file}.part`;
      await writeFile(part, bytes);
      await writeFile(file, bytes);
      await unlink(part).catch(() => undefined);
    },
    async read(storageKey) {
      return new Uint8Array(await readFile(dest(storageKey)));
    },
    async remove(storageKey) {
      await unlink(dest(storageKey)).catch(() => undefined);
      await unlink(`${dest(storageKey)}.part`).catch(() => undefined);
    },
    async removePrefix(prefix) {
      await rm(dest(prefix), { recursive: true, force: true });
    },
  };
}

export function familyCacheDirectory() {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('document directory is not available');
  return `${root}family-cache/`;
}

export function createExpoFamilyReceiveFiles(rootDir?: string): FamilyReceiveFileStore {
  const dest = (storageKey: string) => `${rootDir ?? familyCacheDirectory()}${storageKey}`;

  return {
    async write(storageKey, bytes) {
      const file = dest(storageKey);
      const directory = file.slice(0, file.lastIndexOf('/') + 1);
      const info = await FileSystem.getInfoAsync(directory);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      }
      const part = `${file}.part`;
      const encoded = bytesToBase64(bytes);
      await FileSystem.writeAsStringAsync(part, encoded, { encoding: 'base64' });
      await FileSystem.writeAsStringAsync(file, encoded, { encoding: 'base64' });
      await FileSystem.deleteAsync(part, { idempotent: true });
    },
    async read(storageKey) {
      const file = dest(storageKey);
      const info = await FileSystem.getInfoAsync(file);
      if (!info.exists || info.isDirectory) throw new Error('family cache file is missing');
      return base64ToBytes(await FileSystem.readAsStringAsync(file, { encoding: 'base64' }));
    },
    async remove(storageKey) {
      await FileSystem.deleteAsync(dest(storageKey), { idempotent: true });
      await FileSystem.deleteAsync(`${dest(storageKey)}.part`, { idempotent: true });
    },
    async removePrefix(prefix) {
      await FileSystem.deleteAsync(dest(prefix), { idempotent: true });
    },
  };
}
