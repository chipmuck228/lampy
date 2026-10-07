import type { AlbumLayoutInput } from './album-layout-input';
import { albumLayoutIntegrity } from './album-layout-integrity';
import { paginateAlbumLayout } from './album-paginate';
import { createGlyphWidthMeasurer, spaceForWrappedChunk } from './album-text-measure';
import { albumCodePointLength } from './album-unicode';
import type { LifeAlbum } from './life-album';

const clock = { timeZone: 'UTC' };

function album(partial?: Partial<LifeAlbum>): LifeAlbum {
  return {
    id: 'album_1',
    schemaVersion: 1,
    name: '一些日子',
    opening: null,
    cover: { kind: 'words' },
    entries: [],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    ...partial,
  };
}

function input(entries: AlbumLayoutInput['entries'], extra?: Partial<LifeAlbum>): AlbumLayoutInput {
  return {
    album: album({
      entries: entries.map((entry) => ({
        momentId: entry.momentId,
        collectedAt: entry.collectedAt,
        sourceRevisionAtCollect: entry.sourceRevisionAtCollect,
      })),
      ...extra,
    }),
    entries,
  };
}

function ready(partial: Partial<AlbumLayoutInput['entries'][number]> & { momentId: string }): AlbumLayoutInput['entries'][number] {
  return {
    collectedAt: '2026-10-01T00:00:00.000Z',
    sourceRevisionAtCollect: 1,
    presence: 'ready',
    revision: 1,
    note: '',
    feeling: '',
    occurredAt: '2026-10-01T08:00:00.000Z',
    occurredAtPrecision: 'day',
    recordedAt: '2026-10-01T09:00:00.000Z',
    media: [],
    ...partial,
  };
}

describe('album layout pagination', () => {
  const measurer = createGlyphWidthMeasurer();

  it('covers the original note once across pages without breaking scalars', async () => {
    const note = `${'春日庭院里的风。'.repeat(80)}😀${'还要再写一段。'.repeat(40)}`;
    const fixture = input([ready({ momentId: 'm1', note })]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    expect(albumLayoutIntegrity(layout, fixture)).toEqual({ ok: true });
    expect(layout.pages.length).toBeGreaterThan(3);
    expect(note).toContain('😀');
    expect(albumCodePointLength('😀')).toBe(1);
  });

  it('keeps image, audio, and unknown media once each', async () => {
    const fixture = input([
      ready({
        momentId: 'm1',
        note: '门口的风。',
        media: [
          { assetId: 'img', role: 'image', availability: 'available', intrinsicRatio: 1.5, durationMs: null },
          { assetId: 'aud', role: 'audio', availability: 'available', intrinsicRatio: null, durationMs: 3400 },
          { assetId: 'unk', role: 'unknown', availability: 'unreadable', intrinsicRatio: null, durationMs: null },
        ],
      }),
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    expect(albumLayoutIntegrity(layout, fixture)).toEqual({ ok: true });
  });

  it('scales a very tall image to one page and does not crop the box ratio', async () => {
    const fixture = input([
      ready({
        momentId: 'm1',
        note: '极长图',
        media: [{ assetId: 'tall', role: 'image', availability: 'available', intrinsicRatio: 0.2, durationMs: null }],
      }),
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const image = layout.pages.flatMap((page) => page.blocks).find((block) => block.kind === 'image');
    expect(image?.kind).toBe('image');
    if (image?.kind === 'image') {
      expect(image.box.heightPt).toBeLessThanOrEqual(511);
      expect(image.box.widthPt / image.box.heightPt).toBeCloseTo(0.2, 3);
    }
  });

  it('prints year and month without inventing a day, and unknown time uses recorded-at', async () => {
    const fixture = input([
      ready({
        momentId: 'year',
        note: '那年',
        occurredAt: '2020-06-01T00:00:00.000Z',
        occurredAtPrecision: 'year',
      }),
      ready({
        momentId: 'month',
        note: '那月',
        occurredAt: '2021-03-01T00:00:00.000Z',
        occurredAtPrecision: 'month',
      }),
      ready({
        momentId: 'unknown',
        note: '未确认',
        occurredAt: undefined,
        occurredAtPrecision: 'unknown',
        recordedAt: '2022-08-09T00:00:00.000Z',
      }),
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const texts = layout.pages.flatMap((page) => page.blocks).map((block) => {
      if ('text' in block) return block.text;
      if ('label' in block) return block.label;
      return '';
    });
    expect(texts.some((text) => text === '2020年')).toBe(true);
    expect(texts.some((text) => text === '2021年3月')).toBe(true);
    expect(texts.some((text) => text.includes('发生时间未确认') && text.includes('2022年8月9日'))).toBe(true);
    expect(texts.some((text) => text.includes('2020年6月'))).toBe(false);
  });

  it('reprints a date when the same day returns after another day', async () => {
    const fixture = input([
      ready({ momentId: 'a', note: '一', occurredAt: '2026-10-01T00:00:00.000Z' }),
      ready({ momentId: 'b', note: '二', occurredAt: '2026-10-02T00:00:00.000Z' }),
      ready({ momentId: 'c', note: '三', occurredAt: '2026-10-01T00:00:00.000Z' }),
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const dates = layout.pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'day-rule')
      .map((block) => (block.kind === 'day-rule' ? block.text : ''));
    expect(dates.filter((text) => text === '2026年10月1日')).toHaveLength(2);
  });

  it('keeps missing moments as gone and unreadable as a read failure', async () => {
    const fixture = input([
      {
        momentId: 'gone',
        collectedAt: '2026-10-01T00:00:00.000Z',
        sourceRevisionAtCollect: 1,
        presence: 'missing',
        revision: null,
        note: '',
        feeling: '',
        occurredAtPrecision: 'unknown',
        recordedAt: '2026-10-01T00:00:00.000Z',
        media: [],
      },
      {
        momentId: 'bad',
        collectedAt: '2026-10-01T00:00:00.000Z',
        sourceRevisionAtCollect: 1,
        presence: 'unreadable',
        revision: null,
        note: '',
        feeling: '',
        occurredAtPrecision: 'unknown',
        recordedAt: '2026-10-01T00:00:00.000Z',
        media: [],
      },
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const kinds = layout.pages.flatMap((page) => page.blocks.map((block) => block.kind));
    expect(kinds).toContain('source-gone');
    expect(kinds).toContain('source-unreadable');
  });

  it('prints a human continued date instead of the internal key', async () => {
    const note = '春日庭院里的风。'.repeat(120);
    const fixture = input([ready({ momentId: 'm1', note })]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const continued = layout.pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'day-rule' && block.continued)
      .map((block) => (block.kind === 'day-rule' ? block.text : ''));
    expect(continued.some((text) => text.includes('2026年10月1日') && text.includes('续'))).toBe(true);
    expect(continued.some((text) => text.startsWith('d:'))).toBe(false);
  });

  it('prints one date for adjacent same-day records and keeps audio-only with its date', async () => {
    const fixture = input([
      ready({ momentId: 'a', note: '一', occurredAt: '2026-10-01T00:00:00.000Z' }),
      ready({ momentId: 'b', note: '二', occurredAt: '2026-10-01T03:00:00.000Z' }),
      ready({
        momentId: 'c',
        note: '',
        occurredAt: '2026-10-03T00:00:00.000Z',
        media: [{ assetId: 'aud', role: 'audio', availability: 'available', intrinsicRatio: null, durationMs: 4100 }],
      }),
    ]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const dates = layout.pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'day-rule' && !block.continued)
      .map((block) => (block.kind === 'day-rule' ? block.text : ''));
    expect(dates.filter((text) => text === '2026年10月1日')).toHaveLength(1);
    expect(dates).toContain('2026年10月3日');
    expect(albumLayoutIntegrity(layout, fixture)).toEqual({ ok: true });
  });

  it('skips opening when empty and still ends with a close page', async () => {
    const fixture = input([ready({ momentId: 'm1', note: '短句' })]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    expect(layout.pages[0].blocks.some((block) => block.kind === 'cover-name')).toBe(true);
    expect(layout.pages.some((page) => page.blocks.some((block) => block.kind === 'opening'))).toBe(false);
    expect(layout.pages[layout.pages.length - 1].blocks.some((block) => block.kind === 'close')).toBe(true);
  });

  it('keeps a continued date with at least one body line inside the page', async () => {
    expect(
      spaceForWrappedChunk({ remainingPt: 50, lineHeightPt: 32, continuedHeightPt: 22 }).commit,
    ).toBe(true);
    expect(
      spaceForWrappedChunk({ remainingPt: 80, lineHeightPt: 32, continuedHeightPt: 22 }).commit,
    ).toBe(false);
    const note = '春日庭院里的风，还要再写一段。'.repeat(40);
    const fixture = input([ready({ momentId: 'm1', note })]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    expect(albumLayoutIntegrity(layout, fixture)).toEqual({ ok: true });
    for (const page of layout.pages) {
      const continued = page.blocks.find((block) => block.kind === 'day-rule' && block.continued);
      if (!continued || continued.kind !== 'day-rule') continue;
      const notes = page.blocks.filter((block) => block.kind === 'note');
      expect(notes.length).toBeGreaterThan(0);
      expect(continued.box.yPt + continued.box.heightPt).toBeLessThanOrEqual(511 + 40);
      expect(notes[0].box.yPt).toBeGreaterThanOrEqual(continued.box.yPt + continued.box.heightPt - 0.5);
    }
  });

  it('records typographic width and baseline on placed lines', async () => {
    const fixture = input([ready({ momentId: 'm1', note: 'Hello，世界。😀  punctuation: “引号”' })]);
    const layout = await paginateAlbumLayout(fixture, measurer, {
      generatedAt: '2026-10-04T00:00:00.000Z',
      timezone: clock,
    });
    const note = layout.pages.flatMap((page) => page.blocks).find((block) => block.kind === 'note');
    expect(note?.kind).toBe('note');
    if (note?.kind === 'note') {
      expect(note.lines[0].baselineYPt).toBeGreaterThan(note.lines[0].yPt);
      expect(note.lines[0].widthPt).toBeGreaterThan(0);
    }
  });
});
