import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as FileSystem from 'expo-file-system/legacy';

export type FamilyReceiveFileStore = {
  write(storageKey: string, bytes: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  listKeys(): Promise<string[]>;
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
    async listKeys() {
      async function walk(dir: string, prefix = ''): Promise<string[]> {
        let names: string[];
        try {
          names = await readdir(dir);
        } catch {
          return [];
        }
        const keys: string[] = [];
        for (const name of names) {
          const rel = prefix ? `${prefix}/${name}` : name;
          const full = path.join(dir, name);
          try {
            if ((await stat(full)).isDirectory()) keys.push(...(await walk(full, rel)));
            else keys.push(rel);
          } catch {
            continue;
          }
        }
        return keys;
      }
      return walk(rootDir);
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
    async listKeys() {
      async function walk(dir: string, prefix = ''): Promise<string[]> {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) return [];
        if (!info.isDirectory) return prefix ? [prefix] : [];
        const names = await FileSystem.readDirectoryAsync(dir);
        const keys: string[] = [];
        for (const name of names) {
          const rel = prefix ? `${prefix}/${name}` : name;
          const child = `${dir}${dir.endsWith('/') ? '' : '/'}${name}`;
          keys.push(...(await walk(child, rel)));
        }
        return keys;
      }
      return walk(rootDir ?? familyCacheDirectory());
    },
  };
}
