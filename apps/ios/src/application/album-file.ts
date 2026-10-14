import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { AlbumLayoutInput, AlbumLayoutRecordInput } from './album-layout-input';
import type { PrintManifest } from './album-print';
import type { AlbumReadingStyle } from './album-reading';
export const ALBUM_FILE_VERSION = 1;
export const ALBUM_FILE_LIMITS = { bytes: 512 * 1024 * 1024, records: 2000, media: 510, jsonBytes: 4 * 1024 * 1024 };
export type AlbumFile = {
  format: 'lampy'; version: 1; readingVersion: 1; layoutVersion: 'album-a5-v5';
  name: string; opening: string | null; style: AlbumReadingStyle;
  createdAt: string; cover: { record: number; media: number } | null;
  // Explicit system-font policy: no unlicensed system font binaries leave the app.
  fonts: { policy: 'system-not-redistributed'; serif: string; ui: string };
  records: { note: string; feeling: string; occurredAt?: string; occurredAtPrecision: string; recordedAt: string;
    media: { file: string; role: 'image' | 'audio'; widthPx?: number; heightPx?: number; durationMs: number | null }[] }[];
  files: { name: string; sha256: string; bytes: number }[];
};
export function albumFileEvaluationOpen(dev: boolean, value = process.env.EXPO_PUBLIC_ALBUM_FILE_EVAL) { return dev && value === '1'; }
export function makeAlbumFile(snapshot: PrintManifest, files: AlbumFile['files'], dimensions: Record<string,{widthPx?: number; heightPx?: number}> = {}): AlbumFile {
  const records = snapshot.content.entries.map(record => ({
    note: record.note, feeling: record.feeling, ...(record.occurredAt ? {occurredAt: record.occurredAt} : {}),
    occurredAtPrecision: record.occurredAtPrecision, recordedAt: record.recordedAt,
    media: record.media.map(item => ({file: `media-${snapshot.media.findIndex(copy => copy.assetId === item.assetId)}.${item.role === 'image' ? 'png' : 'm4a'}`,
      role: item.role as 'image' | 'audio', durationMs: item.durationMs,
      ...(dimensions[item.assetId]?.widthPx ? {widthPx: dimensions[item.assetId].widthPx} : item.widthPx ? {widthPx: item.widthPx} : {}), ...(dimensions[item.assetId]?.heightPx ? {heightPx: dimensions[item.assetId].heightPx} : item.heightPx ? {heightPx: item.heightPx} : {})})),
  }));
  const cover = snapshot.content.album.cover;
  const record = cover.kind === 'image' ? snapshot.content.entries.findIndex(item => item.momentId === cover.momentId) : -1;
  const media = cover.kind === 'image' && record >= 0 ? snapshot.content.entries[record].media.findIndex(item => item.assetId === cover.assetId) : -1;
  return {format: 'lampy', version: 1, readingVersion: 1, layoutVersion: 'album-a5-v5', name: snapshot.name,
    opening: snapshot.content.album.opening, style: snapshot.style, createdAt: snapshot.createdAt,
    cover: record >= 0 && media >= 0 ? {record, media} : null,
    fonts: {policy: 'system-not-redistributed', serif: snapshot.fonts.serif.fontName, ui: snapshot.fonts.ui.fontName}, records, files};
}
function fail(): never { throw new Error('FILE_INVALID'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) fail(); }
function text(value: unknown, max = 200000): asserts value is string { if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) fail(); }
function number(value: unknown, min: number, max: number) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(); }
export function validateAlbumFile(raw: string, hashes: Record<string, string>): AlbumFile {
  if (utf8ToBytes(raw).length > ALBUM_FILE_LIMITS.jsonBytes) throw new Error('FILE_TOO_LARGE');
  const book = object(JSON.parse(raw));
  keys(book, ['format','version','readingVersion','layoutVersion','name','opening','style','createdAt','cover','fonts','records','files']);
  if (book.format !== 'lampy' || book.version !== 1 || book.readingVersion !== 1 || book.layoutVersion !== 'album-a5-v5') throw new Error('FILE_VERSION');
  text(book.name, 2000); if (book.opening !== null) text(book.opening);
  text(book.createdAt, 80); if (book.style !== 'plain' && book.style !== 'handmade') fail();
  const fonts = object(book.fonts); keys(fonts, ['policy','serif','ui']);
  if (fonts.policy !== 'system-not-redistributed') fail(); text(fonts.serif, 100); text(fonts.ui, 100);
  if (!Array.isArray(book.records) || !book.records.length || book.records.length > ALBUM_FILE_LIMITS.records || !Array.isArray(book.files) || !book.files.length || book.files.length > 511) fail();
  const files = new Map<string, string>(); let total = 0;
  for (const rawFile of book.files) {
    const item = object(rawFile); keys(item, ['name','sha256','bytes']); text(item.name, 80); text(item.sha256, 64);
    if (!/^(album\.pdf|media-[0-9]{1,4}\.(png|m4a))$/.test(item.name) || !/^[a-f0-9]{64}$/.test(item.sha256) || files.has(item.name)) fail();
    number(item.bytes, 1, ALBUM_FILE_LIMITS.bytes); if (!Number.isInteger(item.bytes)) fail(); total += item.bytes as number;
    if (hashes[item.name] !== item.sha256) throw new Error('FILE_CHANGED'); files.set(item.name, item.sha256);
  }
  if (total > ALBUM_FILE_LIMITS.bytes || !files.has('album.pdf') || Object.keys(hashes).length !== files.size) fail();
  const used = new Set(['album.pdf']);
  for (const rawRecord of book.records) {
    const record = object(rawRecord); keys(record,['note','feeling','occurredAt','occurredAtPrecision','recordedAt','media']);
    text(record.note); text(record.feeling,200); text(record.occurredAtPrecision,40); text(record.recordedAt,80);
    if (!['day','month','year','unknown','exact'].includes(record.occurredAtPrecision)) fail();
    if (record.occurredAt !== undefined) text(record.occurredAt,80);
    if (!Array.isArray(record.media) || record.media.length > 10) fail();
    for (const rawItem of record.media) {
      const item = object(rawItem); keys(item,['file','role','widthPx','heightPx','durationMs']); text(item.file,80);
      if ((item.role !== 'image' && item.role !== 'audio') || !files.has(item.file) || !item.file.endsWith(item.role === 'image' ? '.png' : '.m4a')) fail();
      if (item.widthPx !== undefined) number(item.widthPx,1,16000); if (item.heightPx !== undefined) number(item.heightPx,1,16000);
      if (item.durationMs !== null) number(item.durationMs,0,86400000); used.add(item.file);
    }
  }
  if (used.size !== files.size) fail();
  if (book.cover !== null) {
    const cover = object(book.cover); keys(cover,['record','media']); number(cover.record,0,book.records.length - 1);
    if (!Number.isInteger(cover.record) || !Number.isInteger(cover.media)) fail();
    const record = object(book.records[cover.record as number]); const media = record.media as unknown[];
    number(cover.media,0,media.length - 1); if (object(media[cover.media as number]).role !== 'image') fail();
  }
  return book as unknown as AlbumFile;
}
export function albumFileInput(book: AlbumFile, directory: string, sessionId: string): AlbumLayoutInput {
  const entries: AlbumLayoutRecordInput[] = book.records.map((record,index) => ({
    momentId: `${sessionId}-r${index}`, collectedAt: book.createdAt, sourceRevisionAtCollect: 1, presence: 'ready', revision: 1,
    note: record.note, feeling: record.feeling, occurredAt: record.occurredAt, occurredAtPrecision: record.occurredAtPrecision,
    recordedAt: record.recordedAt, media: record.media.map(item => ({...item, assetId: `${sessionId}-${item.file}`, uri: `${directory}${item.file}`,
      availability: 'available', intrinsicRatio: item.widthPx && item.heightPx ? item.widthPx / item.heightPx : null})),
  }));
  const cover = book.cover ? {kind: 'image' as const, momentId: entries[book.cover.record].momentId, assetId: entries[book.cover.record].media[book.cover.media].assetId} : {kind:'words' as const};
  return {album: {id: sessionId, schemaVersion: 1, name: book.name, opening: book.opening, cover, entries: [], createdAt: book.createdAt, updatedAt: book.createdAt}, entries};
}

export function albumFileFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const tokens = message.split(/[^A-Z0-9_]+/);
  return ['FILE_CANCELLED','FILE_CHANGED','FILE_VERSION','FILE_FONTS_UNAVAILABLE','FILE_NATIVE_REBUILD_REQUIRED','FILE_TOO_LARGE','FILE_NO_SPACE','FILE_MEDIA_INVALID','FILE_CLEANUP_FAILED','FILE_BUSY','FILE_SAVE_FAILED','FILE_INVALID'].find(code => tokens.includes(code)) ?? 'FILE_OPERATION_FAILED';
}
