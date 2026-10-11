import { paginateAlbumLayout } from './album-paginate';
import { createGlyphWidthMeasurer } from './album-text-measure';
import { albumLayoutIntegrity } from './album-layout-integrity';
import { fingerprintsEqual, ALBUM_LAYOUT_VERSION } from './album-layout';
import { albumPreviewSpokenItems } from './album-preview-speech';
import { albumCollectingLabel, albumEntryCountLabel, albumMediaHint, normalizeAlbumName } from './life-album';
import type { AlbumLayoutInput } from './album-layout-input';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
const original = '孩子在窗边。 A day of rain. 😀 '.repeat(80);
function fixture(): AlbumLayoutInput {
  return {
    album: { id:'album_en', schemaVersion:1, name:'小禾的一年', opening:'原来的开篇。My own opening.', cover:{kind:'words'}, entries:[], createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'},
    entries:[{momentId:'m_en',collectedAt:'2026-10-01T00:00:00Z',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:original,feeling:'平静',occurredAt:'2026-10-01T08:00:00Z',occurredAtPrecision:'day',recordedAt:'2026-10-01T09:00:00Z',media:[{assetId:'aud',role:'audio',availability:'available',intrinsicRatio:null,durationMs:5000}]}],
  };
}
it('localizes UI counts and defaults without renaming an existing album', () => {
  expect(normalizeAlbumName('小禾的一年')).toBe('小禾的一年');
  expect(normalizeAlbumName('')).toBe('Some days');
  expect(albumEntryCountLabel(1)).toBe('1 moment');
  expect(albumEntryCountLabel(2)).toBe('2 moments');
  expect(albumMediaHint({photoCount:1,hasAudio:true})).toBe('Has photos · Has audio');
  expect(albumMediaHint({photoCount:2,hasAudio:false})).toBe('2 photos');
  expect(albumCollectingLabel('孩子')).toBe('Collecting in “孩子”');
});
it('measures an English edition with original Chinese / English source content intact', async () => {
  const input=fixture();
  const before=JSON.stringify(input);
  const layout=await paginateAlbumLayout(input,createGlyphWidthMeasurer(),{generatedAt:'2026-10-08T00:00:00Z',timezone:{timeZone:'UTC'}});
  expect(JSON.stringify(input)).toBe(before);
  expect(albumLayoutIntegrity(layout,input)).toEqual({ok:true});
  expect(layout.language).toBe('en');
  expect(layout.layoutVersion).toBe(ALBUM_LAYOUT_VERSION);
  expect(layout.fontFaces.serif).toBe('Georgia');
  expect(layout.fontFaces.ui).toBe('HelveticaNeue');
  const blocks=layout.pages.flatMap(p=>p.blocks);
  expect(blocks.find(b=>b.kind==='cover-name')).toMatchObject({text:'小禾的一年'});
  expect(blocks.filter(b=>b.kind==='note').map(b=>'text' in b?b.text:'').join('') === original).toBe(true);
  expect(blocks.find(b=>b.kind==='day-rule')).toMatchObject({text:'Oct 1, 2026'});
  expect(blocks.some(b=>b.kind==='day-rule'&&b.text.includes('continued'))).toBe(true);
  expect(blocks.find(b=>b.kind==='audio')).toMatchObject({text:'Audio · 5 sec'});
  expect(blocks.find(b=>b.kind==='feeling')).toMatchObject({value:'Calm',known:true});
  for(const page of layout.pages) {
    expect(page.rendering?.serif).toBe(layout.fontFaces.serif);
    expect(page.rendering?.copy.imageMissing).toBe('This photo is unavailable right now.');
  }
  expect(fingerprintsEqual(layout.sourceFingerprint,{...layout.sourceFingerprint,language:'zh-Hans'})).toBe(false);
  expect(fingerprintsEqual(layout.sourceFingerprint,{...layout.sourceFingerprint,fontPolicy:'other-font'})).toBe(false);
});
it('preserves precision and unknown words in spoken paper content', async () => {
  const input=fixture();input.entries[0].occurredAtPrecision='unknown';input.entries[0].feeling='当时独有的词';input.entries[0].note='One line.';
  const layout=await paginateAlbumLayout(input,createGlyphWidthMeasurer(),{generatedAt:'2026-10-08T00:00:00Z',timezone:{timeZone:'UTC'}});
  const blocks=layout.pages.flatMap(p=>p.blocks);
  expect(blocks.some(b=>b.kind==='day-rule')).toBe(false);
  expect(blocks.find(b=>b.kind==='recorded-at')).toMatchObject({label:'Date uncertain · Recorded Oct 1, 2026'});
  expect(albumPreviewSpokenItems(blocks).map(b=>b.label)).toContain('当时独有的词');
  expect(input.entries[0].feeling).toBe('当时独有的词');
});
