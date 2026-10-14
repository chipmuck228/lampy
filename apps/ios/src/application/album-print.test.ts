import {
  printFailureDiagnostic,
  createAlbumPrintService,
  isAlbumPrintEvaluationOpen,
  type PrintStore,
} from './album-print';
import { paginateAlbumLayout } from './album-paginate';
import { createGlyphWidthMeasurer } from './album-text-measure';
import type { AlbumLayoutInput } from './album-layout-input';
import type { AlbumFontDiagnosis } from '../../modules/lampy-album-layout';
const fixture: AlbumLayoutInput = {
  album: {
    id: 'book',
    schemaVersion: 1,
    name: '私人的册子',
    opening: '开篇',
    cover: { kind: 'words' },
    entries: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  },
  entries: [
    {
      momentId: 'm1',
      presence: 'ready',
      revision: 1,
      sourceRevisionAtCollect: 1,
      collectedAt: '2026-10-01',
      note: '全文\n🥣不改写',
      feeling: '',
      occurredAtPrecision: 'unknown',
      recordedAt: '2026-10-01T00:00:00Z',
      media: [
        {
          assetId: 'p1',
          role: 'image',
          availability: 'available',
          uri: 'file:///private/photo.jpg',
          intrinsicRatio: 1,
          durationMs: null,
          widthPx: 80,
          heightPx: 80,
        },
        {
          assetId: 'a1',
          role: 'audio',
          availability: 'available',
          uri: 'file:///private/sound.m4a',
          intrinsicRatio: null,
          durationMs: 8000,
        },
      ],
    },
  ],
};
function setup(nextId: () => string = () => 'print_one') {
  let active = true;
  const read = jest.fn(
    async () => JSON.parse(JSON.stringify(fixture)) as AlbumLayoutInput,
  );
  const store: PrintStore = {
    begin: jest.fn(async () => undefined),
    copy: jest.fn(async (_id, assetId, _source, index) => ({
      assetId,
      file: `media-${index}`,
      uri: `/staging/media-${index}`,
      sha256: 'hash',
      bytes: 10,
    })),
    verifySource: jest.fn(async () => undefined),
    writePdf: jest.fn(async (_id, layout) => ({
      pageCount: layout.pages.length,
      bytes: 100,
      widthPt: layout.pageSize.widthPt,
      heightPt: layout.pageSize.heightPt,
      fontsEmbedded: null,
      fontResources: [],
      textSelectable: true,
      fontRunNames: ['ActualFallback'],
      sha256: 'pdf-hash',
    })),
    writeManifest: jest.fn(async () => undefined),
    commit: jest.fn(async () => ({ pdfUri: 'file:///saved/album.pdf' })),
    discard: jest.fn(async () => undefined),
  };
  const fonts = {
    serif: { fontName: 'ActualFallback' },
    ui: { fontName: 'ActualUI' },
  } as AlbumFontDiagnosis;
  const service = createAlbumPrintService({
    read,
    fonts: () => fonts,
    store,
    current: () => active,
    id: nextId,
    now: () => '2026-10-14',
    layout: (input) =>
      paginateAlbumLayout(input, createGlyphWidthMeasurer(), {
        generatedAt: '2026-10-14',
        timezone: { timeZone: 'UTC' },
      }),
  });
  return {
    service,
    store,
    read,
    cancel: () => {
      active = false;
    },
  };
}
it('is default off and remains unavailable in Release even with the evaluation flag', () => {
  expect(isAlbumPrintEvaluationOpen(true, undefined)).toBe(false);
  expect(isAlbumPrintEvaluationOpen(false, '1')).toBe(false);
  expect(isAlbumPrintEvaluationOpen(true, '1')).toBe(true);
});
it('saves a standalone frozen snapshot with relative media and honest font status', async () => {
  const { service, store } = setup();
  const result = await service.save('handmade');
  expect(result.manifest.content.entries[0].note).toBe(fixture.entries[0].note);
  expect(result.manifest.media).toHaveLength(2);
  expect(JSON.stringify(result.manifest)).not.toContain('file:///private');
  expect(result.manifest.pdf.fontsEmbedded).toBeNull();
  expect(
    result.manifest.imageDpi.some(
      (image) => image.dpi !== null && image.dpi < 300,
    ),
  ).toBe(true);
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.discard).not.toHaveBeenCalled();
  expect(fixture.entries[0].media[0].uri).toBe('file:///private/photo.jpg');
});
it('blocks missing media before staging', async () => {
  const { service, read, store } = setup();
  read.mockResolvedValue({
    ...fixture,
    entries: [{ ...fixture.entries[0], presence: 'missing' }],
  });
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'MISSING_CONTENT',
  });
  expect(store.begin).not.toHaveBeenCalled();
});
it('cleans staged files if source edits while generating', async () => {
  const { service, read, store } = setup();
  read.mockResolvedValueOnce(fixture).mockResolvedValueOnce({
    ...fixture,
    album: { ...fixture.album, name: '后来改了' },
  });
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'SOURCE_CHANGED',
  });
  expect(store.commit).not.toHaveBeenCalled();
  expect(store.discard).toHaveBeenCalledWith('print_one');
});
it('cleans output when media byte verification fails', async () => {
  const { service, store } = setup();
  (store.verifySource as jest.Mock).mockRejectedValue(
    new Error('SOURCE_CHANGED'),
  );
  await expect(service.save('plain')).rejects.toThrow('SOURCE_CHANGED');
  expect(store.discard).toHaveBeenCalled();
  expect(store.commit).not.toHaveBeenCalled();
});
it('rejects a reopened PDF with missing selectable text', async () => {
  const { service, store } = setup();
  const original = store.writePdf;
  store.writePdf = async (...args) => ({
    ...(await original(...args)),
    textSelectable: false,
  });
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'INVALID_PDF',
  });
  expect(store.discard).toHaveBeenCalled();
});
it('a lock during copy rejects completion and cleans files', async () => {
  const { service, store, cancel } = setup();
  const original = store.copy;
  store.copy = async (...args) => {
    const result = await original(...args);
    cancel();
    return result;
  };
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'CANCELLED',
  });
  expect(store.discard).toHaveBeenCalled();
  expect(store.writePdf).not.toHaveBeenCalled();
});
it('cancellation during commit removes the completed folder as well', async () => {
  const { service, store, cancel } = setup();
  store.commit = async () => {
    cancel();
    return { pdfUri: 'file:///saved/album.pdf' };
  };
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'CANCELLED',
  });
  expect(store.discard).toHaveBeenCalledWith('print_one');
});
it('repeated submits cannot start another copy job', async () => {
  const { service, store } = setup();
  const first = service.save('plain');
  await expect(service.save('plain')).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  await first;
  expect(store.commit).toHaveBeenCalledTimes(1);
});

it('repeated generation after appending records produces a new frozen edition', async () => {
  let count = 0;
  const { service, read, store } = setup(() => `print_${++count}`);
  const first = await service.save('plain');
  const expanded = JSON.parse(JSON.stringify(fixture)) as AlbumLayoutInput;
  expanded.entries.push({
    ...expanded.entries[0],
    momentId: 'm2',
    note: '后来收入的新记录',
    media: [],
  });
  expanded.album.updatedAt = '2026-10-15';
  read.mockResolvedValue(expanded);
  const second = await service.save('plain');
  expect(first.manifest.id).not.toBe(second.manifest.id);
  expect(first.manifest.content.entries).toHaveLength(1);
  expect(second.manifest.content.entries).toHaveLength(2);
  expect(store.commit).toHaveBeenCalledTimes(2);
});
it('a new album can generate independently after a prior album finished', async () => {
  const first = setup(() => 'print_first');
  await first.service.save('plain');
  const second = setup(() => 'print_second');
  second.read.mockResolvedValue({
    ...fixture,
    album: { ...fixture.album, id: 'book2', name: '新册' },
  });
  const result = await second.service.save('handmade');
  expect(result.manifest.albumId).toBe('book2');
  expect(result.manifest.name).toBe('新册');
  expect(first.store.discard).not.toHaveBeenCalled();
});
it('PDF text check failure includes its stage and a safe fixed reason', async () => {
  const { service, store } = setup();
  const original = store.writePdf;
  store.writePdf = async (...args) => ({
    ...(await original(...args)),
    textSelectable: false,
  });
  try {
    await service.save('plain');
    throw new Error('expected failure');
  } catch (caught) {
    expect(printFailureDiagnostic(caught)).toEqual({
      stage: 'PDF_CHECK',
      code: 'INVALID_PDF',
      reason: 'PDF_TEXT',
    });
  }
});
it('diagnostics never copy a private native error message or path', () => {
  expect(
    printFailureDiagnostic(
      new Error('private note at /private/user/media.jpg'),
      'COPY_MEDIA',
    ),
  ).toEqual({ stage: 'COPY_MEDIA', code: 'PRINT_OPERATION_FAILED' });
});

it('retains a fixed native error code behind an exception prefix without copying the message', () => {
  expect(printFailureDiagnostic(new Error('Native exception: PDF_REOPEN_FAILED'), 'WRITE_PDF')).toEqual({ stage: 'WRITE_PDF', code: 'PDF_REOPEN_FAILED' });
});
