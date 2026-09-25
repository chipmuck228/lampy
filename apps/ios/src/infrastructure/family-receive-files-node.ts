import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FamilyReceiveFileStore } from './family-receive-files';

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
