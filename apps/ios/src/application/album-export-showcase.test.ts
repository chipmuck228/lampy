import type { AlbumLayout, AlbumPlacedBlock } from './album-layout';
import {
  albumEditionFacts,
  albumEditionNumbers,
  albumFileSizeLabel,
  albumLeafPages,
  albumPrintFailureKind,
  albumPrintProgressCopy,
  albumPrintProgressFraction,
  albumReadyToBind,
  albumSpanLabel,
  albumSpreadCount,
  albumSpreadLabel,
  albumSpreadPages,
  styleAlbumPages,
} from './album-export-showcase';

const box = { xPt: 36, yPt: 40, widthPt: 348, heightPt: 22 };
function layout(blocks: AlbumPlacedBlock[][], moments: AlbumLayout['sourceFingerprint']['moments'] = []): AlbumLayout {
  return {
    albumId: 'book',
    layoutVersion: 'album-a5-v5',
    pageSize: { widthPt: 419.5, heightPt: 595.3 },
    margins: { topPt: 40, rightPt: 36, bottomPt: 44, leftPt: 36 },
    fonts: {} as AlbumLayout['fonts'],
    fontFaces: { serif: 'Songti SC', ui: 'PingFang SC', serifLicense: '', uiLicense: '' },
    sourceFingerprint: {
      name: 'Our days',
      opening: null,
      cover: { kind: 'words' },
      entryOrder: moments.map((moment) => moment.momentId),
      moments,
    },
    albumUpdatedAt: '2026-10-20',
    generatedAt: '2026-10-20',
    unicodeUnit: 'unicode-scalar',
    pages: blocks.map((page, index) => ({ index, blocks: page, rendering: { serif: 'S', ui: 'U', copy: {} } })),
  };
}
const ready = (momentId: string, media: AlbumLayout['sourceFingerprint']['moments'][number]['media'] = []) => ({
  momentId,
  presence: 'ready' as const,
  revision: 1,
  media,
});

it('counts real pages, moments, distinct photos and sounds from the measured layout', () => {
  const facts = albumEditionFacts(
    layout(
      [
        [{ kind: 'cover-image', albumId: 'book', momentId: 'm1', assetId: 'p1', status: 'available', intrinsicRatio: 1, box }],
        [
          { kind: 'day-rule', momentId: 'm1', dateKey: 'd:2026-9-3', text: '9月3日', box },
          { kind: 'image', momentId: 'm1', assetId: 'p1', status: 'available', intrinsicRatio: 1, box },
          { kind: 'image', momentId: 'm2', assetId: 'p2', status: 'available', intrinsicRatio: 1, box },
        ],
        [
          { kind: 'day-rule', momentId: 'm2', dateKey: 'd:2026-9-3', text: '续', continued: true, box },
          { kind: 'audio', momentId: 'm2', assetId: 's1', status: 'available', durationMs: 9000, text: '一段声音', box },
          { kind: 'day-rule', momentId: 'm3', dateKey: 'd:2026-11-2', text: '11月2日', box },
        ],
      ],
      [ready('m1'), ready('m2'), ready('m3')],
    ),
  );
  expect(facts).toEqual({
    pageCount: 3,
    recordCount: 3,
    photoCount: 2,
    soundCount: 1,
    span: { from: { year: 2026, month: 9 }, to: { year: 2026, month: 11 } },
  });
});

it('labels a span without inventing days or months', () => {
  expect(albumSpanLabel(null)).toBeNull();
  expect(albumSpanLabel({ from: { year: 2026, month: 9 }, to: { year: 2026, month: 9 } })).toBe('2026年9月');
  expect(albumSpanLabel({ from: { year: 2026, month: 9 }, to: { year: 2026, month: 11 } })).toBe('2026年9月 — 11月');
  expect(albumSpanLabel({ from: { year: 2025, month: 3 }, to: { year: 2026, month: 10 } })).toBe('2025年3月 — 2026年10月');
  expect(albumSpanLabel({ from: { year: 2025, month: null }, to: { year: 2026, month: 2 } })).toBe('2025年 — 2026年');
});

it('opens like a printed booklet: cover alone, then spreads, last page possibly alone', () => {
  expect(albumSpreadCount(0)).toBe(0);
  expect(albumSpreadCount(1)).toBe(1);
  expect(albumSpreadCount(10)).toBe(6);
  expect(albumSpreadPages(0, 10)).toEqual({ left: null, right: 0 });
  expect(albumSpreadPages(1, 10)).toEqual({ left: 1, right: 2 });
  expect(albumSpreadPages(5, 10)).toEqual({ left: 9, right: null });
  expect(albumSpreadPages(4, 9)).toEqual({ left: 7, right: 8 });
  expect(albumLeafPages(0, 10)).toEqual({ front: 0, back: 1 });
  expect(albumLeafPages(4, 9)).toEqual({ front: 8, back: null });
  expect(albumSpreadLabel(0, 10)).toBe('封面 · 共10页');
  expect(albumSpreadLabel(1, 10)).toBe('第2–3页 · 共10页');
  expect(albumSpreadLabel(5, 10)).toBe('第10页 · 共10页');
});

it('only a book the PDF path would accept is ready to bind', () => {
  const available = { assetId: 'p1', role: 'image' as const, availability: 'available' as const };
  expect(albumReadyToBind(layout([[]], [ready('m1', [available])]))).toBe(true);
  expect(albumReadyToBind(layout([[]], [{ ...ready('m1'), presence: 'missing' }]))).toBe(false);
  expect(albumReadyToBind(layout([[]], [ready('m1', [{ ...available, availability: 'missing' }])]))).toBe(false);
  expect(albumReadyToBind(layout([[]], [ready('m1', [{ ...available, role: 'unknown' }])]))).toBe(false);
});

it('restyles paper and photo borders without moving any block', () => {
  const source = layout([[{ kind: 'image', momentId: 'm1', assetId: 'p1', status: 'available', intrinsicRatio: 1, box }]]);
  const [page] = styleAlbumPages(source, 'handmade');
  expect(page.rendering).toMatchObject({ style: 'handmade', paper: '#F3ECDD', photoBorderWidth: 6, serif: 'S' });
  expect(page.blocks[0].box).toEqual(box);
});

it('progress only moves forward through the reported steps', () => {
  const steps = ['authorize', 'read', 'prepare', 'copy', 'layout', 'write', 'verify', 'bind'] as const;
  const fractions = steps.map((step) => albumPrintProgressFraction({ step, done: 0, total: 0 }));
  expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  expect(albumPrintProgressFraction({ step: 'copy', done: 3, total: 3 })).toBe(albumPrintProgressFraction({ step: 'layout', done: 0, total: 0 }));
  expect(albumPrintProgressFraction(null)).toBe(0);
  expect(albumPrintProgressCopy({ step: 'copy', done: 1, total: 4 })).toBe('收好照片与声音 2/4');
  expect(albumPrintProgressCopy({ step: 'write', done: 0, total: 0 })).toBe('印成PDF');
});

it('numbers editions by creation order and sizes files plainly', () => {
  expect(albumEditionNumbers(['2026-11-02T10:00', '2026-10-01T09:00', '2026-10-20T08:00'])).toEqual([3, 1, 2]);
  expect(albumFileSizeLabel(1024)).toBe('1 KB');
  expect(albumFileSizeLabel(2_600_000)).toBe('2.5 MB');
});

it('maps failures to plain words without exposing native detail', () => {
  expect(albumPrintFailureKind('SOURCE_CHANGED')).toBe('changed');
  expect(albumPrintFailureKind('MISSING_CONTENT')).toBe('missing');
  expect(albumPrintFailureKind('PDF_CREATE_FAILED')).toBe('other');
});
