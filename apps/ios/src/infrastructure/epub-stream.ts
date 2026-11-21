import { Zip, ZipPassThrough } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const EPUB_CHUNK_BYTES = 64 * 1024;
// Conservative ZIP32/reader boundary, not a memory limit. ZIP64 is outside this slice.
export const EPUB_ARCHIVE_MAX = 2 * 1024 * 1024 * 1024;
export type EpubStreamEntry = { name: string; size: number; open(): { read(size: number): Uint8Array; close(): void } };
export async function streamEpubArchive(options: {
  entries: EpubStreamEntry[]; write(bytes: Uint8Array): void; current(): boolean;
  yieldControl?: () => Promise<void>; progress?: (done: number, total: number) => void;
}) {
  const check = () => { if (!options.current()) throw new Error('CANCELLED'); };
  const yieldControl = options.yieldControl ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  if (options.entries[0]?.name !== 'mimetype' || options.entries.length > 60000) throw new Error('EPUB_TOO_LARGE');
  const names = new Set<string>();
  for (const entry of options.entries) {
    if (names.has(entry.name) || entry.name.startsWith('/') || entry.name.split('/').includes('..') || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('EPUB_INVALID_ASSET');
    names.add(entry.name);
  }
  const total = options.entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > EPUB_ARCHIVE_MAX - 32 * 1024 * 1024) throw new Error('EPUB_TOO_LARGE');
  const hash = sha256.create(); let bytes = 0; let completed = false;
  const zip = new Zip((error, data, final) => {
    if (error) throw error;
    check(); bytes += data.length;
    if (bytes > EPUB_ARCHIVE_MAX) throw new Error('EPUB_TOO_LARGE');
    options.write(data); hash.update(data); if (final) completed = true;
  });
  try {
    for (let i = 0; i < options.entries.length; i++) {
      check(); const entry = options.entries[i]; const leaf = new ZipPassThrough(entry.name);
      zip.add(leaf); const reader = entry.open(); let read = 0;
      try {
        for (;;) {
          check(); const chunk = reader.read(EPUB_CHUNK_BYTES);
          if (!chunk.length) break;
          if (chunk.length > EPUB_CHUNK_BYTES || read + chunk.length > entry.size) throw new Error('PRINT_FILE_CHANGED');
          read += chunk.length; leaf.push(chunk, false);
          await yieldControl(); check();
        }
        if (read !== entry.size) throw new Error('PRINT_FILE_CHANGED');
        leaf.push(new Uint8Array(), true);
      } finally { reader.close(); }
      options.progress?.(i + 1, options.entries.length);
      await yieldControl(); check();
    }
    zip.end(); check();
    if (!completed) throw new Error('EPUB_INCOMPLETE');
    return { sha256: bytesToHex(hash.digest()), bytes };
  } finally { zip.terminate(); }
}
export function epubMemoryEntry(name: string, data: Uint8Array): EpubStreamEntry {
  return { name, size: data.length, open() { let offset = 0; return { read(size) { const chunk = data.subarray(offset, offset + size); offset += chunk.length; return chunk; }, close() {} }; } };
}
