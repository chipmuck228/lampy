import * as SecureStore from 'expo-secure-store';
import type {
  AlbumReadingPosition,
  AlbumReadingStyle,
} from '../application/album-reading';

function key(id: string) {
  return `lampy.album-reading.v1.${Array.from(id)
    .map((char) => char.codePointAt(0)!.toString(16))
    .join('-')}`;
}
export async function readAlbumReadingState(
  id: string,
): Promise<{
  style: AlbumReadingStyle;
  position: AlbumReadingPosition | null;
}> {
  await writes.catch(() => undefined);
  const raw = await SecureStore.getItemAsync(key(id));
  if (!raw) return { style: 'plain', position: null };
  const state = JSON.parse(raw);
  const style = state.style === 'handmade' ? 'handmade' : 'plain';
  const p = state.position;
  const valid =
    p?.version === 1 &&
    typeof p.fingerprint === 'string' &&
    Number.isFinite(p.width) &&
    p.width > 0 &&
    Number.isFinite(p.y) &&
    p.y >= 0 &&
    Number.isFinite(p.within) &&
    p.within >= 0 &&
    (p.anchor === null || typeof p.anchor === 'string') &&
    (p.style === 'plain' || p.style === 'handmade');
  return { style, position: valid ? p : null };
}
// Serialize writes, so a late earlier save cannot overwrite a newer position/style.
let writes = Promise.resolve();
export function saveAlbumReadingState(
  id: string,
  style: AlbumReadingStyle,
  position: AlbumReadingPosition | null,
): Promise<void> {
  const next = writes
    .catch(() => undefined)
    .then(() =>
      SecureStore.setItemAsync(key(id), JSON.stringify({ style, position })),
    );
  writes = next;
  return next;
}
