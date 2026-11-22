import { strToU8, zipSync } from 'fflate';
import type { AlbumLayoutInput } from './album-layout-input';
import type { AlbumReadingStyle } from './album-reading';

export type EpubDesign = 'literary' | 'imagebook';
export function epubDesign(value?: unknown): EpubDesign {
  if (value == null) return 'literary'; // Editions predating the independent EPUB design.
  if (value === 'literary' || value === 'imagebook') return value;
  throw new Error('EPUB_INVALID_DESIGN');
}

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
  language: 'zh-Hans' | 'en'; design?: EpubDesign;
  /** Legacy manifests only; EPUB no longer inherits the in-app paper style. */
  style?: AlbumReadingStyle;
  dates: Record<string, { label: string; chapter: string }>;
};
export function albumEpubDocuments(options: AlbumEpubOptions): Record<string, Uint8Array> {
  const { input, assets, language, dates } = options;
  const design = epubDesign(options.design);
  if (!input.entries.length || input.entries.some(e => e.presence !== 'ready' || e.media.some(m => m.availability !== 'available' || !assets[m.assetId]))) throw new Error('EPUB_MISSING_CONTENT');
  const copy = EPUB_COPY[language];
  const files: Record<string, Uint8Array> = {};
  const manifest: string[] = []; const spine: string[] = []; const nav: string[] = [];
  const title = epubEscape(input.album.name);
  const page = (name: string, heading: string, body: string, properties = '') => {
    files[`OEBPS/${name}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}"><head><title>${epubEscape(heading)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body class="${design}">${body}</body></html>`);
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
  const firstChapter = dates[input.entries[0].momentId]?.chapter;
  const lastChapter = dates[input.entries[input.entries.length - 1].momentId]?.chapter;
  const range = firstChapter && lastChapter ? (firstChapter === lastChapter ? firstChapter : `${firstChapter} / ${lastChapter}`) : '';
  page('cover', input.album.name, `<section class="cover" epub:type="cover"><p class="cover-kicker">LAMPY / ${language === 'zh-Hans' ? '生活册' : 'A LIFE ALBUM'}</p>${coverPath ? `<figure class="cover-picture"><img src="${coverPath}" alt="${title}"/></figure>` : '<div class="cover-rule"></div>'}<div class="cover-copy"><h1 class="cover-title">${title}</h1><p class="cover-subtitle">${epubEscape(range || subtitle)}</p></div></section>`);
  if (input.album.opening) {
    page('opening', copy.opening, `<section class="opening" epub:type="preface"><h1 class="section-label">${copy.opening}</h1><div class="prose">${paragraphs(input.album.opening)}</div></section>`);
    nav.push(`<li><a href="opening.xhtml">${copy.opening}</a></li>`);
  }
  // One XHTML per consecutive month, not one forced page per record.
  // This preserves the chosen order while allowing short entries to share a page.
  let group: { name: string; heading: string; entries: string[] } | null = null;
  const flush = () => {
    if (group) page(group.name, group.heading, `<section class="chapter"><header class="chapter-head" epub:type="part"><p class="chapter-kicker">${language === 'zh-Hans' ? '日子里的记录' : 'MOMENTS IN THESE PAGES'}</p><h1 class="chapter-title">${epubEscape(group.heading)}</h1></header>${group.entries.join('')}</section>`);
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
    const compatible = (a: number, b: number) => {
      const x = ratio(a), y = ratio(b);
      return x != null && y != null && Number.isFinite(x) && Number.isFinite(y) &&
        x >= 0.6 && x <= 1.8 && y >= 0.6 && y <= 1.8 && Math.abs(x - y) <= 0.3;
    };
    const threePhotos = record.media.length === 3 && record.media.every(m => m.role === 'image');
    const mediaParts: string[] = [];
    for (let i = 0; i < record.media.length; i++) {
      const item = record.media[i], asset = assets[item.assetId];
      if (item.role === 'image') {
        const r = ratio(i), next = record.media[i + 1], nextRatio = next ? ratio(i + 1) : null;
        if (next?.role === 'image' && ((threePhotos && i === 1 && compatible(i, i + 1)) || (!threePhotos && r != null && nextRatio != null && r >= 0.6 && r <= 0.85 && nextRatio >= 0.6 && nextRatio <= 0.85))) {
          mediaParts.push(`<div class="photo-pair">${figure(i,true)}${figure(i + 1,true)}</div>`); i++;
        } else mediaParts.push(figure(i));
      } else if (item.role === 'audio') {
        const seconds = Math.max(0, Math.round((item.durationMs ?? 0) / 1000));
        mediaParts.push(`<aside class="sound"><p class="sound-label">${copy.listen}${item.durationMs == null ? '' : ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p><audio controls="controls" preload="none" src="${asset.path}">${copy.listen}</audio></aside>`);
      } else throw new Error('EPUB_UNSUPPORTED_MEDIA');
    }
    const feeling = record.feeling ? `<span class="feeling">${epubEscape(record.feeling)}</span>` : '';
    const end = index === input.entries.length - 1 ? `<footer class="colophon" epub:type="colophon"><p>${copy.edition} ${epubEscape(options.createdAt.slice(0,10))}<span class="imprint">Lampy</span></p></footer>` : '';
    const prose = record.note ? `<div class="prose">${paragraphs(record.note)}</div>` : '';
    // An image-led short entry may put its first image before the prose. All media
    // retain their original relative order, including audio. Long text stays continuous.
    const lead = design === 'imagebook' && record.note.length <= 220 && record.media[0]?.role === 'image'
      ? `<div class="entry-lead">${mediaParts.shift() ?? ''}</div>` : '';
    const kind = threePhotos ? ' three-photos' : record.note.length > 220 ? ' long-entry' : '';
    group.entries.push(`<article class="entry${kind}" id="entry-${index + 1}">${lead}<header class="entry-head"><p class="entry-meta"><span class="date">${epubEscape(date.label)}</span>${feeling}</p>${record.attribution ? `<p class="attribution">${epubEscape(record.attribution)}</p>` : ''}</header>${prose}<div class="entry-media">${mediaParts.join('')}</div></article>${end}`);
  });
  flush();
  page('nav', copy.contents, `<nav epub:type="toc" id="toc"><h1 class="section-label">${copy.contents}</h1><ol><li><a href="cover.xhtml">${title}</a></li>${nav.join('')}</ol></nav>`, 'nav');
  // The native Books contents menu exposes this navigation; no duplicate printed TOC page.
  spine.pop();
  files['OEBPS/style.css'] = strToU8(`
html,body{margin:0;padding:0;background:transparent}
body{font-family:"Songti SC","STSong",serif;font-size:1em;line-height:1.85}
h1,h2,h3,p,figure,ol{margin:0;padding:0}
h1,h2,h3{font-weight:normal;line-height:1.4;overflow-wrap:break-word}
p{orphans:2;widows:2;overflow-wrap:break-word}
.cover{padding:1.8em .8em 1em;page-break-after:always;break-after:page}
.cover-kicker{font-family:sans-serif;font-size:.6em;letter-spacing:.18em;margin:0 0 2em}
.cover-picture{margin:0 auto 1.8em;max-width:28em}
.cover-picture img{display:block;max-width:100%;width:100%;height:auto;margin:auto}
.cover h1.cover-title{font-size:1.8em;line-height:1.4;text-indent:0;margin:0 0 .6em}
.cover-subtitle{font-family:sans-serif;font-size:.7em;letter-spacing:.1em;margin:0 0 1em}
.cover-rule{width:2.5em;border-top:1px solid;margin:5em 0}
.opening{padding:3em 1em 0}
.section-label{font-family:sans-serif;font-size:.8em;letter-spacing:.08em;margin:0 0 2em}
.chapter{padding:0 .8em}
.chapter-head{padding:4em 0 3em;margin:0 0 2em;page-break-after:always;break-after:page}
.chapter-kicker{font-family:sans-serif;font-size:.6em;letter-spacing:.16em;margin:0 0 3em}
.chapter h1.chapter-title{font-size:2.5em;line-height:1.4;margin:0;text-indent:0}
.entry{margin:0 0 2.5em;padding:0;page-break-after:auto;break-after:auto}
.entry+.entry{border-top:1px solid #aab2a4;padding-top:1.8em}
.entry-head{margin:0 0 1.1em;page-break-after:avoid;break-after:avoid}
.entry-meta{font-family:sans-serif;font-size:.7em;line-height:1.7;letter-spacing:.05em}
.date{font-weight:normal}
.feeling{font-weight:normal;margin-left:1em;padding-left:1em;border-left:1px solid}
.attribution{font-family:sans-serif;font-size:.7em;margin:.4em 0 0}
.prose{font-size:1em;line-height:1.85;text-align:left}
.prose p{margin:0 0 1em;text-indent:0}
.entry-media{margin:1.2em 0 0}
.photo{margin:1.1em auto;page-break-inside:avoid;break-inside:avoid}
.photo img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto}
.photo.portrait{width:86%;max-width:24em}
.photo-pair{display:table;table-layout:fixed;width:100%;margin:1em 0;page-break-inside:avoid;break-inside:avoid}
.photo.paired{display:table-cell;width:50%;padding:0 .25em;vertical-align:middle}
.sound{border-top:1px solid;border-bottom:1px solid;margin:1.5em 0;padding:1em 0;page-break-inside:avoid;break-inside:avoid}
.sound-label{font-family:sans-serif;font-size:.8em;margin:0 0 .7em}
audio{width:100%;max-width:100%}
.colophon{margin:2.5em 0 0;padding:1em 0 0;border-top:1px solid #aab2a4}
.colophon p{font-family:sans-serif;font-size:.65em;line-height:1.7;text-align:left}
.imprint{margin-left:1em}
.imagebook .cover{padding:1em .3em}
.imagebook .cover-picture{max-width:none;margin-bottom:1.2em}
.imagebook .cover-copy{padding:0 .5em}
.imagebook .cover h1.cover-title{font-size:2em}
.imagebook .chapter-head{background:#354b3e;color:#f5f2e7;padding:3em 1em;margin:0 -.8em 2em}
.imagebook .chapter-head .chapter-title{font-size:3em;color:#f5f2e7}
.imagebook .chapter-head .chapter-kicker{color:#d2dac8}
.imagebook .entry-lead{margin:0 0 1.5em}
.imagebook .entry-lead .photo{width:100%;max-width:none;margin-top:0}
.imagebook .entry-lead .photo-pair{margin-top:0}
.imagebook .photo.portrait{width:94%;max-width:28em}
.imagebook .photo.paired{padding:0 .15em}
.imagebook .long-entry .prose{margin:0 .5em;line-height:1.95}
.imagebook .entry-media{margin-top:.8em}
nav{padding:1em .5em}nav ol{list-style:none}nav li{margin:.8em 0;font-size:.9em}a{color:inherit;text-decoration:none}
@media screen and (max-width:360px){.photo-pair{display:block}.photo.paired{display:block;width:100%;padding:0;margin:1em auto}}
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
