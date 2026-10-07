export type AlbumPreviewPageAttempt = {
  seq: number;
  albumId: string;
  signal: { cancelled: boolean };
  requestId: number | null;
};

export function startAlbumPreviewPageAttempt(albumId: string, seq: number): AlbumPreviewPageAttempt {
  return { seq, albumId, signal: { cancelled: false }, requestId: null };
}

export function shouldContinueAlbumPreviewLoad(input: {
  seq: number;
  albumId: string;
  current: AlbumPreviewPageAttempt | null;
}): boolean {
  return (
    !!input.current &&
    !input.current.signal.cancelled &&
    input.seq === input.current.seq &&
    input.albumId === input.current.albumId
  );
}

export function abandonAlbumPreviewAttempt(attempt: AlbumPreviewPageAttempt | null): number | null {
  if (!attempt) return null;
  attempt.signal.cancelled = true;
  return attempt.requestId;
}

export function shouldApplyAlbumLayoutResult(input: {
  albumId: string;
  requestAlbumId: string;
  requestId: number;
  current: { albumId: string; requestId: number } | null;
}): boolean {
  return (
    !!input.current &&
    input.albumId === input.current.albumId &&
    input.requestAlbumId === input.albumId &&
    input.requestId === input.current.requestId
  );
}
