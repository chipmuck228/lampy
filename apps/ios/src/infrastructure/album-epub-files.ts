import { File } from 'expo-file-system';
import * as FS from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { albumPrintNative } from '../../modules/lampy-album-layout';
import { buildAlbumEpub, EPUB_COPY, type EpubAsset } from '../application/album-epub';
import { manifestDigest, type PrintManifest } from '../application/album-print';
import { appLanguage, dateLabel } from '../i18n';
import { albumExportAccess } from './album-export-purchases';

const LIMIT = 64 * 1024 * 1024;
function editionDirectory(id: string) {
  if (!/^print_[a-zA-Z0-9_-]{1,94}$/.test(id) || !FS.documentDirectory) throw new Error('EPUB_INVALID_EDITION');
  return `${FS.documentDirectory}album-print-evaluation/${id}/`;
}
/** Export from immutable edition copies, never re-read the changing personal library. */
export async function shareAlbumEpub(id: string, current: () => boolean) {
  const check = () => { if (!current()) throw new Error('CANCELLED'); };
  check();
  const dir = editionDirectory(id);
  const temporary: string[] = [];
  // One owner per edition, even if two mounted screens race.
  if (working.has(id)) throw new Error('EPUB_BUSY');
  working.add(id);
  try {
    const manifest: PrintManifest = JSON.parse(await FS.readAsStringAsync(`${dir}manifest.json`));
    const digest = await FS.readAsStringAsync(`${dir}manifest.sha256`);
    check();
    if (manifest.id !== id || manifest.version !== 1 || manifestDigest(manifest) !== digest) throw new Error('PRINT_FILE_CHANGED');
    const uri = `${dir}album-${appLanguage}.epub`;
    const digestUri = `${uri}.sha256`;
    // Previously made files stay shareable; only new generation requires current export rights.
    if ((await FS.getInfoAsync(uri)).exists && (await FS.getInfoAsync(digestUri)).exists) {
      const expected = await FS.readAsStringAsync(digestUri);
      if ((await albumPrintNative().printFileDigest(uri)).sha256 !== expected) throw new Error('PRINT_FILE_CHANGED');
      check(); return await albumPrintNative().sharePrintPdf(uri);
    }
    await albumExportAccess.assert(current); check();
    if (manifest.media.reduce((sum, m) => sum + m.bytes, 0) > LIMIT) throw new Error('EPUB_TOO_LARGE');
    const assets: Record<string, EpubAsset> = {};
    let total = 0;
    for (const entry of manifest.content.entries) for (const media of entry.media) {
      if (assets[media.assetId]) continue;
      const frozen = manifest.media.find(m => m.assetId === media.assetId);
      if (!frozen || !/^media-\d+$/.test(frozen.file)) throw new Error('EPUB_MISSING_CONTENT');
      const source = `${dir}${frozen.file}`;
      const actual = await albumPrintNative().printFileDigest(source); check();
      if (actual.sha256 !== frozen.sha256 || actual.bytes !== frozen.bytes) throw new Error('PRINT_FILE_CHANGED');
      let data: Uint8Array; let mime: string; let extension: string;
      if (media.role === 'image') {
        // Native decoding handles HEIF and orientation. PNG retains transparency; no system font files are embedded.
        const image = await manipulateAsync(source, [{ resize: { width: Math.min(media.widthPx || 2048, 2048) } }], { format: SaveFormat.PNG });
        temporary.push(image.uri); check();
        const info = await FS.getInfoAsync(image.uri);
        if (!info.exists || info.size > LIMIT - total) throw new Error('EPUB_TOO_LARGE');
        data = await new File(image.uri).bytes(); mime = 'image/png'; extension = 'png';
      } else if (media.role === 'audio') {
        data = await new File(source).bytes();
        const format = epubAudioFormat(data); mime = format.mime; extension = format.extension;
      } else throw new Error('EPUB_UNSUPPORTED_MEDIA');
      check(); total += data.length;
      if (total > LIMIT) throw new Error('EPUB_TOO_LARGE');
      assets[media.assetId] = { path: `media/asset-${Object.keys(assets).length}.${extension}`, mime, bytes: data };
    }
    const dates: Record<string, { label: string; chapter: string }> = {};
    for (const page of manifest.layout.pages) for (const block of page.blocks) if (block.kind === 'day-rule') {
      const match = /^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(block.dateKey);
      dates[block.momentId] = { label: block.text, chapter: match ? (match[3] ? dateLabel(Number(match[2]), Number(match[3])) : match[2]) : EPUB_COPY[appLanguage].unknown };
    }
    check();
    const archive = buildAlbumEpub({ input: manifest.content, assets, dates, id: `${id}-${appLanguage}`, createdAt: manifest.createdAt, style: manifest.style, language: appLanguage });
    check();
    const part = `${uri}.partial`; temporary.push(part);
    new File(part).write(archive);
    const hash = bytesToHex(sha256(archive));
    if ((await albumPrintNative().printFileDigest(part)).sha256 !== hash) throw new Error('PRINT_FILE_CHANGED');
    await albumExportAccess.assert(current); check();
    await FS.moveAsync({ from: part, to: uri });
    try {
      await FS.writeAsStringAsync(digestUri, hash); check();
    } catch (error) {
      await FS.deleteAsync(uri, { idempotent: true });
      await FS.deleteAsync(digestUri, { idempotent: true });
      throw error;
    }
    return await albumPrintNative().sharePrintPdf(uri);
  } finally {
    await Promise.allSettled(temporary.map(uri => FS.deleteAsync(uri, { idempotent: true })));
    working.delete(id);
  }
}
const working = new Set<string>();
export function epubAudioFormat(bytes: Uint8Array) {
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return { mime: 'audio/mp4', extension: 'm4a' };
  if (String.fromCharCode(...bytes.slice(0, 3)) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)) return { mime: 'audio/mpeg', extension: 'mp3' };
  throw new Error('EPUB_UNSUPPORTED_AUDIO');
}
