import { unzipSync, strFromU8, strToU8 } from 'fflate';
import { epubMemoryEntry, streamEpubArchive, EPUB_CHUNK_BYTES } from './epub-stream';
const tick = async () => {};
it('writes a readable EPUB archive with first, uncompressed mimetype and exact resources', async () => {
  const chunks: Uint8Array[] = [];
  const result = await streamEpubArchive({ entries: [epubMemoryEntry('mimetype', strToU8('application/epub+zip')), epubMemoryEntry('OEBPS/photo.jpg', new Uint8Array(200000).fill(7))], write: bytes => chunks.push(bytes.slice()), current: () => true, yieldControl: tick });
  const archive = new Uint8Array(result.bytes); let at = 0;
  for (const chunk of chunks) { archive.set(chunk, at); at += chunk.length; }
  expect(archive[8]).toBe(0);
  expect(strFromU8(archive.slice(30,38))).toBe('mimetype');
  const files = unzipSync(archive);
  expect(strFromU8(files.mimetype)).toBe('application/epub+zip');
  expect(files['OEBPS/photo.jpg']).toEqual(new Uint8Array(200000).fill(7));
});
it('streams more than 64 MiB without requesting a whole resource or collecting the archive', async () => {
  const size = 70 * 1024 * 1024; let maxRead = 0; let close = false; let emitted = 0;
  const result = await streamEpubArchive({ entries: [epubMemoryEntry('mimetype', strToU8('application/epub+zip')), { name: 'OEBPS/audio.m4a', size, open() { let left = size; return { read(n) { maxRead = Math.max(maxRead,n); const data = new Uint8Array(Math.min(n,left)); left -= data.length; return data; }, close() { close = true; } }; } }], write: bytes => { emitted += bytes.length; }, current: () => true, yieldControl: tick });
  expect(result.bytes).toBe(emitted); expect(emitted).toBeGreaterThan(size);
  expect(maxRead).toBe(EPUB_CHUNK_BYTES); expect(close).toBe(true);
});
it.each(['background','leave','cancel'])('stops on %s and closes the currently open source', async () => {
  let current = true; let closed = false; let emitted = 0;
  const work = streamEpubArchive({ entries: [{ name: 'mimetype', size: 200000, open() { return { read: () => new Uint8Array(EPUB_CHUNK_BYTES), close() { closed = true; } }; } }], write: bytes => { emitted += bytes.length; }, current: () => current, yieldControl: async () => { current = false; } });
  await expect(work).rejects.toThrow('CANCELLED'); expect(closed).toBe(true); expect(emitted).toBeLessThan(100000);
});
it('rejects short reads and propagates storage write failures', async () => {
  await expect(streamEpubArchive({ entries: [{ name: 'mimetype', size: 10, open() { return { read: () => new Uint8Array(), close() {} }; } }], write() {}, current: () => true, yieldControl: tick })).rejects.toThrow('PRINT_FILE_CHANGED');
  await expect(streamEpubArchive({ entries: [epubMemoryEntry('mimetype', strToU8('application/epub+zip'))], write() { throw new Error('DISK_FULL'); }, current: () => true })).rejects.toThrow('DISK_FULL');
});
