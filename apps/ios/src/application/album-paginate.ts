import {
  calendarPartsAt,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import { isFeelingWord } from './feeling-accent';
import {
  ALBUM_AUDIO_LABEL,
  ALBUM_AUDIO_MISSING,
  ALBUM_CLOSE_TEXT,
  ALBUM_CONTENT_HEIGHT_PT,
  ALBUM_CONTENT_WIDTH_PT,
  ALBUM_CONTINUED,
  ALBUM_FONTS,
  ALBUM_LAYOUT_VERSION,
  ALBUM_MARGIN_BOTTOM_PT,
  ALBUM_MARGIN_TOP_PT,
  ALBUM_MARGIN_X_PT,
  ALBUM_PAGE_HEIGHT_PT,
  ALBUM_PAGE_WIDTH_PT,
  ALBUM_RECORD_GAP_PT,
  ALBUM_SERIF_FONT,
  ALBUM_SERIF_LICENSE,
  ALBUM_TIME_UNKNOWN,
  ALBUM_UI_FONT,
  ALBUM_UI_LICENSE,
  type AlbumLayout,
  type AlbumPage,
  type AlbumPlacedBlock,
  type AlbumSourceFingerprint,
  type AlbumTextLine,
} from './album-layout';
import type { AlbumLayoutInput, AlbumLayoutRecordInput } from './album-layout-input';
import { albumBodyRole, albumCoverRole, albumDateRole, albumMetaRole, spaceForWrappedChunk, type AlbumTextMeasurer } from './album-text-measure';
import { albumSliceCodePoints } from './album-unicode';
import type { LifeAlbum } from './life-album';
import { diagnoseAlbumFonts } from '../../modules/lampy-album-layout';

function albumResolvedFontFaces(): Pick<AlbumLayout['fontFaces'], 'resolvedSerif' | 'resolvedUi'> {
  const diagnosis = diagnoseAlbumFonts();
  if (!diagnosis) return {};
  return {
    resolvedSerif: {
      requested: diagnosis.serif.requested,
      familyName: diagnosis.serif.familyName,
      fontName: diagnosis.serif.fontName,
      matchedRequestedFamily: diagnosis.serif.matchedRequestedFamily,
      usedSystemFallback: diagnosis.serif.usedSystemFallback,
    },
    resolvedUi: {
      requested: diagnosis.ui.requested,
      familyName: diagnosis.ui.familyName,
      fontName: diagnosis.ui.fontName,
      matchedRequestedFamily: diagnosis.ui.matchedRequestedFamily,
      usedSystemFallback: diagnosis.ui.usedSystemFallback,
    },
  };
}

const CONTENT_TOP = ALBUM_MARGIN_TOP_PT;
const CONTENT_LEFT = ALBUM_MARGIN_X_PT;
const CONTENT_BOTTOM = ALBUM_MARGIN_TOP_PT + ALBUM_CONTENT_HEIGHT_PT;

function durationLabel(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return '';
  const total = Math.round(durationMs / 1000);
  if (total < 60) return `${total}秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function dateKeyAndLabel(record: AlbumLayoutRecordInput, clock: HistoryClock) {
  const precision = record.occurredAtPrecision || 'unknown';
  if (precision === 'unknown' || !record.occurredAt) return { key: null as string | null, label: null as string | null };
  const millis = parseMillis(record.occurredAt);
  if (millis == null) return { key: null, label: null };
  const parts = calendarPartsAt(millis, clock);
  if (precision === 'year') return { key: `y:${parts.year}`, label: `${parts.year}年` };
  if (precision === 'month') return { key: `m:${parts.year}-${parts.month}`, label: `${parts.year}年${parts.month}月` };
  return {
    key: `d:${parts.year}-${parts.month}-${parts.day}`,
    label: `${parts.year}年${parts.month}月${parts.day}日`,
  };
}

function recordedLabel(record: AlbumLayoutRecordInput, clock: HistoryClock): string | null {
  const millis = parseMillis(record.recordedAt);
  if (millis == null) return null;
  const parts = calendarPartsAt(millis, clock);
  return `记录于 ${parts.year}年${parts.month}月${parts.day}日`;
}

function imageSize(ratio: number | null, maxHeightPt = ALBUM_CONTENT_HEIGHT_PT) {
  const safe = ratio && ratio > 0 ? ratio : 1;
  const maxHeight = Math.max(48, Math.min(maxHeightPt, ALBUM_CONTENT_HEIGHT_PT));
  let widthPt = ALBUM_CONTENT_WIDTH_PT;
  let heightPt = widthPt / safe;
  if (heightPt > maxHeight) {
    heightPt = maxHeight;
    widthPt = heightPt * safe;
  }
  return { widthPt, heightPt };
}

export function fingerprintFromInput(album: LifeAlbum, input: AlbumLayoutInput): AlbumSourceFingerprint {
  return {
    name: album.name,
    opening: album.opening,
    cover: album.cover,
    entryOrder: input.entries.map((entry) => entry.momentId),
    moments: input.entries.map((entry) => ({
      momentId: entry.momentId,
      presence: entry.presence,
      revision: entry.revision,
      media: entry.media.map((item) => ({
        assetId: item.assetId,
        role: item.role,
        availability: item.availability,
      })),
    })),
  };
}

export async function paginateAlbumLayout(
  input: AlbumLayoutInput,
  measurer: AlbumTextMeasurer,
  options: { generatedAt: string; timezone: HistoryClock },
): Promise<AlbumLayout> {
  const pages: AlbumPage[] = [];
  let blocks: AlbumPlacedBlock[] = [];
  let y = CONTENT_TOP;
  let printedDateKey: string | null = null;
  let printedDateLabel: string | null = null;
  const album = input.album;

  function commitPage() {
    if (!blocks.length) return;
    pages.push({ index: pages.length, blocks });
    blocks = [];
    y = CONTENT_TOP;
  }

  function remaining() {
    return CONTENT_BOTTOM - y;
  }

  function startPageIfNeeded(needed: number) {
    if (blocks.length > 0 && remaining() < needed) commitPage();
  }

  function place(block: AlbumPlacedBlock, heightPt: number) {
    startPageIfNeeded(heightPt);
    const next = { ...block, box: { ...block.box, yPt: y } };
    blocks.push(next);
    y += heightPt;
  }

  async function placeWrapped(
    kind: 'cover-name' | 'opening' | 'note',
    text: string,
    extra: { albumId?: string; momentId?: string; revision?: number },
  ) {
    const role = kind === 'cover-name' ? albumCoverRole : albumBodyRole;
    const measured = await measurer.measure(text, role, ALBUM_CONTENT_WIDTH_PT);
    let cursor = 0;
    let firstChunk = true;
    while (cursor < measured.length) {
      const needsContinued = kind === 'note' && !firstChunk && !!extra.momentId && !!printedDateKey;
      const continuedHeight = needsContinued ? albumDateRole.lineHeightPt : 0;
      if (
        blocks.length > 0 &&
        spaceForWrappedChunk({
          remainingPt: remaining(),
          lineHeightPt: role.lineHeightPt,
          continuedHeightPt: blocks.some((block) => block.kind === 'day-rule') ? 0 : continuedHeight,
        }).commit
      ) {
        commitPage();
      }
      if (needsContinued && extra.momentId && printedDateKey && !blocks.some((block) => block.kind === 'day-rule')) {
        if (remaining() < albumDateRole.lineHeightPt + role.lineHeightPt) commitPage();
        blocks.push({
          kind: 'day-rule',
          momentId: extra.momentId,
          dateKey: printedDateKey,
          text: `${printedDateLabel ?? printedDateKey} · ${ALBUM_CONTINUED}`,
          continued: true,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumDateRole.lineHeightPt },
        });
        y += albumDateRole.lineHeightPt;
      }
      if (remaining() < role.lineHeightPt) {
        if (blocks.length > 0) commitPage();
      }
      const room = Math.floor(remaining() / role.lineHeightPt);
      const take = Math.min(Math.max(room, 0), measured.length - cursor);
      if (take < 1) {
        if (blocks.length > 0) {
          commitPage();
          continue;
        }
        break;
      }
      const chunk = measured.slice(cursor, cursor + take);
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const slice = albumSliceCodePoints(text, start, end);
      const lines: AlbumTextLine[] = chunk.map((line, index) => ({
        start: line.start - start,
        end: line.end - start,
        xPt: CONTENT_LEFT,
        yPt: y + index * role.lineHeightPt,
        widthPt: line.widthPt,
        heightPt: line.heightPt,
        baselineYPt: y + index * role.lineHeightPt + line.ascentPt,
      }));
      const height = take * role.lineHeightPt;
      const box = { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: height };
      const range = { start, end, unit: 'unicode-scalar' as const };
      if (kind === 'note' && extra.momentId && extra.revision != null) {
        blocks.push({ kind, box, text: slice, textRange: range, lines, momentId: extra.momentId, revision: extra.revision });
      } else if (kind === 'opening' && extra.albumId) {
        blocks.push({ kind, box, text: slice, textRange: range, lines, albumId: extra.albumId });
      } else if (kind === 'cover-name' && extra.albumId) {
        blocks.push({ kind, box, text: slice, textRange: range, lines, albumId: extra.albumId });
      }
      y += height;
      cursor += take;
      firstChunk = false;
    }
  }

  const nameY = album.cover.kind === 'image' ? CONTENT_TOP + ALBUM_CONTENT_HEIGHT_PT * 0.55 + 16 : CONTENT_TOP + 72;
  if (album.cover.kind === 'image') {
    const cover = album.cover;
    const coverMedia = input.entries
      .find((entry) => entry.momentId === cover.momentId)
      ?.media.find((item) => item.assetId === cover.assetId);
    const size = imageSize(coverMedia?.intrinsicRatio ?? 1.4);
    const imageHeight = Math.min(size.heightPt, ALBUM_CONTENT_HEIGHT_PT * 0.55);
    const imageWidth = imageHeight * (size.widthPt / size.heightPt);
    blocks.push({
      kind: 'cover-image',
      albumId: album.id,
      momentId: cover.momentId,
      assetId: cover.assetId,
      status: coverMedia?.availability === 'available' ? 'available' : 'missing',
      intrinsicRatio: coverMedia?.intrinsicRatio ?? null,
      box: {
        xPt: CONTENT_LEFT + (ALBUM_CONTENT_WIDTH_PT - imageWidth) / 2,
        yPt: CONTENT_TOP,
        widthPt: imageWidth,
        heightPt: imageHeight,
      },
    });
  }
  y = nameY;
  await placeWrapped('cover-name', album.name, { albumId: album.id });
  commitPage();

  if (album.opening) {
    await placeWrapped('opening', album.opening, { albumId: album.id });
    commitPage();
  }

  for (const record of input.entries) {
    if (record.presence === 'missing') {
      place(
        {
          kind: 'source-gone',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt + ALBUM_RECORD_GAP_PT,
      );
      continue;
    }
    if (record.presence === 'unreadable') {
      place(
        {
          kind: 'source-unreadable',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt + ALBUM_RECORD_GAP_PT,
      );
      continue;
    }

    const dated = dateKeyAndLabel(record, options.timezone);
    const showDate = !!dated.key && dated.key !== printedDateKey;
    if (showDate && remaining() < albumDateRole.lineHeightPt + albumBodyRole.lineHeightPt * 2) commitPage();
    if (showDate && dated.key && dated.label) {
      place(
        {
          kind: 'day-rule',
          momentId: record.momentId,
          dateKey: dated.key,
          text: dated.label,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumDateRole.lineHeightPt },
        },
        albumDateRole.lineHeightPt,
      );
      printedDateKey = dated.key;
      printedDateLabel = dated.label;
    }

    const images = record.media.filter((item) => item.role === 'image');
    if (record.note) {
      await placeWrapped('note', record.note, { momentId: record.momentId, revision: record.revision ?? 0 });
    }

    for (const image of images) {
      if (blocks.length > 0 && remaining() < 80 && blocks[blocks.length - 1]?.kind !== 'day-rule') {
        commitPage();
      }
      const size = imageSize(image.intrinsicRatio, remaining() - 8);
      blocks.push({
        kind: 'image',
        momentId: record.momentId,
        assetId: image.assetId,
        status: image.availability === 'available' ? 'available' : 'missing',
        intrinsicRatio: image.intrinsicRatio,
        box: { xPt: CONTENT_LEFT, yPt: y, widthPt: size.widthPt, heightPt: size.heightPt },
      });
      y += size.heightPt + 8;
    }

    for (const audio of record.media.filter((item) => item.role === 'audio')) {
      const time = durationLabel(audio.durationMs);
      const missing = audio.availability !== 'available';
      place(
        {
          kind: 'audio',
          momentId: record.momentId,
          assetId: audio.assetId,
          status: audio.availability,
          durationMs: audio.durationMs,
          text: missing
            ? `${ALBUM_AUDIO_MISSING}${time ? ` · ${time}` : ''}`
            : `${ALBUM_AUDIO_LABEL}${time ? ` · ${time}` : ''}`,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: 48 },
        },
        48,
      );
    }

    for (const unknown of record.media.filter((item) => item.role === 'unknown')) {
      place(
        {
          kind: 'unknown-media',
          momentId: record.momentId,
          assetId: unknown.assetId,
          label: '还有一种现在打不开的媒介。',
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (record.feeling.trim()) {
      place(
        {
          kind: 'feeling',
          momentId: record.momentId,
          value: record.feeling.trim(),
          known: isFeelingWord(record.feeling.trim()),
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (!dated.key) {
      const recorded = recordedLabel(record, options.timezone);
      place(
        {
          kind: 'recorded-at',
          momentId: record.momentId,
          label: recorded ? `${ALBUM_TIME_UNKNOWN} · ${recorded}` : ALBUM_TIME_UNKNOWN,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (record.revision != null && record.revision !== record.sourceRevisionAtCollect) {
      place(
        {
          kind: 'source-changed',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }
    y += ALBUM_RECORD_GAP_PT;
  }

  commitPage();
  y = CONTENT_TOP + 80;
  place(
    {
      kind: 'close',
      text: ALBUM_CLOSE_TEXT,
      box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: ALBUM_FONTS.body.lineHeightPt },
    },
    ALBUM_FONTS.body.lineHeightPt,
  );
  commitPage();

  return {
    albumId: album.id,
    layoutVersion: ALBUM_LAYOUT_VERSION,
    pageSize: { widthPt: ALBUM_PAGE_WIDTH_PT, heightPt: ALBUM_PAGE_HEIGHT_PT },
    margins: {
      topPt: ALBUM_MARGIN_TOP_PT,
      rightPt: ALBUM_MARGIN_X_PT,
      bottomPt: ALBUM_MARGIN_BOTTOM_PT,
      leftPt: ALBUM_MARGIN_X_PT,
    },
    fonts: ALBUM_FONTS,
    fontFaces: {
      serif: ALBUM_SERIF_FONT,
      ui: ALBUM_UI_FONT,
      serifLicense: ALBUM_SERIF_LICENSE,
      uiLicense: ALBUM_UI_LICENSE,
      ...albumResolvedFontFaces(),
    },
    sourceFingerprint: fingerprintFromInput(album, input),
    albumUpdatedAt: album.updatedAt,
    generatedAt: options.generatedAt,
    unicodeUnit: 'unicode-scalar',
    pages,
  };
}
