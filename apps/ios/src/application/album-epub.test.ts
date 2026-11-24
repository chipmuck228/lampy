import { unzipSync, strFromU8 } from 'fflate';
import { JSDOM } from 'jsdom';
import { buildAlbumEpub, type EpubAsset } from './album-epub';
import type { AlbumLayoutInput } from './album-layout-input';
const input: AlbumLayoutInput = {
  album: { id: 'private-album-id', schemaVersion: 1, name: '窗边 & <日子> 🦞', opening: '家人的声音\n原来的话', cover: { kind: 'image', momentId: 'private-record-id', assetId: 'photo' }, entries: [], createdAt: '', updatedAt: '' },
  entries: [{ momentId: 'private-record-id', collectedAt: '', sourceRevisionAtCollect: 1, presence: 'ready', revision: 1, note: '<script>alert(1)</script>\n第二行💩', feeling: '平静', occurredAtPrecision: 'unknown', recordedAt: '', media: [
    { assetId: 'photo', role: 'image', availability: 'available', intrinsicRatio: 1, durationMs: null, uri: 'file:///private/original' },
    { assetId: 'sound', role: 'audio', availability: 'available', intrinsicRatio: null, durationMs: 42000, uri: 'secret' },
  ] }],
};
const assets: Record<string, EpubAsset> = {
  photo: { path: 'media/asset-0.png', mime: 'image/png', bytes: new Uint8Array([137,80,78,71]) },
  sound: { path: 'media/asset-1.m4a', mime: 'audio/mp4', bytes: new Uint8Array([0,1,2,3]) },
};
const options = { input, assets, language: 'zh-Hans' as const, style: 'handmade' as const, id: 'edition-1', createdAt: '2026-11-21T01:02:03.000Z', dates: {} };
function files() { return unzipSync(buildAlbumEpub(options)); }
it('creates a first, uncompressed EPUB mimetype entry and valid container', () => {
  const zip = buildAlbumEpub(options);
  expect(zip[8]).toBe(0); expect(strFromU8(zip.slice(30,38))).toBe('mimetype');
  expect(strFromU8(files().mimetype)).toBe('application/epub+zip');
  expect(strFromU8(files()['META-INF/container.xml'])).toContain('OEBPS/package.opf');
});
it('all XML is well formed; all local resource references resolve', () => {
  const archive = files();
  for (const [path, bytes] of Object.entries(archive)) {
    if (!/\.(xml|opf|xhtml)$/.test(path)) continue;
    const document = new JSDOM(strFromU8(bytes), { contentType: 'application/xml' }).window.document;
    expect(document.querySelector('parsererror')).toBeNull();
    if (!path.startsWith('OEBPS/')) continue;
    for (const element of document.querySelectorAll('[href], [src]')) {
      const ref = element.getAttribute('href') || element.getAttribute('src')!;
      expect(archive[`OEBPS/${ref.split('#')[0]}`]).toBeDefined();
    }
  }
});
it('preserves text and emoji, escapes markup and excludes private paths and source identifiers', () => {
  const all = Object.values(files()).map(bytes => strFromU8(bytes)).join('');
  expect(all).toContain('&lt;script&gt;'); expect(all).toContain('💩');
  expect(all).not.toContain('private-record-id'); expect(all).not.toContain('file:///');
  expect(all).not.toContain('<script>'); expect(all).not.toContain('autoplay');
  expect(all).toContain('controls="controls"'); expect(all).toContain('0:42');
});
it('has cover, opening, contents, ordered records, and colophon; no invented exact date', () => {
  const archive = files();
  const opf = new JSDOM(strFromU8(archive['OEBPS/package.opf']), { contentType: 'application/xml' }).window.document;
  expect([...opf.querySelectorAll('spine itemref')].map(x => x.getAttribute('idref'))).toEqual(['cover','opening','record-1','archive']);
  expect(strFromU8(archive['OEBPS/record-1.xhtml'])).toContain('日子未确认');
  expect(strFromU8(archive['OEBPS/style.css'])).toContain('height:auto');
});
it('retains selected order across repeated months and supports English', () => {
  const second = { ...input.entries[0], momentId: 'second' };
  const archive = unzipSync(buildAlbumEpub({ ...options, language: 'en', input: { ...input, entries: [second, input.entries[0]] }, dates: { second: { label: 'Nov 2', chapter: 'November 2026' }, 'private-record-id': { label: 'Oct 1', chapter: 'October 2026' } } }));
  const nav = strFromU8(archive['OEBPS/nav.xhtml']);
  expect(nav.indexOf('November')).toBeLessThan(nav.indexOf('October'));
  expect(strFromU8(archive['OEBPS/record-1.xhtml'])).toContain('Listen to this moment');
});
it('fails closed for absent media, unsafe package paths and missing cover', () => {
  expect(() => buildAlbumEpub({ ...options, assets: {} })).toThrow('EPUB_MISSING_CONTENT');
  expect(() => buildAlbumEpub({ ...options, assets: { ...assets, photo: { ...assets.photo, path: '../leak.png' } } })).toThrow('EPUB_INVALID_ASSET');
  expect(() => buildAlbumEpub({ ...options, input: { ...input, album: { ...input.album, cover: { kind: 'image', assetId: 'missing', momentId: 'private-record-id' } } } })).toThrow('EPUB_MISSING_COVER');
});

it('uses reader paper, compact hierarchy and a single cover instead of duplicate front/end pages', () => {
  const archive = files();
  expect(archive['OEBPS/title.xhtml']).toBeUndefined();
  expect(archive['OEBPS/closing.xhtml']).toBeUndefined();
  const css = strFromU8(archive['OEBPS/style.css']);
  expect(css).toContain('background:transparent');
  expect(css).not.toContain('background:#f6f0e3');
  expect(css).toContain('break-after:auto');
  const cover = new JSDOM(strFromU8(archive['OEBPS/cover.xhtml']), { contentType:'application/xml' }).window.document;
  expect(cover.querySelectorAll('h1')).toHaveLength(1);
  expect(cover.querySelector('.cover-title')!.textContent).toBe(input.album.name);
});
it('lets entries in the same month flow together and keeps the colophon with the final entry', () => {
  const entries = [input.entries[0], {...input.entries[0],momentId:'second',note:'Second original'}];
  const archive = unzipSync(buildAlbumEpub({...options,input:{...input,entries}, dates:Object.fromEntries(entries.map(entry=>[entry.momentId,{label:'October 2026',chapter:'October 2026'}]))}));
  expect(archive['OEBPS/record-2.xhtml']).toBeUndefined();
  const doc = new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']),{contentType:'application/xml'}).window.document;
  expect(doc.querySelectorAll('article')).toHaveLength(2);
  expect(doc.querySelector('footer')).toBeNull();expect(archive['OEBPS/archive.xhtml']).toBeDefined();
});

it.each(['literary'] as const)('preserves all text, audio and XML in %s independently of paper style', design => {
  const archive = unzipSync(buildAlbumEpub({ ...options, design }));
  const doc = new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']), { contentType:'application/xml' }).window.document;
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.body.className).toBe(design);
  expect(doc.querySelector('.prose')!.textContent).toContain('<script>alert(1)</script>');
  expect(doc.querySelector('audio')!.getAttribute('src')).toBe('media/asset-1.m4a');
  expect(doc.querySelector('audio')!.hasAttribute('autoplay')).toBe(false);
  expect(strFromU8(archive['OEBPS/style.css'])).not.toContain('.handmade');
  expect(strFromU8(archive['OEBPS/package.opf'])).toContain('reflowable');
});
it('uses a single large image then compatible paired photos without losing or reordering media', () => {
  const record = { ...input.entries[0], media: [0,1,2].map(i=>({...input.entries[0].media[0],assetId:`p${i}`,intrinsicRatio:1.2})) };
  const photoAssets=Object.fromEntries([0,1,2].map(i=>[`p${i}`,{...assets.photo,path:`media/photo-${i}.jpg`,mime:'image/jpeg'}]));
  for(const design of ['literary'] as const) {
    const archive=unzipSync(buildAlbumEpub({...options,design,input:{...input,album:{...input.album,cover:{kind:'words'}},entries:[record]},assets:photoAssets}));
    const doc=new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']),{contentType:'application/xml'}).window.document;
    expect([...doc.querySelectorAll('img')].map(x=>x.getAttribute('src'))).toEqual([0,1,2].map(i=>`media/photo-${i}.jpg`));
    expect(doc.querySelectorAll('.photo-pair .paired')).toHaveLength(2);
    const article=doc.querySelector('article')!;
    expect(article.firstElementChild!.className).toBe('entry-head');
  }
});
it('keeps long text continuous and does not pair incompatible photo ratios', () => {
  const record={...input.entries[0],note:'完整文字。'.repeat(200),media:[0,1,2].map((i)=>({...input.entries[0].media[0],assetId:`p${i}`,intrinsicRatio:i===1?0.5:1.8}))};
  const photoAssets=Object.fromEntries([0,1,2].map(i=>[`p${i}`,{...assets.photo,path:`media/photo-${i}.jpg`,mime:'image/jpeg'}]));
  const archive=unzipSync(buildAlbumEpub({...options,design:'literary',input:{...input,album:{...input.album,cover:{kind:'words'}},entries:[record]},assets:photoAssets}));
  const doc=new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']),{contentType:'application/xml'}).window.document;
  expect(doc.querySelector('.entry-lead')).toBeNull();
  expect(doc.querySelector('.prose')!.textContent).toBe(record.note);
  expect(doc.querySelector('.photo-pair')).toBeNull();
  expect(doc.querySelectorAll('img')).toHaveLength(3);
});
it('defaults old manifests to literary and rejects unknown design values', () => {
  const archive=files();
  expect(strFromU8(archive['OEBPS/cover.xhtml'])).toContain('class="literary"');
  expect(()=>buildAlbumEpub({...options,design:'other' as never})).toThrow('EPUB_INVALID_DESIGN');
});

it('includes a minimal branded colophon and declares inline audio artwork in the manifest',()=>{
 const archive=files();const doc=new JSDOM(strFromU8(archive['OEBPS/archive.xhtml']),{contentType:'application/xml'}).window.document;
 expect(doc.querySelector('h1,dl')).toBeNull();expect(doc.querySelector('.edition-symbol')!.getAttribute('src')).toBe('lampy-symbol.svg');expect(doc.body.textContent).toContain('珍藏于');
 const opf=new JSDOM(strFromU8(archive['OEBPS/package.opf']),{contentType:'application/xml'}).window.document;
 expect(opf.querySelector('item[id="record-1"]')!.getAttribute('properties')).toBe('svg');
 expect(strFromU8(archive['OEBPS/record-1.xhtml'])).toContain('若无法播放，请换用支持声音的阅读器。');
});
it.each([[.65,1.5,1.5],[1.5,1.5],[.7,.7],[1.4,.7,1,1.6]])('composes ratios %j without omitting or reordering photographs',(...ratios)=>{
 const media=ratios.map((r,i)=>({...input.entries[0].media[0],assetId:`p${i}`,intrinsicRatio:r}));
 const photoAssets=Object.fromEntries(media.map((m,i)=>[m.assetId,{...assets.photo,path:`media/photo-${i}.jpg`,mime:'image/jpeg'}]));
 const archive=unzipSync(buildAlbumEpub({...options,input:{...input,album:{...input.album,cover:{kind:'words'}},entries:[{...input.entries[0],media}]},assets:photoAssets}));
 const doc=new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']),{contentType:'application/xml'}).window.document;
 expect([...doc.querySelectorAll('img')].map(x=>x.getAttribute('src'))).toEqual(media.map((_,i)=>`media/photo-${i}.jpg`));
 expect(doc.querySelectorAll('figcaption')).toHaveLength(0);
});
it('never groups photos across an intervening voice, and escapes long titles and attributions',()=>{
 const record={...input.entries[0],attribution:'Dad & <script>not executable</script>',media:[input.entries[0].media[0],input.entries[0].media[1],{...input.entries[0].media[0],assetId:'b'}]};
 const archive=unzipSync(buildAlbumEpub({...options,input:{...input,entries:[record]},assets:{...assets,b:{...assets.photo,path:'media/another.png'}}}));
 const doc=new JSDOM(strFromU8(archive['OEBPS/record-1.xhtml']),{contentType:'application/xml'}).window.document;
 expect([...doc.querySelectorAll('img,audio')].map(x=>x.getAttribute('src'))).toEqual(['media/asset-0.png','media/asset-1.m4a','media/another.png']);
 expect(doc.querySelector('script')).toBeNull();expect(doc.querySelector('.attribution')!.textContent).toBe(record.attribution);
 expect(doc.querySelector('.photo-pair')).toBeNull();
});

it('rejects inconsistent media types instead of publishing a broken or mislabeled asset',()=>{
 expect(()=>buildAlbumEpub({...options,assets:{...assets,photo:{...assets.photo,mime:'audio/mpeg'}}})).toThrow('EPUB_INVALID_ASSET');
 expect(()=>buildAlbumEpub({...options,assets:{...assets,sound:{...assets.sound,path:'media/voice.wav',mime:'audio/wav'}}})).toThrow('EPUB_INVALID_ASSET');
});
