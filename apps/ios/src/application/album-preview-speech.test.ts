import { ALBUM_IMAGE_MISSING, ALBUM_SOURCE_GONE } from './album-layout';
import { albumPreviewSpokenItems } from './album-preview-speech';

describe('album preview spoken reading order', () => {
  it('reads date, body, media description and feeling, and skips audio for the hit control', () => {
    expect(
      albumPreviewSpokenItems([
        {
          kind: 'day-rule',
          momentId: 'm1',
          dateKey: '2024-09-03',
          text: '9月3日',
          box: { xPt: 36, yPt: 40, widthPt: 348, heightPt: 22 },
        },
        {
          kind: 'note',
          momentId: 'm1',
          revision: 1,
          text: '楼下的风比昨天软。',
          textRange: { start: 0, end: 9, unit: 'unicode-scalar' },
          lines: [],
          box: { xPt: 36, yPt: 62, widthPt: 348, heightPt: 32 },
        },
        {
          kind: 'image',
          momentId: 'm1',
          assetId: 'img',
          status: 'available',
          intrinsicRatio: 1,
          box: { xPt: 36, yPt: 100, widthPt: 200, heightPt: 120 },
        },
        {
          kind: 'audio',
          momentId: 'm1',
          assetId: 'aud',
          status: 'available',
          durationMs: 1000,
          text: '一段声音 · 1秒',
          box: { xPt: 36, yPt: 230, widthPt: 348, heightPt: 48 },
        },
        {
          kind: 'feeling',
          momentId: 'm1',
          value: '平静',
          known: true,
          box: { xPt: 36, yPt: 286, widthPt: 348, heightPt: 22 },
        },
        {
          kind: 'source-gone',
          momentId: 'm2',
          box: { xPt: 36, yPt: 320, widthPt: 348, heightPt: 22 },
        },
        {
          kind: 'image',
          momentId: 'm3',
          assetId: 'missing',
          status: 'missing',
          intrinsicRatio: null,
          box: { xPt: 36, yPt: 350, widthPt: 200, heightPt: 80 },
        },
      ]).map((item) => item.label),
    ).toEqual(['9月3日', '楼下的风比昨天软。', '一张照片', '平静', ALBUM_SOURCE_GONE, ALBUM_IMAGE_MISSING]);
  });
});
