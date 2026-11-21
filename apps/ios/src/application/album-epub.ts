import { strToU8, zipSync } from 'fflate';
import type { AlbumLayoutInput } from './album-layout-input';
import type { AlbumReadingStyle } from './album-reading';

export type EpubAsset = { path: string; mime: string; bytes: Uint8Array };
export type EpubCopy = { contents: string; opening: string; closing: string; listen: string; unknown: string; edition: string; photo: string };
export const EPUB_COPY = {
  'zh-Hans': { contents: '这一册', opening: '开篇', closing: '留在这一册里', listen: '听听当时的声音', unknown: '日子未确认', edition: '制作于', photo: '记录中的照片' },
  en: { contents: 'In this album', opening: 'Opening words', closing: 'Kept in these pages', listen: 'Listen to this moment', unknown: 'Date uncertain', edition: 'Made on', photo: 'Photo from this moment' },
};
export function epubEscape(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}
const paragraphs = (value: string) => value.split(/\r?\n/).map(line => `<p>${epubEscape(line) || '<br/>'}</p>`).join('');

/** A portable, offline publication. No source IDs, private paths, JavaScript or remote URLs. */
export function buildAlbumEpub(options: {
  input: AlbumLayoutInput; assets: Record<string, EpubAsset>; id: string; createdAt: string;
  language: 'zh-Hans' | 'en'; style: AlbumReadingStyle;
  dates: Record<string, { label: string; chapter: string }>;
}): Uint8Array {
  const { input, assets, language, style, dates } = options;
  if (!input.entries.length || input.entries.some(e => e.presence !== 'ready' || e.media.some(m => m.availability !== 'available' || !assets[m.assetId]))) throw new Error('EPUB_MISSING_CONTENT');
  const copy = EPUB_COPY[language];
  const files: Record<string, Uint8Array> = {};
  const manifest: string[] = []; const spine: string[] = []; const nav: string[] = [];
  const title = epubEscape(input.album.name);
  const page = (name: string, heading: string, body: string, properties = '') => {
    files[`OEBPS/${name}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}"><head><title>${epubEscape(heading)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body class="${style}">${body}</body></html>`);
    manifest.push(`<item id="${name}" href="${name}.xhtml" media-type="application/xhtml+xml"${properties ? ` properties="${properties}"` : ''}/>`);
    spine.push(`<itemref idref="${name}"/>`);
  };
  const used = new Set<string>();
  let coverPath = '';
  if (input.album.cover.kind === 'image') {
    const cover = input.album.cover;
    const record = input.entries.find(e => e.momentId === cover.momentId);
    if (!record?.media.some(m => m.assetId === cover.assetId && m.role === 'image') || !assets[cover.assetId]) throw new Error('EPUB_MISSING_COVER');
    coverPath = assets[cover.assetId].path;
  }
  for (const record of input.entries) for (const media of record.media) {
    const asset = assets[media.assetId];
    if (!/^media\/[a-z0-9-]+\.(png|jpg|m4a|mp3|wav)$/.test(asset.path)) throw new Error('EPUB_INVALID_ASSET');
    if (used.has(asset.path)) continue;
    used.add(asset.path); files[`OEBPS/${asset.path}`] = asset.bytes;
    manifest.push(`<item id="asset-${used.size}" href="${asset.path}" media-type="${asset.mime}"${asset.path === coverPath ? ' properties="cover-image"' : ''}/>`);
  }
  page('cover', input.album.name, `<section class="cover" epub:type="cover"><p class="eyebrow">LAMPY</p>${coverPath ? `<img class="cover-photo" src="${coverPath}" alt="${title}"/>` : '<div class="cover-rule"></div>'}<h1>${title}</h1></section>`);
  page('title', input.album.name, `<section class="title-page" epub:type="titlepage"><p class="eyebrow">LAMPY</p><h1>${title}</h1><p class="meta">${copy.edition} ${epubEscape(options.createdAt.slice(0, 10))}</p></section>`);
  if (input.album.opening) { page('opening', copy.opening, `<section epub:type="preface"><h1>${copy.opening}</h1>${paragraphs(input.album.opening)}</section>`); nav.push(`<li><a href="opening.xhtml">${copy.opening}</a></li>`); }
  // Consecutive date sections only: never sort or regroup the user's chosen order.
  let previous = ''; let chapterNumber = 0;
  input.entries.forEach((record, index) => {
    const date = dates[record.momentId] ?? { label: copy.unknown, chapter: copy.unknown };
    const chapter = date.chapter;
    const begins = index === 0 || chapter !== previous; previous = chapter;
    const name = `record-${index + 1}`;
    if (begins) { chapterNumber++; nav.push(`<li><a href="${name}.xhtml">${epubEscape(chapter)}</a></li>`); }
    const media = record.media.map((item, i) => {
      const asset = assets[item.assetId];
      if (item.role === 'image') return `<figure><img src="${asset.path}" alt="${copy.photo} ${i + 1}"/></figure>`;
      if (item.role !== 'audio') throw new Error('EPUB_UNSUPPORTED_MEDIA');
      const seconds = Math.max(0, Math.round((item.durationMs ?? 0) / 1000));
      return `<aside class="sound"><p>${copy.listen}${item.durationMs == null ? '' : ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p><audio controls="controls" preload="none" src="${asset.path}">${copy.listen}</audio></aside>`;
    }).join('');
    page(name, date.label, `<article>${begins ? `<header class="chapter"><p class="eyebrow">${String(chapterNumber).padStart(2, '0')}</p><h1>${epubEscape(chapter)}</h1></header>` : ''}<h2 class="date">${epubEscape(date.label)}</h2>${record.attribution ? `<p class="meta">${epubEscape(record.attribution)}</p>` : ''}${paragraphs(record.note)}${record.feeling ? `<p class="feeling">${epubEscape(record.feeling)}</p>` : ''}${media}</article>`);
  });
  page('closing', copy.closing, `<section class="title-page" epub:type="colophon"><div class="cover-rule"></div><h1>${copy.closing}</h1><p>${title}</p><p class="meta">${copy.edition} ${epubEscape(options.createdAt.slice(0, 10))}</p></section>`);
  page('nav', copy.contents, `<nav epub:type="toc" id="toc"><h1>${copy.contents}</h1><ol><li><a href="cover.xhtml">${title}</a></li>${nav.join('')}<li><a href="closing.xhtml">${copy.closing}</a></li></ol></nav>`, 'nav');
  // Move the navigable contents between title/opening and records in reading order.
  const navRef = spine.pop()!; spine.splice(input.album.opening ? 3 : 2, 0, navRef);
  files['OEBPS/style.css'] = strToU8(`body{font-family:serif;line-height:1.85;margin:5%;color:#292d29;background:#f6f0e3}body.handmade{background:#f3ecdc}h1{font-size:1.8em;line-height:1.45;font-weight:normal}h2.date,.meta,.eyebrow{font-family:sans-serif;font-size:.85em;color:#546353}.eyebrow{letter-spacing:.18em}.title-page,.cover{text-align:center;padding:12% 0;break-after:page}.cover-photo{max-height:65vh;max-width:100%;object-fit:contain}.cover-rule{width:3em;border-top:1px solid #71816a;margin:3em auto}.chapter{padding:2em 0 1em;break-before:page}.date{margin-top:2em}p{orphans:2;widows:2;overflow-wrap:break-word}figure{margin:1.6em 0;break-inside:avoid}img{display:block;max-width:100%;height:auto;margin:auto}.handmade figure{padding:.5em;background:#fffaf0;border:1px solid #dfd6c5}audio{max-width:100%;width:100%}.sound{border-top:1px solid #a7b19f;padding:.5em 0;margin:1.6em 0;break-inside:avoid}.sound p,.feeling{color:#40564a}.feeling{font-size:.9em}ol{padding-left:1.5em}li{margin:.8em 0}a{color:inherit}article{break-after:page}`);
  files['OEBPS/package.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:lampy:edition:${epubEscape(options.id)}</dc:identifier><dc:title>${title}</dc:title><dc:language>${language}</dc:language><meta property="dcterms:modified">${new Date(options.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta><meta property="rendition:layout">reflowable</meta></metadata><manifest><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  files['META-INF/container.xml'] = strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > 64 * 1024 * 1024) throw new Error('EPUB_TOO_LARGE');
  // EPUB requires this exact, first, uncompressed entry, without a BOM.
  return zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], ...files }, { level: 0 });
}
