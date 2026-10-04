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
