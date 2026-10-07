/** In-process scroll restore for the albums root. Not persisted across cold start. */
let albumListScrollY = 0;

export function rememberAlbumListScroll(offsetY: number): void {
  if (!Number.isFinite(offsetY) || offsetY < 0) return;
  albumListScrollY = offsetY;
}

export function peekAlbumListScroll(): number {
  return albumListScrollY;
}

export function resetAlbumListScrollForTests(): void {
  albumListScrollY = 0;
}
