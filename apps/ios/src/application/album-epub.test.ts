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
  expect([...opf.querySelectorAll('spine itemref')].map(x => x.getAttribute('idref'))).toEqual(['cover','title','opening','nav','record-1','closing']);
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
