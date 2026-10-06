import { ALBUM_LAYOUT_VERSION, type AlbumLayout } from './album-layout';
import {
  ALBUM_ISOL_PROBE_ALBUM_ID,
  ALBUM_ISOL_PROBE_LAYOUT,
  isIsolAlbumLayoutFixture,
  shouldStartAlbumPreviewProbe,
  writeIsolAlbumPreviewProbe,
} from './album-preview-probe';

const isolLayout = {
  albumId: ALBUM_ISOL_PROBE_ALBUM_ID,
  layoutVersion: ALBUM_LAYOUT_VERSION,
  pageSize: { widthPt: 420, heightPt: 595 },
  margins: { topPt: 40, rightPt: 36, bottomPt: 44, leftPt: 36 },
  fonts: {
    coverName: { family: 'album-serif', sizePt: 28, lineHeightPt: 36, color: '#25231F' },
    body: { family: 'album-serif', sizePt: 17, lineHeightPt: 32, color: '#25231F' },
    date: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#53604F' },
    meta: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#5C5851' },
  },
  fontFaces: { serif: 'Songti SC', ui: 'PingFang SC', serifLicense: '', uiLicense: '' },
  sourceFingerprint: {
    name: '隔离册',
    opening: null,
    cover: { kind: 'words' as const },
    entryOrder: ['moment_album_eval_m01'],
    moments: [],
  },
  albumUpdatedAt: '2026-10-04T00:00:00.000Z',
  generatedAt: '2026-10-04T00:00:00.000Z',
  unicodeUnit: 'unicode-scalar' as const,
  pages: [],
} as AlbumLayout;

describe('album preview probe gate', () => {
  it('rejects a personal album even in development with an explicit tap', () => {
    expect(
      shouldStartAlbumPreviewProbe({
        isDev: true,
        explicit: true,
        locked: false,
        cancelled: false,
        albumId: 'album_1',
        layoutAlbumId: 'album_1',
        entryOrder: ['m1'],
      }),
    ).toBe(false);
  });

  it('requires the synthetic isol id and eval moment ids', () => {
    expect(
      isIsolAlbumLayoutFixture({
        albumId: ALBUM_ISOL_PROBE_ALBUM_ID,
        entryOrder: ['moment_album_eval_m01', 'moment_album_eval_m02'],
      }),
    ).toBe(true);
    expect(
      isIsolAlbumLayoutFixture({
        albumId: ALBUM_ISOL_PROBE_ALBUM_ID,
        entryOrder: ['moment_personal'],
      }),
    ).toBe(false);
  });

  it('does not start unless the operator asked, and skips cancel or lock', () => {
    const ready = {
      isDev: true,
      explicit: true,
      locked: false,
      cancelled: false,
      albumId: ALBUM_ISOL_PROBE_ALBUM_ID,
      layoutAlbumId: ALBUM_ISOL_PROBE_ALBUM_ID,
      entryOrder: ['moment_album_eval_m01'],
    };
    expect(shouldStartAlbumPreviewProbe(ready)).toBe(true);
    expect(shouldStartAlbumPreviewProbe({ ...ready, explicit: false })).toBe(false);
    expect(shouldStartAlbumPreviewProbe({ ...ready, cancelled: true })).toBe(false);
    expect(shouldStartAlbumPreviewProbe({ ...ready, locked: true })).toBe(false);
    expect(shouldStartAlbumPreviewProbe({ ...ready, isDev: false })).toBe(false);
  });
});

describe('album preview probe writes', () => {
  it('does not write after cancel or lock before the first file', async () => {
  const writeAsStringAsync = jest.fn(async (_uri: string, _contents: string) => undefined);
  const writePdf = jest.fn(async () => ({ pageCount: 0 }));
    const result = await writeIsolAlbumPreviewProbe({
      layout: isolLayout,
      media: {},
      files: { documentDirectory: 'file:///documents/', writeAsStringAsync },
      writePdf,
      isStillCurrent: () => false,
    });
    expect(result).toBe('skipped');
    expect(writeAsStringAsync).not.toHaveBeenCalled();
    expect(writePdf).not.toHaveBeenCalled();
  });

  it('stops before PDF if the attempt is abandoned after the layout file', async () => {
    const writeAsStringAsync = jest.fn(async (_uri: string, _contents: string) => undefined);
    const writePdf = jest.fn(async () => ({ pageCount: 1 }));
    let live = true;
    const result = await writeIsolAlbumPreviewProbe({
      layout: isolLayout,
      media: {},
      files: {
        documentDirectory: 'file:///documents/',
        writeAsStringAsync: async (uri: string, contents: string) => {
          await writeAsStringAsync(uri, contents);
          live = false;
        },
      },
      writePdf,
      isStillCurrent: () => live,
    });
    expect(result).toBe('skipped');
    expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(String(writeAsStringAsync.mock.calls[0]?.[0] ?? '')).toContain(ALBUM_ISOL_PROBE_LAYOUT);
    expect(writePdf).not.toHaveBeenCalled();
  });
});
