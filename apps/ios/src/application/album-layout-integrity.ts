import type { AlbumLayout, AlbumPlacedBlock } from './album-layout';
import {
  ALBUM_CONTENT_HEIGHT_PT,
  ALBUM_CONTENT_WIDTH_PT,
  ALBUM_MARGIN_X_PT,
  ALBUM_MARGIN_TOP_PT,
  ALBUM_PAGE_HEIGHT_PT,
  ALBUM_PAGE_WIDTH_PT,
} from './album-layout';
import type { AlbumLayoutInput } from './album-layout-input';
import { albumCodePointLength, albumSliceCodePoints } from './album-unicode';

const LEFT = ALBUM_MARGIN_X_PT;
const TOP = ALBUM_MARGIN_TOP_PT;
const RIGHT = ALBUM_MARGIN_X_PT + ALBUM_CONTENT_WIDTH_PT;
const BOTTOM = ALBUM_MARGIN_TOP_PT + ALBUM_CONTENT_HEIGHT_PT;

function boxInsidePage(block: AlbumPlacedBlock): boolean {
  const { xPt, yPt, widthPt, heightPt } = block.box;
  if (xPt < -0.01 || yPt < -0.01) return false;
  if (xPt + widthPt > ALBUM_PAGE_WIDTH_PT + 0.01) return false;
  if (yPt + heightPt > ALBUM_PAGE_HEIGHT_PT + 0.01) return false;
  if (block.kind === 'cover-name' || block.kind === 'cover-image' || block.kind === 'close') return true;
  return xPt + 0.01 >= LEFT && yPt + heightPt <= BOTTOM + 0.5 && xPt + widthPt <= RIGHT + 0.5 && yPt >= TOP - 0.5;
}

export function albumLayoutIntegrity(layout: AlbumLayout, input: AlbumLayoutInput) {
  const notes: Record<string, { ranges: { start: number; end: number }[]; joined: string }> = {};
  const images = new Map<string, number>();
  const audios = new Map<string, number>();
  const unknowns = new Map<string, number>();
  const boxesOk = layout.pages.every((page) => page.blocks.every(boxInsidePage));
  for (const page of layout.pages) {
    for (const block of page.blocks) {
      if (block.kind === 'note') {
        const bucket = notes[block.momentId] ?? { ranges: [], joined: '' };
        bucket.ranges.push(block.textRange);
        bucket.joined += block.text;
        notes[block.momentId] = bucket;
        const source = input.entries.find((entry) => entry.momentId === block.momentId)?.note ?? '';
        const expected = albumSliceCodePoints(source, block.textRange.start, block.textRange.end);
        if (expected !== block.text) return { ok: false as const, reason: 'note-slice-mismatch' };
      }
      if (block.kind === 'image') {
        const key = `${block.momentId}:${block.assetId}`;
        images.set(key, (images.get(key) ?? 0) + 1);
      }
      if (block.kind === 'audio') {
        const key = `${block.momentId}:${block.assetId}`;
        audios.set(key, (audios.get(key) ?? 0) + 1);
      }
      if (block.kind === 'unknown-media') {
        const key = `${block.momentId}:${block.assetId}`;
        unknowns.set(key, (unknowns.get(key) ?? 0) + 1);
      }
    }
  }
  for (const entry of input.entries) {
    if (entry.presence !== 'ready') continue;
    if (entry.note) {
      const seen = notes[entry.momentId];
      if (!seen) return { ok: false as const, reason: 'note-missing' };
      const ordered = [...seen.ranges].sort((a, b) => a.start - b.start);
      if (ordered[0].start !== 0) return { ok: false as const, reason: 'note-gap' };
      for (let i = 1; i < ordered.length; i += 1) {
        if (ordered[i].start !== ordered[i - 1].end) return { ok: false as const, reason: 'note-overlap' };
      }
      if (ordered[ordered.length - 1].end !== albumCodePointLength(entry.note)) {
        return { ok: false as const, reason: 'note-truncated' };
      }
      if (seen.joined !== entry.note) return { ok: false as const, reason: 'note-join' };
    }
    for (const item of entry.media) {
      if (item.role === 'image' && (images.get(`${entry.momentId}:${item.assetId}`) ?? 0) !== 1) {
        return { ok: false as const, reason: 'image-count' };
      }
      if (item.role === 'audio' && (audios.get(`${entry.momentId}:${item.assetId}`) ?? 0) !== 1) {
        return { ok: false as const, reason: 'audio-count' };
      }
      if (item.role === 'unknown' && (unknowns.get(`${entry.momentId}:${item.assetId}`) ?? 0) !== 1) {
        return { ok: false as const, reason: 'unknown-count' };
      }
    }
  }
  if (!boxesOk) return { ok: false as const, reason: 'box-overflow' };
  for (const page of layout.pages) {
    const boxes = page.blocks.map((block) => block.box);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = a.xPt < b.xPt + b.widthPt - 0.5 && b.xPt < a.xPt + a.widthPt - 0.5;
        const overlapY = a.yPt < b.yPt + b.heightPt - 0.5 && b.yPt < a.yPt + a.heightPt - 0.5;
        if (overlapX && overlapY) return { ok: false as const, reason: 'box-overlap' };
      }
    }
  }
  return { ok: true as const };
}
