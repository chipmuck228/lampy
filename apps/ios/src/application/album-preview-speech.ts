import { feelingLabel, tr } from '../i18n';
import {
  ALBUM_IMAGE_MISSING,
  ALBUM_SOURCE_CHANGED,
  ALBUM_SOURCE_GONE,
  ALBUM_SOURCE_UNREADABLE,
  type AlbumPlacedBlock,
} from './album-layout';

export type AlbumPreviewSpokenItem = {
  kind: AlbumPlacedBlock['kind'];
  label: string;
};

export function albumPreviewSpokenText(block: AlbumPlacedBlock): string | null {
  switch (block.kind) {
    case 'audio':
      return null;
    case 'cover-name':
    case 'opening':
    case 'note':
    case 'close':
    case 'day-rule':
      return block.text;
    case 'cover-image':
      return block.status === 'available' ? tr("封面照片") : ALBUM_IMAGE_MISSING;
    case 'image':
      return block.status === 'available' ? tr("一张照片") : ALBUM_IMAGE_MISSING;
    case 'unknown-media':
      return block.label;
    case 'feeling':
      return block.known ? feelingLabel(block.value) : block.value;
    case 'recorded-at':
      return block.label;
    case 'source-gone':
      return ALBUM_SOURCE_GONE;
    case 'source-unreadable':
      return ALBUM_SOURCE_UNREADABLE;
    case 'source-changed':
      return ALBUM_SOURCE_CHANGED;
    default:
      return null;
  }
}

export function albumPreviewSpokenItems(blocks: AlbumPlacedBlock[]): AlbumPreviewSpokenItem[] {
  const items: AlbumPreviewSpokenItem[] = [];
  for (const block of blocks) {
    const label = albumPreviewSpokenText(block);
    if (label) items.push({ kind: block.kind, label });
  }
  return items;
}
