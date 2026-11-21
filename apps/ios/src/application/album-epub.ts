import { strToU8, zipSync } from 'fflate';
import type { AlbumLayoutInput } from './album-layout-input';
import type { AlbumReadingStyle } from './album-reading';

export type EpubResource = { path: string; mime: string };
export type EpubAsset = EpubResource & { bytes: Uint8Array };
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
export type AlbumEpubOptions = {
  input: AlbumLayoutInput; assets: Record<string, EpubResource>; id: string; createdAt: string;
  language: 'zh-Hans' | 'en'; style: AlbumReadingStyle;
  dates: Record<string, { label: string; chapter: string }>;
};
export function albumEpubDocuments(options: AlbumEpubOptions): Record<string, Uint8Array> {
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
    used.add(asset.path);
    manifest.push(`<item id="asset-${used.size}" href="${asset.path}" media-type="${asset.mime}"${asset.path === coverPath ? ' properties="cover-image"' : ''}/>`);
  }
  const subtitle = language === 'zh-Hans' ? `${input.entries.length} 条生活记录` : `${input.entries.length} moments`;
  page('cover', input.album.name, `<section class="cover" epub:type="cover"><p class="cover-kicker">${language === 'zh-Hans' ? '生活册' : 'A LIFE ALBUM'}</p><h1 class="cover-title">${title}</h1><p class="cover-subtitle">${subtitle}</p>${coverPath ? `<figure class="cover-picture"><img src="${coverPath}" alt="${title}"/></figure>` : '<div class="cover-rule"></div>'}<p class="cover-imprint">LAMPY</p></section>`);
  if (input.album.opening) {
    page('opening', copy.opening, `<section class="opening" epub:type="preface"><h1 class="section-label">${copy.opening}</h1><div class="prose">${paragraphs(input.album.opening)}</div></section>`);
    nav.push(`<li><a href="opening.xhtml">${copy.opening}</a></li>`);
  }
  // One XHTML per consecutive month, not one forced page per record.
  // This preserves the chosen order while allowing short entries to share a page.
  let group: { name: string; heading: string; entries: string[] } | null = null;
  const flush = () => {
    if (group) page(group.name, group.heading, `<section class="chapter"><header class="chapter-head"><h1 class="chapter-title">${epubEscape(group.heading)}</h1></header>${group.entries.join('')}</section>`);
  };
  input.entries.forEach((record, index) => {
    const date = dates[record.momentId] ?? { label: copy.unknown, chapter: copy.unknown };
    if (!group || group.heading !== date.chapter) {
      flush(); group = { name: `record-${index + 1}`, heading: date.chapter, entries: [] };
      nav.push(`<li><a href="${group.name}.xhtml">${epubEscape(date.chapter)}</a></li>`);
    }
    const ratio = (i: number) => {
      const media = record.media[i];
      return media.intrinsicRatio ?? (media.widthPx && media.heightPx ? media.widthPx / media.heightPx : null);
    };
    const figure = (i: number, paired = false) => {
      const media = record.media[i], asset = assets[media.assetId];
      const portrait = ratio(i) != null && ratio(i)! < 0.85;
      return `<figure class="photo${paired ? ' paired' : portrait ? ' portrait' : ' landscape'}"><img src="${asset.path}" alt="${copy.photo} ${i + 1}"/></figure>`;
    };
    const mediaParts: string[] = [];
    for (let i = 0; i < record.media.length; i++) {
      const item = record.media[i], asset = assets[item.assetId];
      if (item.role === 'image') {
        const r = ratio(i), next = record.media[i + 1], nextRatio = next ? ratio(i + 1) : null;
        if (next?.role === 'image' && r != null && nextRatio != null && r >= 0.6 && r <= 0.85 && nextRatio >= 0.6 && nextRatio <= 0.85) {
          mediaParts.push(`<div class="photo-pair">${figure(i,true)}${figure(i + 1,true)}</div>`); i++;
        } else mediaParts.push(figure(i));
      } else if (item.role === 'audio') {
        const seconds = Math.max(0, Math.round((item.durationMs ?? 0) / 1000));
        mediaParts.push(`<aside class="sound"><p class="sound-label">${copy.listen}${item.durationMs == null ? '' : ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p><audio controls="controls" preload="none" src="${asset.path}">${copy.listen}</audio></aside>`);
      } else throw new Error('EPUB_UNSUPPORTED_MEDIA');
    }
    const feeling = record.feeling ? `<span class="feeling">${epubEscape(record.feeling)}</span>` : '';
    const end = index === input.entries.length - 1 ? `<footer class="colophon" epub:type="colophon"><p>${copy.edition} ${epubEscape(options.createdAt.slice(0,10))}<span class="imprint">Lampy</span></p></footer>` : '';
    group.entries.push(`<article class="entry" id="entry-${index + 1}"><header class="entry-head"><p class="entry-meta"><span class="date">${epubEscape(date.label)}</span>${feeling}</p>${record.attribution ? `<p class="attribution">${epubEscape(record.attribution)}</p>` : ''}</header>${record.note ? `<div class="prose">${paragraphs(record.note)}</div>` : ''}<div class="entry-media">${mediaParts.join('')}</div></article>${end}`);
  });
  flush();
  page('nav', copy.contents, `<nav epub:type="toc" id="toc"><h1 class="section-label">${copy.contents}</h1><ol><li><a href="cover.xhtml">${title}</a></li>${nav.join('')}</ol></nav>`, 'nav');
  // The native Books contents menu exposes this navigation; no duplicate printed TOC page.
  spine.pop();
  files['OEBPS/style.css'] = strToU8(`
html,body{margin:0;padding:0;background:transparent}
body{font-family:"Songti SC","STSong",serif;font-size:1em;line-height:1.65}
h1,h2,h3,p,figure,ol{margin:0;padding:0}
h1,h2,h3{font-weight:normal;line-height:1.35}
p{orphans:2;widows:2;overflow-wrap:break-word}
.cover{padding:2em .65em 1em;text-align:center;page-break-after:always;break-after:page}
.cover .cover-kicker{font-family:sans-serif;font-size:.65em;letter-spacing:.2em;text-align:center;color:#657365;margin:0 0 1.1em}
.cover h1.cover-title{font-size:1.7em;font-weight:normal;line-height:1.35;text-align:center;text-indent:0;margin:0 auto .45em;max-width:12em;overflow-wrap:break-word}
.cover .cover-subtitle{font-family:sans-serif;font-size:.7em;text-align:center;color:#657365;margin:0 0 1.8em}
.cover-picture{margin:0 auto;max-width:28em}
.cover-picture img{display:block;width:100%;height:auto;max-width:100%;margin:0 auto}
.cover .cover-imprint{font-family:sans-serif;font-size:.6em;letter-spacing:.25em;text-align:center;color:#657365;margin:1.8em 0 0}
.cover-rule{width:2.5em;border-top:1px solid #899584;margin:3em auto}
.opening{padding:2.1em .5em 0}
.section-label{font-family:sans-serif;font-size:.85em;letter-spacing:.08em;margin:0 0 1.5em;text-align:left;color:#657365}
.chapter{padding:0 .35em}
.chapter-head{margin:1.3em 0 1.7em;padding:0 0 .65em;border-bottom:1px solid #aab2a4;page-break-after:avoid;break-after:avoid}
.chapter h1.chapter-title{font-size:1.2em;line-height:1.4;margin:0;text-align:left;text-indent:0}
.entry{margin:0 0 1.8em;padding:0;page-break-after:auto;break-after:auto}
.entry+.entry{border-top:1px solid #d9ddd5;padding-top:1.15em}
.entry-head{margin:0 0 .65em;page-break-after:avoid;break-after:avoid}
.entry-meta{font-family:sans-serif;font-size:.72em;line-height:1.6;text-align:left;color:#657365}
.date{font-weight:normal}
.feeling{font-weight:normal;margin-left:.9em;padding-left:.9em;border-left:1px solid #aab2a4}
.attribution{font-family:sans-serif;font-size:.72em;margin:.3em 0 0;color:#657365}
.prose{font-size:1em;line-height:1.65;text-align:left}
.prose p{margin:0 0 .65em;text-indent:0}
.entry-media{margin:.85em 0 0}
.photo{margin:1em auto;page-break-inside:avoid;break-inside:avoid}
.photo img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto}
.photo.portrait{width:82%;max-width:22em}
.photo-pair{display:table;table-layout:fixed;width:100%;margin:1em 0;page-break-inside:avoid;break-inside:avoid}
.photo.paired{display:table-cell;width:50%;padding:0 .2em;vertical-align:middle}
.handmade .photo img{box-sizing:border-box;padding:.3em;border:1px solid #cbd1c5}
.sound{border-top:1px solid #aab2a4;margin:1.1em 0;padding:.65em 0;page-break-inside:avoid;break-inside:avoid}
.sound-label{font-family:sans-serif;font-size:.75em;margin:0 0 .5em;color:#657365}
audio{width:100%;max-width:100%}
.colophon{margin:2.5em 0 0;padding:.8em 0 0;border-top:1px solid #d9ddd5}
.colophon p{font-family:sans-serif;font-size:.65em;line-height:1.6;color:#657365;text-align:left}
.imprint{margin-left:1em}
nav{padding:1em .5em}nav ol{list-style:none}nav li{margin:.7em 0;font-size:.9em}a{color:inherit;text-decoration:none}
`);
  files['OEBPS/package.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:lampy:edition:${epubEscape(options.id)}</dc:identifier><dc:title>${title}</dc:title><dc:language>${language}</dc:language><meta property="dcterms:modified">${new Date(options.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta><meta property="rendition:layout">reflowable</meta></metadata><manifest><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  files['META-INF/container.xml'] = strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  return { mimetype: strToU8('application/epub+zip'), ...files };
}

/** Small fixture/reference writer. Device exports use chunked streaming, never this buffer. */
export function buildAlbumEpub(options: Omit<AlbumEpubOptions, 'assets'> & { assets: Record<string, EpubAsset> }): Uint8Array {
  const files = albumEpubDocuments(options);
  for (const asset of Object.values(options.assets)) files[`OEBPS/${asset.path}`] = asset.bytes;
  return zipSync({ mimetype: [files.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'mimetype')) }, { level: 0 });
}
