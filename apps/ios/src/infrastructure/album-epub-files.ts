import {epubAudioFormat} from '../application/epub-audio-format';
import { acquireAlbumEdition } from './album-edition-lock';
import { epubSnapshotDirectory } from './album-epub-snapshots';
import type { EpubSnapshot } from '../application/album-epub-snapshot';
import { File, FileMode } from 'expo-file-system';
import * as FS from 'expo-file-system/legacy';
import { albumEpubNative, albumPrintNative } from '../../modules/lampy-album-layout';
import { albumEpubDocuments, EPUB_COPY, type EpubResource } from '../application/album-epub';
import { manifestDigest, type PrintManifest } from '../application/album-print';
import { appLanguage, dateLabel } from '../i18n';
import { albumExportAccess } from './album-export-purchases';

import { streamEpubArchive, epubMemoryEntry, EPUB_ARCHIVE_MAX, type EpubStreamEntry } from './epub-stream';
const RESERVE = 32 * 1024 * 1024;
export type EpubProgress = { stage: EpubStage; done: number; total: number };
async function assertSpace(bytes: number) {
  if (await FS.getFreeDiskStorageAsync() < bytes + RESERVE) throw new Error('EPUB_DISK_FULL');
}
function editionDirectory(id: string) {
  if (id.startsWith('epub_')) return epubSnapshotDirectory(id);
  if (!/^print_[a-zA-Z0-9_-]{1,94}$/.test(id) || !FS.documentDirectory) throw new Error('EPUB_INVALID_EDITION');
  return `${FS.documentDirectory}album-print-evaluation/${id}/`;
}
export type EpubStage = 'READ_EDITION' | 'AUTHORIZE' | 'READ_MEDIA' | 'CONVERT_IMAGE' | 'PACKAGE' | 'WRITE_FILE' | 'VERIFY_FILE' | 'PUBLISH' | 'SHARE' | 'CLEANUP';
export class AlbumEpubFailure extends Error {
  constructor(readonly stage: EpubStage, readonly code: string) { super(`EPUB/${stage}/${code}`); }
}
function safeCode(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown } | null;
  for (const candidate of [value?.code, value?.message]) {
    if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate)) return candidate;
  }
  return 'OPERATION_FAILED';
}
export type EpubEditionAccess={
 directory(id:string):string;
 /** Additional scope/content/entitlement checks for an authorized source adapter. */
 authorize(manifest:PrintManifest|EpubSnapshot,current:()=>boolean):Promise<void>;
};
/** Export from immutable edition copies, never re-read changing source media. */
export async function shareAlbumEpub(id: string, current: () => boolean, onStage?: (progress: EpubProgress) => void, access?:EpubEditionAccess) {
  const check = () => { if (!current()) throw new Error('CANCELLED'); };
  check();
  const dir = access?access.directory(id):editionDirectory(id);
  const temporary: string[] = [];
  let work = '';
  let output: ReturnType<File['open']> | null = null;
  let stage: EpubStage = 'READ_EDITION';
  const report = (next: EpubStage, done = 0, total = 0) => {
    stage = next;
    if (current()) onStage?.({ stage: next, done, total });
    if (__DEV__) console.info('[LampyEpub]', JSON.stringify({ event: 'STAGE', stage }));
  };
  // One owner per edition, even if two mounted screens race.
  const releaseEdition = acquireAlbumEdition(id);
  try {
    // No other job for this edition is active. Remove only abandoned EPUB work, never editions.
    for (const name of await FS.readDirectoryAsync(dir)) {
      check();
      if (/^\.epub-work-[a-zA-Z0-9_-]+$/.test(name) || /^album-(en|zh-Hans)\.epub\.partial$/.test(name))
        await FS.deleteAsync(`${dir}${name}`, { idempotent: true });
    }
    report('READ_EDITION');
    const manifest: PrintManifest | EpubSnapshot = JSON.parse(await FS.readAsStringAsync(`${dir}manifest.json`));
    const digest = await FS.readAsStringAsync(`${dir}manifest.sha256`);
    check();
    if (manifest.id !== id || manifest.version !== 1 || manifestDigest(manifest) !== digest) throw new Error('PRINT_FILE_CHANGED');
    const authorize=()=>access?access.authorize(manifest,current):albumExportAccess.assert(current);
    const uri = `${dir}album-${appLanguage}.epub`;
    const digestUri = `${uri}.sha256`;
    // Saving/sharing an EPUB always requires current export rights, including cached editions.
    report('AUTHORIZE');
    await authorize(); check();
    if ((await FS.getInfoAsync(uri)).exists && (await FS.getInfoAsync(digestUri)).exists) {
      const expected = await FS.readAsStringAsync(digestUri);
      if ((await albumPrintNative().printFileDigest(uri)).sha256 !== expected) throw new Error('PRINT_FILE_CHANGED');
      if(access){await authorize();check();} report('SHARE'); check(); return await albumPrintNative().sharePrintPdf(uri);
    }
    await assertSpace(RESERVE); check();
    work = `${dir}.epub-work-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    await FS.makeDirectoryAsync(work); check();
    const assets: Record<string, EpubResource> = {};
    const dimensions:Record<string,{widthPx:number;heightPx:number;intrinsicRatio:number}>={};
    const mediaEntries: EpubStreamEntry[] = [];
    const frozenById = new Map(manifest.media.map(item => [item.assetId, item]));
    const mediaTotal = new Set(manifest.content.entries.flatMap(entry => entry.media.map(media => media.assetId))).size;
    let total = 0;
    for (const entry of manifest.content.entries) for (const media of entry.media) {
      if (assets[media.assetId]) continue;
      check(); const frozen = frozenById.get(media.assetId);
      if (!frozen || !/^media-\d+$/.test(frozen.file)) throw new Error('EPUB_MISSING_CONTENT');
      report('READ_MEDIA', mediaEntries.length, mediaTotal);
      const source = `${dir}${frozen.file}`;
      const actual = await albumPrintNative().printFileDigest(source); check();
      if (actual.sha256 !== frozen.sha256 || actual.bytes !== frozen.bytes) throw new Error('PRINT_FILE_CHANGED');
      let mime: string; let extension: string; let prepared = source; let size = actual.bytes;
      if (media.role === 'image') {
        await assertSpace(RESERVE); check();
        report('CONVERT_IMAGE', mediaEntries.length, mediaTotal);
        prepared = `${work}image-${mediaEntries.length}`;
        const image = await albumEpubNative().prepareImage(source, prepared); check();
        mime = image.mime; extension = image.extension; size = image.bytes;
        if(Number.isFinite(image.width)&&Number.isFinite(image.height)&&image.width>0&&image.height>0)dimensions[media.assetId]={widthPx:image.width,heightPx:image.height,intrinsicRatio:image.width/image.height};
      } else if (media.role === 'audio') {
        const handle = new File(source).open(FileMode.ReadOnly);
        let header: Uint8Array;
        try { header = handle.readBytes(16); } finally { handle.close(); }
        const format = epubAudioFormat(header); mime = format.mime; extension = format.extension;
      } else throw new Error('EPUB_UNSUPPORTED_MEDIA');
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('PRINT_FILE_CHANGED');
      total += size;
      if (total > EPUB_ARCHIVE_MAX - RESERVE) throw new Error('EPUB_TOO_LARGE');
      const path = `media/asset-${mediaEntries.length}.${extension}`;
      assets[media.assetId] = { path, mime };
      mediaEntries.push({ name: `OEBPS/${path}`, size, open() {
        const reader = new File(prepared).open(FileMode.ReadOnly);
        return { read: size => reader.readBytes(size), close: () => reader.close() };
      } });
      report('CONVERT_IMAGE', mediaEntries.length, mediaTotal);
      await new Promise<void>(resolve => setTimeout(resolve, 0)); check();
    }
    const dates: Record<string, { label: string; chapter: string }> = 'kind' in manifest ? manifest.dates : {};
    for (const page of ('layout' in manifest ? manifest.layout.pages : [])) for (const block of page.blocks) if (block.kind === 'day-rule') {
      const match = /^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(block.dateKey);
      dates[block.momentId] = { label: block.text, chapter: match ? (match[3] ? dateLabel(Number(match[2]), Number(match[3])) : match[2]) : EPUB_COPY[appLanguage].unknown };
    }
    check();
    report('PACKAGE');
    await new Promise<void>(resolve => setTimeout(resolve, 0)); check();
    const publicationInput={...manifest.content,entries:manifest.content.entries.map(entry=>({...entry,media:entry.media.map(media=>({...media,...dimensions[media.assetId]}))}))};
    const documents = albumEpubDocuments({ input: publicationInput, assets, dates, id: `${id}-${appLanguage}`, createdAt: manifest.createdAt, design: 'kind' in manifest ? manifest.design : undefined, language: appLanguage });
    const entries = [...Object.entries(documents).map(([name, data]) => epubMemoryEntry(name, data)), ...mediaEntries];
    await assertSpace(entries.reduce((sum, item) => sum + item.size, 0) + RESERVE); check();
    const part = `${work}album.epub`;
    report('WRITE_FILE');
    new File(part).create();
    output = new File(part).open(FileMode.Truncate);
    const result = await streamEpubArchive({ entries, current, write: chunk => output!.writeBytes(chunk),
      progress: (done, total) => report('WRITE_FILE', done, total) });
    output.close(); output = null; check();
    report('VERIFY_FILE');
    if ((await albumPrintNative().printFileDigest(part)).sha256 !== result.sha256) throw new Error('PRINT_FILE_CHANGED');
    await authorize(); check();
    const hash = result.sha256;
    const digestPart = `${work}album.sha256`;
    await FS.writeAsStringAsync(digestPart, hash); check();
    report('PUBLISH');
    // A missing digest denotes an incomplete prior publication; never replace a verified edition.
    await FS.deleteAsync(uri, { idempotent: true }); check();
    await FS.deleteAsync(digestUri, { idempotent: true }); check();
    try {
      await FS.moveAsync({ from: part, to: uri }); check();
      await FS.moveAsync({ from: digestPart, to: digestUri }); check();
    } catch (error) {
      await FS.deleteAsync(uri, { idempotent: true });
      await FS.deleteAsync(digestUri, { idempotent: true });
      throw error;
    }
    if(access){await authorize();check();}
    report('SHARE'); check();
    return await albumPrintNative().sharePrintPdf(uri);
  } catch (error) {
    const failure = error instanceof AlbumEpubFailure ? error : new AlbumEpubFailure(stage, safeCode(error));
    if (__DEV__) console.info('[LampyEpub]', JSON.stringify({ event: 'FAILED', stage: failure.stage, code: failure.code }));
    throw failure;
  } finally {
    let cleanupFailed = false;
    try {
      try { output?.close(); } catch { cleanupFailed = true; }
      if (work) temporary.push(work);
      const results = await Promise.allSettled(temporary.map(uri => FS.deleteAsync(uri, { idempotent: true })));
      cleanupFailed ||= results.some(result => result.status === 'rejected');
    } finally { releaseEdition(); }
    if (cleanupFailed) throw new AlbumEpubFailure('CLEANUP', 'EPUB_CLEANUP_FAILED');
  }
}
export {epubAudioFormat} from '../application/epub-audio-format';
