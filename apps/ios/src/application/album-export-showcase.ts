import { appLanguage, dateLabel, monthLabel, tr } from '../i18n';
import type { AlbumLayout, AlbumPage } from './album-layout';
import type { AlbumPrintProgress } from './album-print';
import { ALBUM_READING_STYLES, type AlbumReadingStyle } from './album-reading';
import { feelingAccentColor } from './feeling-accent';

/** Facts read from the measured layout. Nothing is estimated or written for the user. */
export type AlbumEditionFacts = {
  pageCount: number;
  recordCount: number;
  photoCount: number;
  soundCount: number;
  span: AlbumEditionSpan | null;
};
type SpanEdge = { year: number; month: number | null };
export type AlbumEditionSpan = { from: SpanEdge; to: SpanEdge };

export function albumEditionFacts(layout: AlbumLayout): AlbumEditionFacts {
  const blocks = layout.pages.flatMap((page) => page.blocks);
  const photos = new Set<string>();
  const sounds = new Set<string>();
  const edges: SpanEdge[] = [];
  for (const block of blocks) {
    if (block.kind === 'image') photos.add(block.assetId);
    if (block.kind === 'audio') sounds.add(block.assetId);
    if (block.kind === 'day-rule') {
      const edge = spanEdge(block.dateKey);
      if (edge) edges.push(edge);
    }
  }
  return {
    pageCount: layout.pages.length,
    recordCount: layout.sourceFingerprint.entryOrder.length,
    photoCount: photos.size,
    soundCount: sounds.size,
    span: edges.length ? spanOf(edges) : null,
  };
}

function spanEdge(dateKey: string): SpanEdge | null {
  const match = /^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(dateKey);
  if (!match) return null;
  const month = match[3] ? Number(match[3]) : null;
  return { year: Number(match[2]), month: month && month >= 1 && month <= 12 ? month : null };
}

function spanOf(edges: SpanEdge[]): AlbumEditionSpan {
  const order = (edge: SpanEdge, missing: number) => edge.year * 100 + (edge.month ?? missing);
  const from = edges.reduce((best, edge) => (order(edge, 1) < order(best, 1) ? edge : best));
  const to = edges.reduce((best, edge) => (order(edge, 12) > order(best, 12) ? edge : best));
  return { from, to };
}

export function albumSpanLabel(span: AlbumEditionSpan | null): string | null {
  if (!span) return null;
  const { from, to } = span;
  const same = from.year === to.year && from.month === to.month;
  if (from.month == null || to.month == null) {
    return from.year === to.year ? tr('{0}年', [from.year]) : `${tr('{0}年', [from.year])} — ${tr('{0}年', [to.year])}`;
  }
  if (same) return dateLabel(from.year, from.month);
  if (from.year === to.year) {
    return appLanguage === 'en'
      ? `${monthLabel(from.month, true)} – ${dateLabel(to.year, to.month)}`
      : `${dateLabel(from.year, from.month)} — ${monthLabel(to.month)}`;
  }
  return `${dateLabel(from.year, from.month)} ${appLanguage === 'en' ? '–' : '—'} ${dateLabel(to.year, to.month)}`;
}

/** Same paper and accent the paper preview applies; geometry is untouched. */
export function styleAlbumPages(layout: AlbumLayout, style: AlbumReadingStyle): AlbumPage[] {
  return layout.pages.map((page) => ({
    ...page,
    rendering: {
      ...page.rendering!,
      style,
      paper: ALBUM_READING_STYLES[style].paper,
      photoBorderWidth: ALBUM_READING_STYLES[style].photoBorderWidth,
    },
    blocks: page.blocks.map((block) =>
      block.kind === 'feeling'
        ? { ...block, accent: block.accent ?? feelingAccentColor({ value: block.value, label: block.value, known: block.known }) }
        : block,
    ),
  }));
}

/** True when the measured book has nothing the PDF path would refuse. */
export function albumReadyToBind(layout: AlbumLayout): boolean {
  return layout.sourceFingerprint.moments.every(
    (moment) =>
      moment.presence === 'ready' &&
      moment.media.every((item) => item.role !== 'unknown' && item.availability === 'available'),
  );
}

/**
 * A printed booklet opens like this: the cover alone on the right, then
 * left/right spreads, and possibly the last page alone on the left.
 */
export function albumSpreadCount(pageCount: number): number {
  return pageCount > 0 ? Math.floor(pageCount / 2) + 1 : 0;
}

export function albumSpreadPages(spread: number, pageCount: number): { left: number | null; right: number | null } {
  const left = spread > 0 && 2 * spread - 1 < pageCount ? 2 * spread - 1 : null;
  const right = 2 * spread < pageCount ? 2 * spread : null;
  return { left, right };
}

/** Leaf k carries page 2k on its front and page 2k+1 on its back. */
export function albumLeafPages(leaf: number, pageCount: number): { front: number | null; back: number | null } {
  return {
    front: 2 * leaf < pageCount ? 2 * leaf : null,
    back: 2 * leaf + 1 < pageCount ? 2 * leaf + 1 : null,
  };
}

export function albumSpreadLabel(spread: number, pageCount: number): string {
  if (spread === 0) return tr('封面 · 共{0}页', [pageCount]);
  const { left, right } = albumSpreadPages(spread, pageCount);
  const shown = [left, right].filter((page): page is number => page != null).map((page) => page + 1);
  if (shown.length === 2) return tr('第{0}–{1}页 · 共{2}页', [shown[0], shown[1], pageCount]);
  return tr('第{0}页 · 共{1}页', [shown[0] ?? pageCount, pageCount]);
}

const STEP_START: Record<AlbumPrintProgress['step'], number> = {
  authorize: 0.03,
  read: 0.08,
  prepare: 0.14,
  copy: 0.2,
  layout: 0.52,
  write: 0.66,
  verify: 0.84,
  bind: 0.94,
};

export function albumPrintProgressFraction(progress: AlbumPrintProgress | null): number {
  if (!progress) return 0;
  if (progress.step === 'copy' && progress.total > 0) {
    return STEP_START.copy + ((STEP_START.layout - STEP_START.copy) * Math.min(progress.done, progress.total)) / progress.total;
  }
  return STEP_START[progress.step];
}

export function albumPrintProgressCopy(progress: AlbumPrintProgress | null): string {
  switch (progress?.step) {
    case 'authorize':
      return tr('核对导出权益');
    case 'read':
      return tr('读取这一册的记录');
    case 'prepare':
      return tr('备好A5纸张与字体');
    case 'copy':
      return progress.total > 0
        ? tr('收好照片与声音 {0}/{1}', [Math.min(progress.done + 1, progress.total), progress.total])
        : tr('收好照片与声音');
    case 'layout':
      return tr('逐页排版');
    case 'write':
      return tr('印成PDF');
    case 'verify':
      return tr('逐页复核');
    case 'bind':
      return tr('装订成册');
    default:
      return tr('正在装订');
  }
}

export function albumFileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return tr('{0} KB', [Math.max(1, Math.round(bytes / 1024))]);
  return tr('{0} MB', [(bytes / (1024 * 1024)).toFixed(1)]);
}

/** Edition numbers follow creation order for this album: the first PDF is edition 1. */
export function albumEditionNumbers(createdAt: string[]): number[] {
  const order = [...createdAt].map((value, index) => ({ value, index })).sort((a, b) => a.value.localeCompare(b.value));
  const numbers = new Array<number>(createdAt.length);
  order.forEach((item, position) => {
    numbers[item.index] = position + 1;
  });
  return numbers;
}

export function albumEditionDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateLabel(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export type AlbumPrintFailureCopy = 'changed' | 'missing' | 'other';
export function albumPrintFailureKind(code: string): AlbumPrintFailureCopy {
  if (code === 'SOURCE_CHANGED' || code === 'PRINT_FILE_CHANGED') return 'changed';
  if (code === 'MISSING_CONTENT' || code === 'IMAGE_UNREADABLE' || code === 'LOCAL_FILE_REQUIRED') return 'missing';
  return 'other';
}
