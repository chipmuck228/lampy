import {selectBookCover,bookDateRange,LAMPY_PUBLICATION_SYMBOL} from './album-book-plan';
import {imagebookPages,IMAGEBOOK_CSS} from './album-imagebook';
import {ALBUM_PUBLICATION_CSS} from './album-publication-css';
import {photoRatio,photoComposition,PUBLICATION_COPY,PUBLICATION_OPENING} from './album-publication';
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
    files[`OEBPS/${name}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}"><head><meta charset="utf-8"/>${design==='imagebook'?'<meta name="viewport" content="width=1200, height=900"/>':''}<title>${epubEscape(heading)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body class="${design}">${body}</body></html>`);
    manifest.push(`<item id="${name}" href="${name}.xhtml" media-type="application/xhtml+xml"${properties ? ` properties="${properties}"` : ''}/>`);
    spine.push(`<itemref idref="${name}"/>`);
  };
  const used = new Set<string>();
  let coverPath = selectBookCover(options);
  files['OEBPS/lampy-symbol.svg']=strToU8(LAMPY_PUBLICATION_SYMBOL);
  manifest.push('<item id="lampy-symbol" href="lampy-symbol.svg" media-type="image/svg+xml"/>');
  if (input.album.cover.kind === 'image') {
    const cover = input.album.cover;
    const record = input.entries.find(e => e.momentId === cover.momentId);
    if (!record?.media.some(m => m.assetId === cover.assetId && m.role === 'image') || !assets[cover.assetId]) throw new Error('EPUB_MISSING_COVER');
    coverPath = assets[cover.assetId].path;
  }
  for (const record of input.entries) for (const media of record.media) {
    const asset = assets[media.assetId];
    const extension=/^media\/[a-z0-9-]+\.(png|jpg|m4a|mp3)$/.exec(asset.path)?.[1];
    const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',m4a:'audio/mp4',mp3:'audio/mpeg'};
    if(!extension||types[extension]!==asset.mime||(media.role==='image'&&!asset.mime.startsWith('image/'))||(media.role==='audio'&&!asset.mime.startsWith('audio/')))throw new Error('EPUB_INVALID_ASSET');
    if (used.has(asset.path)) continue;
    used.add(asset.path);
    manifest.push(`<item id="asset-${used.size}" href="${asset.path}" media-type="${asset.mime}"${asset.path === coverPath ? ' properties="cover-image"' : ''}/>`);
  }
  if(design==='imagebook'){
    for(const leaf of imagebookPages(options,coverPath,epubEscape)){
      page(leaf.name,leaf.title,leaf.body);
      if(leaf.nav)nav.push(`<li><a href="${leaf.name}.xhtml">${epubEscape(leaf.title)}</a></li>`);
    }
  }else{
  page('cover', input.album.name, `<section class="cover${coverPath?' with-image':''}" epub:type="cover">${coverPath ? `<figure class="cover-picture"><img src="${coverPath}" alt="${title}"/></figure>` : '<figure class="cover-picture default-cover-picture"><img src="lampy-symbol.svg" alt=""/></figure>'}<div class="cover-copy"><p class="cover-kicker">LAMPY</p><h1 class="cover-title">${title}</h1></div></section>`);
  const publication=PUBLICATION_COPY[language];
  const opening=input.album.opening?.trim()?input.album.opening:PUBLICATION_OPENING[language];
  page('opening', copy.opening, `<section class="opening" epub:type="preface"><div class="prose">${paragraphs(opening)}</div></section>`);
  nav.push(`<li><a href="opening.xhtml">${copy.opening}</a></li>`);
  // One XHTML per consecutive month, not one forced page per record.
  // This preserves the chosen order while allowing short entries to share a page.
  let group: { name: string; heading: string; entries: string[] } | null = null;
  const flush = () => {
    if (group) page(group.name, group.heading, `<section class="chapter"><header class="chapter-head" epub:type="part"><h1 class="chapter-title">${epubEscape(group.heading)}</h1></header>${group.entries.join('')}</section>`,group.entries.some(entry=>entry.includes('<svg'))?'svg':'');
  };
  input.entries.forEach((record, index) => {
    const date = dates[record.momentId] ?? { label: copy.unknown, chapter: copy.unknown };
    if (!group || group.heading !== date.chapter) {
      flush(); group = { name: `record-${index + 1}`, heading: date.chapter, entries: [] };
      nav.push(`<li><a href="${group.name}.xhtml">${epubEscape(date.chapter)}</a></li>`);
    }
    const ratio=(i:number)=>photoRatio(record.media[i]);
    const photoIndices=record.media.flatMap((m,i)=>m.role==='image'?[i]:[]);
    const figure=(i:number,paired=false)=>{
      const media=record.media[i],asset=assets[media.assetId],r=ratio(i);
      const orientation=r==null?'unknown':r<.85?'portrait':r>1.2?'landscape':'square';
      return `<figure class="photo ${orientation}${paired?' paired':''}"><img src="${asset.path}" alt="${copy.photo} ${photoIndices.indexOf(i)+1}"/></figure>`;
    };
    const threePhotos=photoIndices.length===3;
    const mediaParts:string[]=[];
    for(let i=0;i<record.media.length;i++){
      const item=record.media[i],asset=assets[item.assetId];
      if(item.role==='image'){
        const run:number[]=[];for(let j=i;j<record.media.length&&record.media[j].role==='image';j++)run.push(j);
        const composition=photoComposition(run.slice(0,4).map(ratio));
        if(composition==='contact'||composition==='triptych'){
          const count=composition==='contact'?4:3;
          const photos=run.slice(0,count).map(j=>figure(j));
          const body=composition==='triptych'?`<div class="photo-main">${photos[0]}</div><div class="photo-stack">${photos.slice(1).join('')}</div>`:`<div class="photo-row">${photos.slice(0,2).join('')}</div><div class="photo-row">${photos.slice(2).join('')}</div>`;
          mediaParts.push(`<div class="photo-composition ${composition}">${body}</div>`);i+=count-1;
        }else if(composition==='diptych'){
          mediaParts.push(`<div class="photo-pair">${figure(i,true)}${figure(i+1,true)}</div>`);i++;
        }else if(run.length===3&&ratio(i+1)!=null&&ratio(i+2)!=null&&Math.abs(ratio(i+1)!-ratio(i+2)!)<=.3&&ratio(i+1)!>=.6&&ratio(i+2)!>=.6&&ratio(i+1)!<=1.8&&ratio(i+2)!<=1.8){
          mediaParts.push(figure(i),`<div class="photo-pair">${figure(i+1,true)}${figure(i+2,true)}</div>`);i+=2;
        }else mediaParts.push(figure(i));
      }else if(item.role==='audio'){
        const seconds=item.durationMs!=null&&Number.isFinite(item.durationMs)?Math.max(0,Math.round(item.durationMs/1000)):null;
        mediaParts.push(`<aside class="sound"><div class="sound-heading"><svg xmlns="http://www.w3.org/2000/svg" class="sound-mark" viewBox="0 0 48 32" aria-hidden="true" focusable="false"><path d="M4 14v4m8-12v20m8-24v28m8-22v16m8-12v8m8-10v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><p class="sound-label">${copy.listen}${seconds==null?'':` · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</p></div><audio controls="controls" preload="none" src="${asset.path}">${publication.audioFallback}</audio><p class="sound-fallback">${publication.audioFallback}</p></aside>`);
      }else throw new Error('EPUB_UNSUPPORTED_MEDIA');
    }
    const feeling = record.feeling ? `<span class="feeling">${epubEscape(record.feeling)}</span>` : '';
    const prose = record.note ? `<div class="prose">${paragraphs(record.note)}</div>` : '';
    // An image-led short entry may put its first image before the prose. All media
    // retain their original relative order, including audio. Long text stays continuous.
    const lead = '';
    const kind = threePhotos ? ' three-photos' : record.note.length > 220 ? ' long-entry' : '';
    group.entries.push(`<article class="entry${kind}" id="entry-${index + 1}"><header class="entry-head"><p class="entry-meta"><span class="date">${epubEscape(date.label)}</span>${feeling}</p>${record.attribution ? `<p class="attribution">${epubEscape(record.attribution)}</p>` : ''}</header>${lead}${prose}<div class="entry-media">${mediaParts.join('')}</div></article>`);
  });
  flush();
  const notes=language==='zh-Hans'?'Lampy · 留存':'Lampy · Colophon';
  page('archive',notes,`<section class="edition-notes" epub:type="colophon"><img class="edition-symbol" src="lampy-symbol.svg" alt="Lampy"/><p class="edition-brand">Lampy</p><p>${title}</p><p>${epubEscape(bookDateRange(options))}</p><p class="made">${language==='zh-Hans'?'珍藏于':'Kept on'} ${epubEscape(options.createdAt.slice(0,10))}</p></section>`);
  nav.push(`<li><a href="archive.xhtml">${notes}</a></li>`);
  }
  page('nav' , copy.contents, `<nav epub:type="toc" id="toc"><h1 class="section-label">${copy.contents}</h1><ol><li><a href="cover.xhtml">${title}</a></li>${nav.join('')}</ol></nav>`, 'nav');
  // The native Books contents menu exposes this navigation; no duplicate printed TOC page.
  spine.pop();
  files['OEBPS/style.css'] = strToU8(design==='imagebook'?IMAGEBOOK_CSS:ALBUM_PUBLICATION_CSS);
  files['OEBPS/package.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:lampy:edition:${epubEscape(options.id)}</dc:identifier><dc:title>${title}</dc:title><dc:language>${language}</dc:language><meta property="dcterms:modified">${new Date(options.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta><meta property="rendition:layout">${design==='imagebook'?'pre-paginated':'reflowable'}</meta>${design==='imagebook'?'<meta property="rendition:spread">none</meta>':''}</metadata><manifest><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  files['META-INF/container.xml'] = strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  return { mimetype: strToU8('application/epub+zip'), ...files };
}

/** Small fixture/reference writer. Device exports use chunked streaming, never this buffer. */
export function buildAlbumEpub(options: Omit<AlbumEpubOptions, 'assets'> & { assets: Record<string, EpubAsset> }): Uint8Array {
  const files = albumEpubDocuments(options);
  for (const asset of Object.values(options.assets)) files[`OEBPS/${asset.path}`] = asset.bytes;
  return zipSync({ mimetype: [files.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'mimetype')) }, { level: 0 });
}
