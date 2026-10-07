import { albumSliceCodePoints, albumCodePointLength } from './album-unicode';
import { shouldApplyAlbumLayoutResult, startAlbumPreviewPageAttempt, abandonAlbumPreviewAttempt, shouldContinueAlbumPreviewLoad } from './album-layout-request';
import { albumPdfProbeVerdict, compareAlbumPdfProbe } from './album-pdf-probe';
import { canOpenAlbumPreview, ALBUM_LAYOUT_VERSION, ALBUM_PAGE_HEIGHT_PT, ALBUM_PAGE_WIDTH_PT, type AlbumLayout } from './album-layout';

describe('album unicode scalars', () => {
  it('counts emoji as one scalar and slices without splitting it', () => {
    const text = '风😀雨';
    expect(albumCodePointLength(text)).toBe(3);
    expect(albumSliceCodePoints(text, 1, 2)).toBe('😀');
    expect(albumSliceCodePoints(text, 0, 3)).toBe(text);
  });
});

describe('album layout request generations', () => {
  it('drops a late result after the target album or request changes', () => {
    expect(
      shouldApplyAlbumLayoutResult({
        albumId: 'b',
        requestAlbumId: 'a',
        requestId: 1,
        current: { albumId: 'b', requestId: 1 },
      }),
    ).toBe(false);
    expect(
      shouldApplyAlbumLayoutResult({
        albumId: 'a',
        requestAlbumId: 'a',
        requestId: 1,
        current: { albumId: 'a', requestId: 2 },
      }),
    ).toBe(false);
    expect(
      shouldApplyAlbumLayoutResult({
        albumId: 'a',
        requestAlbumId: 'a',
        requestId: 2,
        current: { albumId: 'a', requestId: 2 },
      }),
    ).toBe(true);
  });

  it('drops a delayed service fetch after switch or cancel-reopen before begin', () => {
    const first = startAlbumPreviewPageAttempt('album_a', 1);
    const second = startAlbumPreviewPageAttempt('album_b', 2);
    expect(
      shouldContinueAlbumPreviewLoad({ seq: 1, albumId: 'album_a', current: second }),
    ).toBe(false);
    expect(
      shouldContinueAlbumPreviewLoad({ seq: 2, albumId: 'album_b', current: second }),
    ).toBe(true);
    expect(abandonAlbumPreviewAttempt(first)).toBeNull();
    expect(
      shouldContinueAlbumPreviewLoad({ seq: 1, albumId: 'album_a', current: first }),
    ).toBe(false);
    const reopened = startAlbumPreviewPageAttempt('album_a', 3);
    expect(
      shouldContinueAlbumPreviewLoad({ seq: 1, albumId: 'album_a', current: reopened }),
    ).toBe(false);
    expect(
      shouldContinueAlbumPreviewLoad({ seq: 3, albumId: 'album_a', current: reopened }),
    ).toBe(true);
    first.requestId = 7;
    expect(abandonAlbumPreviewAttempt(first)).toBe(7);
  });
});

describe('album preview eligibility', () => {
  it('opens preview only after a record is collected', () => {
    expect(canOpenAlbumPreview(0)).toBe(false);
    expect(canOpenAlbumPreview(1)).toBe(true);
  });
});

describe('album pdf probe verdict', () => {
  it('stays NOT VERIFIED when system fonts are not embedded', () => {
    const layout: AlbumLayout = {
      albumId: 'album_1',
      layoutVersion: ALBUM_LAYOUT_VERSION,
      pageSize: { widthPt: ALBUM_PAGE_WIDTH_PT, heightPt: ALBUM_PAGE_HEIGHT_PT },
      margins: { topPt: 40, rightPt: 36, bottomPt: 44, leftPt: 36 },
      fonts: {
        coverName: { family: 'album-serif', sizePt: 28, lineHeightPt: 36, color: '#25231F' },
        body: { family: 'album-serif', sizePt: 17, lineHeightPt: 32, color: '#25231F' },
        date: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#53604F' },
        meta: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#5C5851' },
      },
      fontFaces: { serif: 'Songti SC', ui: 'PingFang SC', serifLicense: '', uiLicense: '' },
      sourceFingerprint: {
        name: '一些日子',
        opening: null,
        cover: { kind: 'words' },
        entryOrder: [],
        moments: [],
      },
      albumUpdatedAt: '2026-10-04T00:00:00.000Z',
      generatedAt: '2026-10-04T00:00:00.000Z',
      unicodeUnit: 'unicode-scalar',
      pages: [{ index: 0, blocks: [] }],
    };
    const match = compareAlbumPdfProbe(layout, { pageCount: 1, fontsEmbedded: false });
    expect(match.pageCount).toBe(true);
    expect(match.boxes).toBe(false);
    expect(albumPdfProbeVerdict({ fontsEmbedded: false }, match)).toBe('NOT VERIFIED');
    expect(albumPdfProbeVerdict({ fontsEmbedded: null }, match)).toBe('NOT VERIFIED');
    expect(albumPdfProbeVerdict({ fontsEmbedded: true }, match)).toBe('NOT VERIFIED');
  });
});
