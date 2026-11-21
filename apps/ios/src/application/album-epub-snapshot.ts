import { albumReadingFingerprint, type AlbumReadingStyle } from './album-reading';
import { assertPrintContent, type PrintMedia } from './album-print';
import type { AlbumLayoutInput } from './album-layout-input';

export type EpubSnapshot = {
  version: 1; kind: 'epub'; id: string; albumId: string; name: string; createdAt: string;
  style: AlbumReadingStyle; content: AlbumLayoutInput; media: PrintMedia[];
  dates: Record<string, { label: string; chapter: string }>;
};
export type EpubSnapshotStore = {
  begin(id: string): Promise<void>;
  copy(id: string, source: string, index: number): Promise<{ file: string; sha256: string; bytes: number }>;
  verify(source: string, hash: string): Promise<void>;
  commit(snapshot: EpubSnapshot): Promise<void>;
  discard(id: string): Promise<void>;
};
/** Freeze an independent edition without fonts, Core Text pagination or PDF generation. */
export async function freezeEpubSnapshot(deps: {
  id: string; now: string; style: AlbumReadingStyle; current(): boolean; authorize(): Promise<void>;
  read(): Promise<AlbumLayoutInput>; dates(input: AlbumLayoutInput): EpubSnapshot['dates'];
  store: EpubSnapshotStore; progress?(done: number, total: number): void;
}): Promise<EpubSnapshot> {
  const check = () => { if (!deps.current()) throw new Error('CANCELLED'); };
  let started = false;
  try {
    check(); await deps.authorize(); check();
    const first = await deps.read(); check(); assertPrintContent(first);
    const fingerprint = albumReadingFingerprint(first);
    const content: AlbumLayoutInput = JSON.parse(JSON.stringify(first));
    const dates = deps.dates(first);
    started = true; await deps.store.begin(deps.id); check();
    const copies = new Map<string, PrintMedia>(); const originals: { source: string; hash: string }[] = [];
    const total = new Set(content.entries.flatMap(e => e.media.map(m => m.assetId))).size;
    for (const entry of content.entries) for (const media of entry.media) {
      check(); const source = media.uri!;
      let copy = copies.get(media.assetId);
      if (!copy) {
        const result = await deps.store.copy(deps.id, source, copies.size); check();
        copy = { assetId: media.assetId, ...result }; copies.set(media.assetId, copy);
        deps.progress?.(copies.size, total);
      }
      originals.push({ source, hash: copy.sha256 }); media.uri = copy.file;
    }
    if (albumReadingFingerprint(await deps.read()) !== fingerprint) throw new Error('SOURCE_CHANGED');
    check();
    for (const original of originals) { await deps.store.verify(original.source, original.hash); check(); }
    await deps.authorize(); check();
    const snapshot: EpubSnapshot = { version: 1, kind: 'epub', id: deps.id, albumId: content.album.id,
      name: content.album.name, createdAt: deps.now, style: deps.style, content, media: [...copies.values()], dates };
    await deps.store.commit(snapshot); check();
    return snapshot;
  } catch (error) {
    if (started) await deps.store.discard(deps.id);
    throw error;
  }
}
